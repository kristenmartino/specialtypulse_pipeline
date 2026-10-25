"""Deliver to a dedicated synthetic Domo DataSet and verify its exported rows."""
import time

import requests

from deployment.contracts import INTEGER_FIELDS, TEXT_FIELDS, assert_matches, csv_records

API = "https://api.domo.com"
DATASET_NAME = "specialtypulse_synthetic_mart_v1"


def domo_schema(fields):
    return {"columns": [{"name": name, "type": (
        "STRING" if name in TEXT_FIELDS | {"mart_built_at", "is_payment_outlier"}
        else "LONG" if name in INTEGER_FIELDS else "DECIMAL"
    )} for name in fields]}


def authenticate(client_id, client_secret, session=None):
    if not client_id or not client_secret:
        raise ValueError("Domo client credentials are not configured")
    session = session or requests.Session()
    response = session.get(f"{API}/oauth/token", params={"grant_type": "client_credentials", "scope": "data"},
                           auth=(client_id, client_secret), timeout=30)
    response.raise_for_status()
    token = response.json().get("access_token")
    if not token:
        raise ValueError("Domo returned no access token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


def deliver_and_verify(session, csv_content, dataset_id="", *, attempts=12, pause=10):
    fields, rows = csv_records(csv_content)
    expected_schema = domo_schema(fields)
    # Validate all values before any network mutation.
    assert_matches(csv_content, csv_content)
    if not dataset_id:
        matches = []
        offset = 0
        while True:
            response = session.get(f"{API}/v1/datasets", params={"limit": 50, "offset": offset}, timeout=30)
            response.raise_for_status()
            page = response.json()
            matches.extend(ds for ds in page if ds.get("name") == DATASET_NAME)
            if len(page) < 50:
                break
            offset += 50
        if len(matches) > 1:
            raise ValueError("Multiple dedicated SpecialtyPulse DataSets; configure an explicit ID")
        if matches:
            dataset_id = matches[0]["id"]
        else:
            response = session.post(f"{API}/v1/datasets", json={
                "name": DATASET_NAME,
                "description": "Synthetic SpecialtyPulse portfolio mart; generated 2021–22 comparisons and synthetic 2023 base. No observed CMS history or business outcome.",
                "schema": expected_schema,
            }, timeout=30)
            response.raise_for_status()
            dataset_id = response.json()["id"]
    response = session.get(f"{API}/v1/datasets/{dataset_id}", timeout=30)
    response.raise_for_status()
    metadata = response.json()
    if metadata.get("name") != DATASET_NAME or metadata.get("schema") != expected_schema:
        raise ValueError("Refusing to replace a DataSet with a different name or schema")
    response = session.put(f"{API}/v1/datasets/{dataset_id}/data", params={"updateMethod": "REPLACE"},
                           data=csv_content.encode(), headers={"Content-Type": "text/csv"}, timeout=120)
    response.raise_for_status()
    last_error = None
    for attempt in range(attempts):
        response = session.get(f"{API}/v1/datasets/{dataset_id}/data", params={"includeHeader": "true"}, timeout=60)
        response.raise_for_status()
        try:
            checked = assert_matches(response.text, csv_content)
            metadata_response = session.get(f"{API}/v1/datasets/{dataset_id}", timeout=30)
            metadata_response.raise_for_status()
            metadata = metadata_response.json()
            if int(metadata.get("rows", metadata.get("rowCount", -1))) != len(rows):
                raise ValueError("Domo metadata row count differs")
            return {"status": "verified", "dataset_id": dataset_id, **checked,
                    "updated_at": metadata.get("updatedAt"), "scope": "Domo API DataSet upload and full business-row readback; no DataFlow, card, App or PDP validation"}
        except ValueError as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(pause)
    raise ValueError("Domo exported rows did not match the delivered mart") from last_error
