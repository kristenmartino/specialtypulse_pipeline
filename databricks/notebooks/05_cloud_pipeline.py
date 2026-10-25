# Databricks notebook source
"""Full synthetic fixture pipeline on serverless, with Unity Catalog Delta writes."""
import csv
import hashlib
import io
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema_prefix", "specialtypulse")
dbutils.widgets.text("workspace_root", "")
dbutils.widgets.text("source_revision", "")
dbutils.widgets.text("run_key", "")
catalog = dbutils.widgets.get("catalog")
prefix = dbutils.widgets.get("schema_prefix")
run_key = dbutils.widgets.get("run_key")
for identifier in [catalog, prefix, run_key]:
    if not re.fullmatch(r"[A-Za-z0-9_]+", identifier):
        raise ValueError("Unsafe or empty deployment identifier")
workspace_root = dbutils.widgets.get("workspace_root")
sys.path.insert(0, workspace_root)
sys.path.insert(0, workspace_root + "/databricks/notebooks")
from deployment.contracts import assert_matches
from pipeline_transforms import read_raw, stage_records, validate_stage, build_mart, validate_mart

volume = Path(f"/Volumes/{catalog}/{prefix}_raw/fixtures")
manifest = json.loads((volume / "deployment-manifest.json").read_text())
revision = dbutils.widgets.get("source_revision")
if manifest["source_revision"] != revision:
    raise ValueError("Job and uploaded fixture revision differ")
for relative, expected_hash in manifest["file_sha256"].items():
    # Workspace notebooks are managed objects rather than POSIX .py files.
    # Their submitted bytes are recorded in the deployment manifest. Imported
    # Python modules and all fixture files are also checked here at runtime.
    if relative == "databricks/notebooks/05_cloud_pipeline.py":
        continue
    path = Path(workspace_root) / relative if relative.endswith(".py") else volume / Path(relative).name
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
        raise ValueError(f"Deployment content differs: {relative}")

raw_union = None
staged_union = None
for year in (2021, 2022, 2023):
    raw = read_raw(spark, str(volume / f"sample_{year}_puf_10k.csv"), year)
    stage = stage_records(raw, year)
    validate_stage(stage)
    raw_union = raw if raw_union is None else raw_union.unionByName(raw)
    staged_union = stage if staged_union is None else staged_union.unionByName(stage)
raw_count = raw_union.count()
stage_count = validate_stage(staged_union)
if raw_count != manifest["expected_raw_rows"] or stage_count != manifest["expected_staging_rows"]:
    raise ValueError("Raw/staging row counts differ from the pinned fixture run")

def replace_delta(frame, table):
    # Delta overwrite is one table commit; no DROP/RENAME availability gap.
    frame.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(table)

raw_table = f"{catalog}.{prefix}_raw.cms_physician_puf_raw"
stage_table = f"{catalog}.{prefix}_staging.stg_cms_physician_puf"
mart_table = f"{catalog}.{prefix}_marts.mart_reimbursement_trends"
replace_delta(raw_union, raw_table)
replace_delta(staged_union, stage_table)
persisted_stage = spark.table(stage_table)
if validate_stage(persisted_stage) != stage_count:
    raise ValueError("Persisted Delta staging count differs")
mart = build_mart(persisted_stage)
if validate_mart(mart) != manifest["expected_mart_rows"]:
    raise ValueError("Mart row count differs")

def export_csv(frame):
    target = io.StringIO(newline="")
    writer = csv.DictWriter(target, fieldnames=frame.columns, lineterminator="\n")
    writer.writeheader()
    for record in frame.orderBy("surrogate_key").collect():
        writer.writerow({key: "" if value is None else str(value).lower() if isinstance(value, bool) else value
                         for key, value in record.asDict().items()})
    return target.getvalue()

expected_csv = (volume / "sample_mart_reimbursement_trends.csv").read_text()
assert_matches(export_csv(mart), expected_csv)
replace_delta(mart, mart_table)
output_csv = export_csv(spark.table(mart_table))
checked = assert_matches(output_csv, expected_csv)
output_dir = volume / "runs" / run_key
output_dir.mkdir(parents=True, exist_ok=False)
csv_path = output_dir / "mart.csv"
csv_path.write_text(output_csv)
receipt = {
    "status": "verified", "engine": "Databricks Spark / Unity Catalog Delta",
    "executed_at": datetime.now(timezone.utc).isoformat(), "spark_version": spark.version,
    "source_revision": revision, "run_key": run_key, "raw_rows": raw_count,
    "staging_rows": stage_count, "mart_rows": checked["rows"],
    "mart_business_sha256": checked["business_sha256"],
    "export_sha256": hashlib.sha256(csv_path.read_bytes()).hexdigest(),
    "export_path": str(csv_path), "tables": [raw_table, stage_table, mart_table],
    "source_sha256": {key: value for key, value in manifest["file_sha256"].items() if "puf_10k.csv" in key},
    "code_sha256": {key: value for key, value in manifest["file_sha256"].items() if key.endswith(".py")},
    "scope": "Synthetic fixture pipeline and Delta readback; Airflow validates the exported artifact for the React build",
}
(output_dir / "databricks-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
dbutils.notebook.exit(json.dumps(receipt))
