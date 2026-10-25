"""Offline contract regressions; these tests do not claim external service execution."""
import csv
import io
from pathlib import Path

import pytest

from deployment.contracts import assert_matches, csv_records
from deployment.deploy_databricks import plan
from deployment.domo_delivery import DATASET_NAME, deliver_and_verify, domo_schema
from deployment.airflow_tasks import validate_connections

ROOT = Path(__file__).resolve().parents[1]
MART = (ROOT / "data/sample_mart_reimbursement_trends.csv").read_text()


def render(fields, rows):
    target = io.StringIO()
    writer = csv.DictWriter(target, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return target.getvalue()


def test_roundtrip_ignores_row_order_and_audit_timestamp_but_preserves_all_business_values():
    fields, rows = csv_records(MART)
    for row in rows:
        row["mart_built_at"] = "2026-10-25 00:00:00"
        if row["avg_medicare_payment"]:
            row["avg_medicare_payment"] += "0"
        row["is_payment_outlier"] = row["is_payment_outlier"].upper()
    assert assert_matches(render(fields, rows[::-1]), MART)["rows"] == 870


@pytest.mark.parametrize("field,value", [("avg_medicare_payment", "0"), ("specialty_total_providers", "1"),
                                         ("hcpcs_code", "99213X"), ("is_payment_outlier", "unknown")])
def test_roundtrip_rejects_changed_business_value(field, value):
    fields, rows = csv_records(MART)
    rows[0][field] = value
    with pytest.raises(ValueError):
        assert_matches(render(fields, rows), MART)


def test_roundtrip_rejects_dropped_duplicate_rows_and_reordered_columns():
    fields, rows = csv_records(MART)
    for changed in [render(fields, rows[:-1]), render(fields, rows + [rows[0]]), render(fields[::-1], rows)]:
        with pytest.raises(ValueError):
            assert_matches(changed, MART)


def test_plan_covers_all_years_uses_serverless_and_does_not_schedule_twice():
    from databricks.sdk.service.jobs import JobSettings
    result = plan("main", "specialtypulse", "/Workspace/Users/test@example.com/specialtypulse")
    job = result["job"]
    assert result["manifest"]["expected_raw_rows"] == 29982
    assert result["manifest"]["expected_mart_rows"] == 870
    assert len([p for p in result["manifest"]["file_sha256"] if "puf_10k.csv" in p]) == 3
    assert "new_cluster" not in job["tasks"][0]
    assert "schedule" not in job
    assert JobSettings.from_dict(job).as_dict() == job


@pytest.mark.parametrize("catalog,prefix,path", [("main;drop", "specialtypulse", "/Workspace/Users/me/project"),
                                               ("main", "../other", "/Workspace/Users/me/project"),
                                               ("main", "specialtypulse", "/Shared/other")])
def test_plan_rejects_unsafe_targets(catalog, prefix, path):
    with pytest.raises(ValueError):
        plan(catalog, prefix, path)


def test_missing_connections_fail_before_any_external_run(monkeypatch):
    for key in ["DATABRICKS_HOST", "DATABRICKS_TOKEN", "SPECIALTYPULSE_DATABRICKS_JOB_ID", "DOMO_CLIENT_ID", "DOMO_CLIENT_SECRET"]:
        monkeypatch.delenv(key, raising=False)
    with pytest.raises(ValueError, match="Deployment is not connected"):
        validate_connections()


class Response:
    def __init__(self, data=None, text="", failure=False):
        self.data, self.text, self.failure = data, text, failure

    def raise_for_status(self):
        if self.failure:
            raise RuntimeError("HTTP failure")

    def json(self):
        return self.data


class DomoSession:
    def __init__(self, *, name=DATASET_NAME, content=MART, rows=870, fail_put=False):
        self.name, self.content, self.rows, self.fail_put = name, content, rows, fail_put
        self.writes = []

    def get(self, url, **kwargs):
        if url.endswith("/data"):
            return Response(text=self.content)
        fields, _ = csv_records(MART)
        return Response({"name": self.name, "schema": domo_schema(fields), "rows": self.rows, "updatedAt": "2026-10-25"})

    def put(self, url, **kwargs):
        self.writes.append(kwargs)
        return Response(failure=self.fail_put)


def test_delivery_requires_both_metadata_and_full_readback():
    session = DomoSession()
    result = deliver_and_verify(session, MART, "dedicated-test-id", attempts=1)
    assert result["status"] == "verified" and result["rows"] == 870
    assert session.writes[0]["params"] == {"updateMethod": "REPLACE"}
    assert session.writes[0]["data"] == MART.encode()


@pytest.mark.parametrize("content,rows", [(MART, 869), (MART.replace("104.91", "104.90"), 870)])
def test_delivery_fails_on_metadata_or_value_mismatch(content, rows):
    with pytest.raises(ValueError, match="Domo exported rows"):
        deliver_and_verify(DomoSession(content=content, rows=rows), MART, "id", attempts=1)


def test_delivery_refuses_unrelated_dataset_before_writing():
    session = DomoSession(name="another-project")
    with pytest.raises(ValueError, match="Refusing"):
        deliver_and_verify(session, MART, "id", attempts=1)
    assert session.writes == []


def test_failed_upload_never_reports_success():
    with pytest.raises(RuntimeError, match="HTTP failure"):
        deliver_and_verify(DomoSession(fail_put=True), MART, "id", attempts=1)
