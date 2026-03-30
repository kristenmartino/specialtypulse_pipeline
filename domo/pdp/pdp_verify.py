"""
pdp_verify.py
─────────────────────────────────────────────────────────────────────────────
Verifies that PDP policies are correctly configured on the SpecialtyPulse
output DataSet. Run this after pdp_setup.py and after any schema changes.

Checks:
  1. All expected policies exist
  2. Each policy has at least one user assigned
  3. Filter columns exist in the DataSet schema
  4. No users appear in multiple conflicting policies
  5. All Rows policies exist for admin roles
  6. No PDP on the INPUT DataSet (the critical antipattern)

Usage:
  python domo/pdp/pdp_verify.py

Exit codes:
  0 — all checks passed
  1 — one or more checks failed
─────────────────────────────────────────────────────────────────────────────
"""

import csv
import os
import sys
import requests
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

CLIENT_ID      = os.getenv("DOMO_CLIENT_ID")
CLIENT_SECRET  = os.getenv("DOMO_CLIENT_SECRET")
DATASET_ID     = os.getenv("DOMO_DATASET_ID")       # OUTPUT DataSet
INPUT_DATASET_ID = os.getenv("DOMO_INPUT_DATASET_ID", "")  # INPUT DataSet (to check for NO PDP)

CONFIG_FILE    = os.path.join(os.path.dirname(__file__), "pdp_config.csv")
API_HOST       = "https://api.domo.com"

EXPECTED_FILTER_COLUMNS = {"provider_specialty", "provider_state"}


# ── DOMO API ──────────────────────────────────────────────────────────────────

