"""
pdp_setup.py
─────────────────────────────────────────────────────────────────────────────
Creates Personalized Data Permissions (PDP) policies on the SpecialtyPulse
output DataSet via the Domo API.

What this does:
  1. Reads pdp_config.csv — the source of truth for user → role → filter
  2. Resolves Domo user IDs from email addresses via the Users API
  3. Creates one PDP policy per unique filter value combination
  4. Assigns users to their policies
  5. Handles All Rows policies for finance_admin and executive roles

Critical: Apply PDP to the OUTPUT DataSet (DataFlow output), NOT the input.
  Input:  specialtypulse_mart_reimbursement_trends  ← NO PDP here
  Output: specialtypulse_specialty_benchmarks       ← PDP applied here

See PDP_DESIGN.md for the full security model and the explanation of why
PDP on DataFlow inputs silently fails.

Usage:
  python domo/pdp/pdp_setup.py

Environment variables (or Databricks Secrets):
  DOMO_CLIENT_ID       — from Domo Admin > Security > Access Tokens
  DOMO_CLIENT_SECRET   — from Domo Admin > Security > Access Tokens
  DOMO_DATASET_ID      — the OUTPUT DataSet ID (DataFlow output)
─────────────────────────────────────────────────────────────────────────────
"""

import csv
import json
import os
import sys
import requests
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ── CONFIG ────────────────────────────────────────────────────────────────────

CLIENT_ID     = os.getenv("DOMO_CLIENT_ID")
CLIENT_SECRET = os.getenv("DOMO_CLIENT_SECRET")
DATASET_ID    = os.getenv("DOMO_DATASET_ID")

CONFIG_FILE   = os.path.join(os.path.dirname(__file__), "pdp_config.csv")
API_HOST      = "https://api.domo.com"

if not all([CLIENT_ID, CLIENT_SECRET, DATASET_ID]):
    print("ERROR: Set DOMO_CLIENT_ID, DOMO_CLIENT_SECRET, and DOMO_DATASET_ID")
    print("  export DOMO_CLIENT_ID=your-id")
    print("  export DOMO_CLIENT_SECRET=your-secret")
    print("  export DOMO_DATASET_ID=your-output-dataset-id")
    sys.exit(1)


# ── DOMO API CLIENT ───────────────────────────────────────────────────────────

