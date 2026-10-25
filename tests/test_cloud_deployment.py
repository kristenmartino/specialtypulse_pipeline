"""Offline contract regressions; these tests do not claim external service execution."""
import csv
import io
from pathlib import Path

import pytest

from deployment.contracts import assert_matches, csv_records
from deployment.deploy_databricks import plan
from deployment.export_release import publish_export
import hashlib
import json
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
    for key in ["DATABRICKS_HOST", "DATABRICKS_TOKEN", "SPECIALTYPULSE_DATABRICKS_JOB_ID"]:
        monkeypatch.delenv(key, raising=False)
    with pytest.raises(ValueError, match="Deployment is not connected"):
        validate_connections()



def export_receipt(content=MART):
    checked = assert_matches(content, MART)
    return {"status": "verified", "run_key": "12345", "executed_at": "2026-10-25T00:00:00Z",
            "source_revision": "test-revision", "export_sha256": hashlib.sha256(content.encode()).hexdigest(),
            "mart_rows": checked["rows"], "mart_business_sha256": checked["business_sha256"]}


def test_publish_validated_cloud_export_atomically(tmp_path):
    (tmp_path / "sample_mart_reimbursement_trends.csv").write_text(MART)
    release = publish_export(tmp_path, MART, export_receipt())
    assert release["rows"] == 870
    assert json.loads((tmp_path / "dashboard_release.json").read_text()) == release
    assert (tmp_path / release["mart"]).read_text() == MART
    assert publish_export(tmp_path, MART, export_receipt()) == release


@pytest.mark.parametrize("change", ["bytes", "rows", "values", "status"])
def test_failed_export_never_changes_release_pointer(tmp_path, change):
    (tmp_path / "sample_mart_reimbursement_trends.csv").write_text(MART)
    (tmp_path / "dashboard_release.json").write_text('{"existing":true}')
    receipt = export_receipt()
    if change == "bytes":
        receipt["export_sha256"] = "wrong"
    if change == "rows":
        receipt["mart_rows"] = 1
    if change == "values":
        receipt["mart_business_sha256"] = "wrong"
    if change == "status":
        receipt["status"] = "pending"
    with pytest.raises(ValueError):
        publish_export(tmp_path, MART, receipt)
    assert json.loads((tmp_path / "dashboard_release.json").read_text()) == {"existing": True}


def test_prior_run_artifacts_cannot_be_overwritten(tmp_path):
    (tmp_path / "sample_mart_reimbursement_trends.csv").write_text(MART)
    publish_export(tmp_path, MART, export_receipt())
    receipt = export_receipt()
    receipt["source_revision"] = "different"
    with pytest.raises(ValueError, match="Refusing"):
        publish_export(tmp_path, MART, receipt)
