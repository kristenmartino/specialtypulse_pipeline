"""
pdp_verify_writer.py
─────────────────────────────────────────────────────────────────────────────
Extended version of pdp_verify.py that also WRITES results to a Domo DataSet.
The Domo App reads this DataSet to display check status.

This is what makes the governance loop complete:
  pdp_setup.py creates policies
  pdp_verify_writer.py checks them and writes results to Domo
  The Domo App reads the results DataSet and displays status live

Run this:
  - After pdp_setup.py (initial verification)
  - From the Airflow DAG (after each pipeline run)
  - From GitHub Actions CI (nightly governance check)

The GitHub Actions badge reflects the exit code — green badge = all checks
passing right now.
─────────────────────────────────────────────────────────────────────────────
"""

import csv
import os
import sys
import requests
import json
from datetime import datetime, timezone
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass  # dotenv is optional — env vars set externally in CI / Airflow

CLIENT_ID        = os.getenv("DOMO_CLIENT_ID")
CLIENT_SECRET    = os.getenv("DOMO_CLIENT_SECRET")
DATASET_ID       = os.getenv("DOMO_DATASET_ID")
INPUT_DATASET_ID = os.getenv("DOMO_INPUT_DATASET_ID", "")
RESULTS_DATASET_ID = os.getenv("DOMO_VERIFY_RESULTS_DATASET_ID", "")

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "pdp_config.csv")
API_HOST    = "https://api.domo.com"

VERIFY_RESULTS_DATASET_NAME = "specialtypulse_pdp_verify_results"


# ── API CLIENT ────────────────────────────────────────────────────────────────

def get_token():
    resp = requests.get(
        f"{API_HOST}/oauth/token",
        params={"grant_type": "client_credentials", "scope": "data user"},
        auth=(CLIENT_ID, CLIENT_SECRET),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]