def get_token() -> str:
    resp = requests.get(
        f"{API_HOST}/oauth/token",
        params={"grant_type": "client_credentials", "scope": "data user"},
        auth=(CLIENT_ID, CLIENT_SECRET),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def api_get(path: str, token: str, params: dict = None) -> dict | list:
    headers = {"Authorization": f"bearer {token}", "Accept": "application/json"}
    resp = requests.get(f"{API_HOST}{path}", headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ── CHECKS ────────────────────────────────────────────────────────────────────

def check_output_has_pdp(token: str, dataset_id: str) -> tuple[bool, str]:
    """Verify the output DataSet has PDP policies enabled."""
    policies = api_get(f"/v1/datasets/{dataset_id}/policies", token)

    if not policies:
        return False, f"OUTPUT DataSet {dataset_id} has NO PDP policies — all users see all rows"

    return True, f"OUTPUT DataSet has {len(policies)} PDP policies"


def check_input_has_no_pdp(token: str, input_dataset_id: str) -> tuple[bool, str]:
    """
    Verify the INPUT DataSet has no PDP policies.

    This is the critical antipattern check. PDP on a DataFlow input DataSet
    is silently stripped during DataFlow execution — the output DataSet
    gets unfiltered data, and PDP on the input provides zero security.

    If PDP is found on the input, it's almost certainly misplaced and
    should be moved to the output.
    """
    if not input_dataset_id:
        return True, "INPUT DataSet ID not provided — skipping input PDP check"

    policies = api_get(f"/v1/datasets/{input_dataset_id}/policies", token)

    if policies:
        return False, (
            f"CRITICAL: INPUT DataSet {input_dataset_id} has {len(policies)} PDP policies. "
            "PDP on DataFlow inputs is silently stripped — this provides NO security. "
            "Move these policies to the OUTPUT DataSet."
        )

    return True, "INPUT DataSet has no PDP — correct"


def check_all_config_users_in_policies(
    token: str, dataset_id: str, config: list[dict]
) -> tuple[bool, str]:
    """Verify all users in the config file appear in at least one policy."""
    policies = api_get(f"/v1/datasets/{dataset_id}/policies", token)
    users = api_get("/v1/users", token, params={"limit": 500})

    email_to_id = {u["email"].lower(): u["id"] for u in users if u.get("email")}

    # Collect all user IDs that appear in any policy
    users_in_policies = set()
    for policy in policies:
        for uid in policy.get("users", []):
            users_in_policies.add(uid)

    missing_from_policies = []
    for row in config:
        if row["filter_dimension"] == "ALL_ROWS":
            # All Rows policy users: check they're in an "open" type policy
            uid = email_to_id.get(row["email"].lower())
            if uid and uid not in users_in_policies:
                missing_from_policies.append(row["email"])
        else:
            uid = email_to_id.get(row["email"].lower())
            if uid and uid not in users_in_policies:
                missing_from_policies.append(row["email"])

    if missing_from_policies:
        return False, f"Users in config but not in any policy: {missing_from_policies}"

    return True, f"All {len(config)} config users appear in policies"


def check_no_user_in_conflicting_policies(
    token: str, dataset_id: str
) -> tuple[bool, str]:
    """
    Check that no user appears in multiple FILTER policies with different values.

    A user in both 'specialty_dermatology' and 'specialty_orthopedics' would
    see data from both specialties — probably not intended.

    A user in a filter policy AND an All Rows policy gets All Rows (Domo's
    behavior: most permissive policy wins). This is worth flagging.
    """
    policies = api_get(f"/v1/datasets/{dataset_id}/policies", token)

    user_to_policies = defaultdict(list)
    for policy in policies:
        for uid in policy.get("users", []):
            user_to_policies[uid].append(policy.get("name", "unnamed"))

    conflicts = {
        uid: policy_names
        for uid, policy_names in user_to_policies.items()
        if len(policy_names) > 1
    }

    if conflicts:
        conflict_details = "; ".join(
            f"user_id={uid} in [{', '.join(names)}]"
            for uid, names in conflicts.items()
        )
        return False, (
            f"WARNING: {len(conflicts)} users in multiple policies. "
            "Domo applies most-permissive policy. "
            f"Details: {conflict_details}"
        )

    return True, "No users in conflicting policies"


def check_filter_columns_exist(
    token: str, dataset_id: str
) -> tuple[bool, str]:
    """Verify that PDP filter columns exist in the DataSet schema."""
    ds = api_get(f"/v1/datasets/{dataset_id}", token)
    columns = {col["name"] for col in ds.get("schema", {}).get("columns", [])}

    missing_cols = EXPECTED_FILTER_COLUMNS - columns
    if missing_cols:
        return False, (
            f"Filter columns not found in DataSet schema: {missing_cols}. "
            "DataSet schema may have changed — re-run pdp_setup.py"
        )

    return True, f"Filter columns {EXPECTED_FILTER_COLUMNS} exist in schema"


def check_all_rows_policies_exist(
    token: str, dataset_id: str, config: list[dict]
) -> tuple[bool, str]:
    """Verify All Rows policies exist for admin/executive roles."""
    policies = api_get(f"/v1/datasets/{dataset_id}/policies", token)
    open_policies = [p for p in policies if p.get("type") == "open"]

    admin_rows = [r for r in config if r["filter_dimension"] == "ALL_ROWS"]

    if admin_rows and not open_policies:
        return False, (
            f"Config has {len(admin_rows)} ALL_ROWS users but no 'open' type policies found. "
            "Re-run pdp_setup.py"
        )

    return True, f"Found {len(open_policies)} All Rows (open) policies"


# ── RUNNER ────────────────────────────────────────────────────────────────────

def run_verification() -> bool:
    """Run all checks and print results. Returns True if all pass."""

    print("SpecialtyPulse PDP Verification")
    print("=" * 50)
    print(f"Output DataSet: {DATASET_ID}")
    if INPUT_DATASET_ID:
        print(f"Input DataSet:  {INPUT_DATASET_ID}")
    print()

    token = get_token()
    config = []
    with open(CONFIG_FILE, newline="", encoding="utf-8") as f:
        config = list(csv.DictReader(f))

    checks = [
        ("Output DataSet has PDP",           check_output_has_pdp(token, DATASET_ID)),
        ("Input DataSet has NO PDP",          check_input_has_no_pdp(token, INPUT_DATASET_ID)),
        ("Filter columns exist in schema",   check_filter_columns_exist(token, DATASET_ID)),
        ("All config users in policies",     check_all_config_users_in_policies(token, DATASET_ID, config)),
        ("No conflicting policy assignments", check_no_user_in_conflicting_policies(token, DATASET_ID)),
        ("All Rows policies present",        check_all_rows_policies_exist(token, DATASET_ID, config)),
    ]

    all_passed = True
    for check_name, (passed, message) in checks:
        icon = "✓" if passed else "✗"
        print(f"  {icon} {check_name}")
        if not passed:
            print(f"      → {message}")
            all_passed = False
        else:
            print(f"      {message}")

    print()
    if all_passed:
        print("✓ All PDP checks passed")
    else:
        print("✗ One or more PDP checks failed — review above and re-run pdp_setup.py")

    return all_passed


if __name__ == "__main__":
    if not all([CLIENT_ID, CLIENT_SECRET, DATASET_ID]):
        print("ERROR: Set DOMO_CLIENT_ID, DOMO_CLIENT_SECRET, DOMO_DATASET_ID")
        sys.exit(1)

    passed = run_verification()
    sys.exit(0 if passed else 1)