class DomoClient:
    """Minimal Domo API client for PDP operations."""

    def __init__(self, client_id: str, client_secret: str):
        self.base = API_HOST
        self.token = self._authenticate(client_id, client_secret)
        self.headers = {
            "Authorization": f"bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _authenticate(self, client_id: str, client_secret: str) -> str:
        """OAuth2 client credentials flow."""
        resp = requests.get(
            f"{self.base}/oauth/token",
            params={"grant_type": "client_credentials", "scope": "data user"},
            auth=(client_id, client_secret),
            timeout=30,
        )
        resp.raise_for_status()
        token = resp.json().get("access_token")
        print(f"✓ Authenticated to Domo API")
        return token

    def get_users(self, limit: int = 500) -> list:
        """Fetch all users in the Domo instance."""
        resp = requests.get(
            f"{self.base}/v1/users",
            headers=self.headers,
            params={"limit": limit, "offset": 0},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def get_pdp_policies(self, dataset_id: str) -> list:
        """Fetch existing PDP policies for a DataSet."""
        resp = requests.get(
            f"{self.base}/v1/datasets/{dataset_id}/policies",
            headers=self.headers,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def delete_pdp_policy(self, dataset_id: str, policy_id: int) -> None:
        """Delete a PDP policy."""
        resp = requests.delete(
            f"{self.base}/v1/datasets/{dataset_id}/policies/{policy_id}",
            headers=self.headers,
            timeout=30,
        )
        resp.raise_for_status()

    def create_pdp_policy(self, dataset_id: str, policy: dict) -> dict:
        """Create a new PDP policy."""
        resp = requests.post(
            f"{self.base}/v1/datasets/{dataset_id}/policies",
            headers=self.headers,
            json=policy,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()

    def update_pdp_policy(self, dataset_id: str, policy_id: int, policy: dict) -> dict:
        """Update an existing PDP policy."""
        resp = requests.put(
            f"{self.base}/v1/datasets/{dataset_id}/policies/{policy_id}",
            headers=self.headers,
            json=policy,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()


# ── LOAD CONFIG ───────────────────────────────────────────────────────────────

def load_config(path: str) -> list[dict]:
    """Load pdp_config.csv and return list of row dicts."""
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    print(f"✓ Loaded {len(rows)} entries from {path}")
    return rows


def build_email_to_user_id(domo: DomoClient) -> dict:
    """Build a mapping of email → Domo user ID."""
    users = domo.get_users()
    mapping = {u["email"].lower(): u["id"] for u in users if u.get("email")}
    print(f"✓ Found {len(mapping)} users in Domo instance")
    return mapping


# ── POLICY BUILDERS ───────────────────────────────────────────────────────────

def build_specialty_policy(
    policy_name: str,
    specialty: str,
    user_ids: list[int],
) -> dict:
    """
    Build a PDP policy that filters rows where provider_specialty = specialty.

    Domo PDP policy structure:
    {
      "name": "policy name",
      "type": "user",
      "users": [user_id_1, user_id_2],
      "filters": [
        {
          "column": "provider_specialty",
          "values": ["Dermatology"],
          "operator": "EQUALS",
          "not": false
        }
      ]
    }
    """
    return {
        "name": policy_name,
        "type": "user",
        "users": user_ids,
        "filters": [
            {
                "column": "provider_specialty",
                "values": [specialty],
                "operator": "EQUALS",
                "not": False,
            }
        ],
    }


def build_regional_policy(
    policy_name: str,
    states: list[str],
    user_ids: list[int],
) -> dict:
    """
    Build a PDP policy that filters rows where provider_state is in the list.

    For multi-value filters, each state gets its own filter entry with OR logic.
    Domo treats multiple values in the same filter as OR conditions.
    """
    return {
        "name": policy_name,
        "type": "user",
        "users": user_ids,
        "filters": [
            {
                "column": "provider_state",
                "values": states,    # Domo treats this list as OR: state IN (states)
                "operator": "EQUALS",
                "not": False,
            }
        ],
    }


def build_all_rows_policy(
    policy_name: str,
    user_ids: list[int],
) -> dict:
    """
    Build an All Rows policy — no filter, user sees everything.
    Used for finance_admin and executive roles.

    Note: Domo's All Rows policy uses type="open" with no filters.
    This is different from a filter policy with no conditions.
    """
    return {
        "name": policy_name,
        "type": "open",           # "open" = All Rows in Domo API
        "users": user_ids,
        "filters": [],
    }


# ── MAIN SETUP ────────────────────────────────────────────────────────────────

def setup_pdp(dataset_id: str, config: list[dict], email_to_id: dict, domo: DomoClient) -> None:
    """
    Create all PDP policies based on config.

    Strategy:
      1. Group config rows by role + filter_values (one policy per unique filter)
      2. Collect all user IDs for each group
      3. Delete existing policies (clean slate)
      4. Create new policies from config
    """

    # ── STEP 1: Resolve email → user ID ──────────────────────────────────────
    resolved = []
    missing = []

    for row in config:
        email = row["email"].lower()
        user_id = email_to_id.get(email)
        if user_id:
            resolved.append({**row, "user_id": user_id})
        else:
            missing.append(email)
            print(f"  WARNING: User not found in Domo: {email}")

    if missing:
        print(f"\n  {len(missing)} users not found. They won't be added to policies.")
        print("  Add them to your Domo instance first, then re-run.\n")

    # ── STEP 2: Group into policy buckets ─────────────────────────────────────
    # Key: (role, filter_dimension, filter_values) → list of user IDs
    policy_buckets = defaultdict(list)

    for row in resolved:
        key = (row["role"], row["filter_dimension"], row["filter_values"])
        policy_buckets[key].append(row["user_id"])

    print(f"✓ {len(policy_buckets)} distinct PDP policies to create")

    # ── STEP 3: Delete existing policies (clean slate) ────────────────────────
    existing = domo.get_pdp_policies(dataset_id)
    if existing:
        print(f"  Deleting {len(existing)} existing policies...")
        for policy in existing:
            domo.delete_pdp_policy(dataset_id, policy["id"])
        print(f"  ✓ Cleared existing policies")

    # ── STEP 4: Create new policies ───────────────────────────────────────────
    created = []

    for (role, filter_dim, filter_vals), user_ids in policy_buckets.items():

        # All Rows policy (finance_admin, executive)
        if filter_dim == "ALL_ROWS":
            policy_name = f"all_rows_{role}"
            policy_body = build_all_rows_policy(policy_name, user_ids)
            result = domo.create_pdp_policy(dataset_id, policy_body)
            created.append(result)
            print(f"  ✓ Created All Rows policy '{policy_name}' — {len(user_ids)} users")
            continue

        # Specialty filter
        if filter_dim == "provider_specialty":
            policy_name = f"specialty_{filter_vals.lower().replace(' ', '_')}"
            policy_body = build_specialty_policy(policy_name, filter_vals, user_ids)
            result = domo.create_pdp_policy(dataset_id, policy_body)
            created.append(result)
            print(f"  ✓ Created specialty policy '{policy_name}' — {len(user_ids)} users, filter: {filter_vals}")
            continue

        # Regional (state) filter
        if filter_dim == "provider_state":
            states = [s.strip() for s in filter_vals.split(",")]
            region = _infer_region_name(states)
            policy_name = f"region_{region}"
            policy_body = build_regional_policy(policy_name, states, user_ids)
            result = domo.create_pdp_policy(dataset_id, policy_body)
            created.append(result)
            print(f"  ✓ Created regional policy '{policy_name}' — {len(user_ids)} users, {len(states)} states")
            continue

        print(f"  WARNING: Unknown filter_dimension '{filter_dim}' — skipping")

    print(f"\n✓ PDP setup complete — {len(created)} policies created on DataSet {dataset_id}")
    print(f"  Verify in Domo: Data Center > {dataset_id} > Edit > PDP")


def _infer_region_name(states: list[str]) -> str:
    """Infer region name from state list for policy naming."""
    region_map = {
        frozenset(["CT","ME","MA","NH","NJ","NY","PA","RI","VT"]): "northeast",
        frozenset(["AL","AR","FL","GA","KY","LA","MS","NC","SC","TN","VA","WV"]): "southeast",
        frozenset(["IL","IN","IA","KS","MI","MN","MO","NE","ND","OH","SD","WI"]): "midwest",
        frozenset(["AZ","NM","OK","TX"]): "southwest",
        frozenset(["AK","CA","CO","HI","ID","MT","NV","OR","UT","WA","WY"]): "west",
    }
    key = frozenset(states)
    return region_map.get(key, "_".join(sorted(states)[:3]))


# ── ENTRY POINT ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("SpecialtyPulse PDP Setup")
    print("=" * 50)
    print(f"Target DataSet: {DATASET_ID}")
    print()

    domo = DomoClient(CLIENT_ID, CLIENT_SECRET)
    config = load_config(CONFIG_FILE)
    email_to_id = build_email_to_user_id(domo)

    setup_pdp(DATASET_ID, config, email_to_id, domo)
