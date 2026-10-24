"""Execute the notebook transformations locally and export the public dashboard mart.

Run with PySpark 4.0.1 / Java 17+: python scripts/run_local_pipeline.py [--check]
--check recomputes all business columns and compares them to the committed mart.
"""
import argparse
import csv
import hashlib
import io
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from pyspark.sql import SparkSession

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "databricks/notebooks"))
from pipeline_transforms import read_raw, stage_records, build_mart, validate_stage, validate_mart  # noqa: E402

MART = ROOT / "data/sample_mart_reimbursement_trends.csv"
RECEIPT = ROOT / "data/pipeline_run.json"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def as_csv(rows, fields):
    target = io.StringIO(newline="")
    writer = csv.DictWriter(target, fieldnames=fields, lineterminator="\n", extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow({key: "" if row.get(key) is None else str(row[key]).lower() if isinstance(row[key], bool) else row[key] for key in fields})
    return target.getvalue()


def business_hash(rows, fields):
    return hashlib.sha256(as_csv(rows, [key for key in fields if key != "mart_built_at"]).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    sources = [ROOT / f"data/sample_{year}_puf_10k.csv" for year in (2021, 2022, 2023)]
    os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
    spark = (SparkSession.builder.master("local[2]").appName("SpecialtyPulse reconciled demo")
             .config("spark.ui.enabled", "false").config("spark.sql.shuffle.partitions", "2")
             .config("spark.sql.session.timeZone", "UTC").getOrCreate())
    spark.sparkContext.setLogLevel("ERROR")
    try:
        with tempfile.TemporaryDirectory(prefix="specialtypulse-spark-") as work:
            staged = None
            source_count = 0
            for year, path in zip((2021, 2022, 2023), sources):
                raw = read_raw(spark, path, year)
                source_count += raw.count()
                frame = stage_records(raw, year)
                staged = frame if staged is None else staged.unionByName(frame)
            # A storage round-trip catches export/schema errors as well as arithmetic.
            staged.write.mode("overwrite").parquet(str(Path(work) / "staging"))
            stage = spark.read.parquet(str(Path(work) / "staging")).cache()
            stage_count = validate_stage(stage)
            mart = build_mart(stage).cache()
            mart_count = validate_mart(mart)
            records = [row.asDict() for row in mart.orderBy("provider_specialty", "hcpcs_code", "year").collect()]
            fields = mart.columns
            output_hash = business_hash(records, fields)
            if args.check:
                with MART.open(newline="") as source:
                    saved = list(csv.DictReader(source))
                if business_hash(saved, fields) != output_hash:
                    raise ValueError("Recomputed Spark business columns differ from the public mart")
                receipt = json.loads(RECEIPT.read_text())
                if receipt["mart_business_sha256"] != output_hash or receipt["source_sha256"] != {str(path.relative_to(ROOT)): digest(path) for path in sources}:
                    raise ValueError("Execution receipt does not match current sources and mart")
                print(f"PASS: all {mart_count} public mart rows reproduce from {source_count} raw records")
                return
            # Reconcile the same value that the procedure list will render.
            with sources[-1].open(newline="") as source:
                selected = [(index, row) for index, row in enumerate(csv.DictReader(source), 2)
                            if row["provider_type"] == "Dermatology" and row["hcpcs_cd"] == "99213" and int(row["tot_srvcs"]) >= 11]
            services = sum(int(row["tot_srvcs"]) for _, row in selected)
            numerator = sum(Decimal(row["avg_mdcr_pymt_amt"]) * int(row["tot_srvcs"]) for _, row in selected)
            expected = (numerator / services).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            displayed = next(row for row in records if row["provider_specialty"] == "Dermatology" and row["hcpcs_code"] == "99213" and row["year"] == 2023)
            if Decimal(str(displayed["avg_medicare_payment"])) != expected or displayed["total_services"] != services:
                raise ValueError("Public mart fails independent payment reconciliation")
            MART.write_text(as_csv(records, fields))
            receipt = {
                "executed_at": datetime.now(timezone.utc).isoformat(),
                "runtime": {"engine": "local Apache Spark", "pyspark": spark.version, "python": sys.version.split()[0]},
                "scope": "Local Spark execution of shared notebook transformations; not a Databricks, Airflow or Domo service run.",
                "source_sha256": {str(path.relative_to(ROOT)): digest(path) for path in sources},
                "code_sha256": {name: digest(ROOT / name) for name in ["databricks/notebooks/pipeline_transforms.py", "scripts/run_local_pipeline.py", "scripts/generate_scenario_inputs.py"]},
                "raw_rows": source_count, "staging_rows": stage_count, "mart_rows": mart_count,
                "years": [2021, 2022, 2023], "mart_business_sha256": output_hash, "mart_csv_sha256": digest(MART),
                "quality_checks": ["unique provider/procedure/year staging keys", "required fields", "services >= 11", "unique specialty/procedure/year mart keys", "independent Decimal payment reconciliation"],
                "displayed_example": {"provider_specialty": "Dermatology", "hcpcs_code": "99213", "year": 2023, "source_rows": len(selected), "total_services": services, "weighted_sum": str(numerator), "avg_medicare_payment": str(expected), "source_csv_rows": [index for index, _ in selected]},
            }
            RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n")
            print(json.dumps({key: receipt[key] for key in ["runtime", "raw_rows", "staging_rows", "mart_rows", "displayed_example"]}, indent=2))
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