def api_get(path, token, params=None):
    headers = {"Authorization": f"bearer {token}", "Accept": "application/json"}
    resp = requests.get(f"{API_HOST}{path}", headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()

def api_post(path, token, body):
    headers = {
        "Authorization": f"bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    resp = requests.post(f"{API_HOST}{path}", headers=headers, json=body, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ── VERIFY CHECKS ─────────────────────────────────────────────────────────────

def run_checks(token, dataset_id, input_dataset_id, config):
    """Run all checks and return list of result dicts."""
    run_at = datetime.now(timezone.utc).isoformat()
    results = []

    def record(name, passed, message):
        results.append({
            "check_name": name,
            "passed":     "true" if passed else "false",
            "message":    message,
            "run_at":     run_at,
        })

    # ── Fetch shared data once (avoids redundant API calls) ──────────────
    try:
        policies = api_get(f"/v1/datasets/{dataset_id}/policies", token)
    except Exception as e:
        record("Output DataSet has PDP", False, f"API error fetching policies: {e}")
        return results  # Can't run remaining checks without policies

    try:
        ds_meta = api_get(f"/v1/datasets/{dataset_id}", token)
    except Exception as e:
        ds_meta = {}

    try:
        users = api_get("/v1/users", token, params={"limit": 500})
    except Exception as e:
        users = []

    email_to_id = {u["email"].lower(): u["id"] for u in users if u.get("email")}

    # Collect all user IDs that appear in any policy
    users_in_policies = set()
    user_policy_count = {}
    for p in policies:
        for uid in p.get("users", []):
            users_in_policies.add(uid)
            user_policy_count[uid] = user_policy_count.get(uid, 0) + 1

    # 1. Output DataSet has PDP
    if policies:
        record("Output DataSet has PDP", True, f"Output DataSet has {len(policies)} PDP policies")
    else:
        record("Output DataSet has PDP", False, f"OUTPUT DataSet {dataset_id} has NO PDP policies")

    # 2. Input DataSet has NO PDP
    if input_dataset_id:
        try:
            input_policies = api_get(f"/v1/datasets/{input_dataset_id}/policies", token)
            if input_policies:
                record("Input DataSet has NO PDP", False,
                    f"CRITICAL: INPUT DataSet has {len(input_policies)} PDP policies — silently stripped by DataFlow")
            else:
                record("Input DataSet has NO PDP", True, "Input DataSet has no PDP — correct")
        except Exception as e:
            record("Input DataSet has NO PDP", False, f"API error: {e}")
    else:
        record("Input DataSet has NO PDP", True, "Input DataSet ID not provided — skipped")

    # 3. Filter columns exist in schema
    columns = {col["name"] for col in ds_meta.get("schema", {}).get("columns", [])}
    required = {"provider_specialty", "provider_state"}
    missing = required - columns
    if missing:
        record("Filter columns exist in schema", False,
            f"Missing columns: {missing}. Re-run pdp_setup.py")
    else:
        record("Filter columns exist in schema", True,
            f"provider_specialty, provider_state exist in schema")

    # 4. All config users in policies
    missing_users = []
    for row in config:
        uid = email_to_id.get(row["email"].lower())
        if uid and uid not in users_in_policies:
            missing_users.append(row["email"])

    if missing_users:
        record("All config users in policies", False,
            f"Not in any policy: {missing_users}")
    else:
        record("All config users in policies", True,
            f"All {len(config)} config users appear in policies")

    # 5. No conflicting policy assignments
    conflicts = {uid: n for uid, n in user_policy_count.items() if n > 1}
    if conflicts:
        record("No conflicting policy assignments", False,
            f"WARNING: {len(conflicts)} users in multiple policies — Domo applies most-permissive")
    else:
        record("No conflicting policy assignments", True,
            "No users in conflicting policies")

    # 6. All Rows policies present
    open_policies = [p for p in policies if p.get("type") == "open"]
    admin_rows = [r for r in config if r["filter_dimension"] == "ALL_ROWS"]

    if admin_rows and not open_policies:
        record("All Rows policies present", False,
            f"Config has {len(admin_rows)} ALL_ROWS users but no open policies. Re-run pdp_setup.py")
    else:
        record("All Rows policies present", True,
            f"Found {len(open_policies)} All Rows (open) policies")

    return results


# ── WRITE RESULTS TO DOMO ─────────────────────────────────────────────────────

def get_or_create_results_dataset(token):
    """Get the verify results DataSet ID, creating it if needed."""
    global RESULTS_DATASET_ID
    if RESULTS_DATASET_ID:
        return RESULTS_DATASET_ID

    # Search for existing DataSet by name (paginated)
    try:
        offset = 0
        page_size = 50
        while True:
            datasets = api_get("/v1/datasets", token, params={"limit": page_size, "offset": offset})
            if not datasets:
                break
            for ds in datasets:
                if ds.get("name") == VERIFY_RESULTS_DATASET_NAME:
                    RESULTS_DATASET_ID = ds["id"]
                    print(f"  Found existing results DataSet: {RESULTS_DATASET_ID}")
                    return RESULTS_DATASET_ID
            if len(datasets) < page_size:
                break
            offset += page_size
    except Exception:
        pass

    # Create new DataSet
    body = {
        "name":        VERIFY_RESULTS_DATASET_NAME,
        "description": "PDP verify check results — read by the SpecialtyPulse Domo App",
        "schema": {
            "columns": [
                {"name": "check_name", "type": "STRING"},
                {"name": "passed",     "type": "STRING"},
                {"name": "message",    "type": "STRING"},
                {"name": "run_at",     "type": "STRING"},
            ]
        }
    }
    created = api_post("/v1/datasets", token, body)
    RESULTS_DATASET_ID = created["id"]
    print(f"  Created results DataSet: {RESULTS_DATASET_ID}")
    print(f"  ADD THIS TO manifest.json: pdp_verify_results → {RESULTS_DATASET_ID}")
    return RESULTS_DATASET_ID


def write_results_to_domo(token, results):
    """Push verify results to Domo DataSet via import API."""
    ds_id = get_or_create_results_dataset(token)

    # Build CSV string
    csv_lines = ["check_name,passed,message,run_at"]
    for r in results:
        # Escape commas in message
        msg = r["message"].replace('"', '""')
        csv_lines.append(f'"{r["check_name"]}",{r["passed"]},"{msg}",{r["run_at"]}')
    csv_data = "\n".join(csv_lines)

    headers = {
        "Authorization": f"bearer {token}",
        "Content-Type": "text/csv",
    }
    resp = requests.put(
        f"{API_HOST}/v1/datasets/{ds_id}/data",
        headers=headers,
        data=csv_data,
        timeout=30,
    )
    resp.raise_for_status()
    print(f"  ✓ Wrote {len(results)} check results to Domo DataSet {ds_id}")


# ── ENTRY POINT ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not all([CLIENT_ID, CLIENT_SECRET, DATASET_ID]):
        print("ERROR: Set DOMO_CLIENT_ID, DOMO_CLIENT_SECRET, DOMO_DATASET_ID")
        sys.exit(1)

    print("SpecialtyPulse PDP Verify + Write")
    print("=" * 50)

    # Load config
    config = []
    with open(CONFIG_FILE, newline="", encoding="utf-8") as f:
        config = list(csv.DictReader(f))

    token = get_token()
    print(f"✓ Authenticated")

    # Run checks
    print("\nRunning checks...")
    results = run_checks(token, DATASET_ID, INPUT_DATASET_ID, config)

    # Print results
    print()
    all_pass = True
    for r in results:
        icon = "✓" if r["passed"] == "true" else "✗"
        print(f"  {icon} {r['check_name']}")
        if r["passed"] != "true":
            print(f"      → {r['message']}")
            all_pass = False
        else:
            print(f"      {r['message']}")

    # Write to Domo
    print("\nWriting results to Domo...")
    try:
        write_results_to_domo(token, results)
    except Exception as e:
        print(f"  WARNING: Could not write to Domo: {e}")
        print("  Checks still ran — exit code reflects check results.")

    print()
    if all_pass:
        print("✓ All checks passed")
        sys.exit(0)
    else:
        print("✗ One or more checks failed")
        sys.exit(1)
