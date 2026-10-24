"""Execute the same importable transformations called by the deployment notebooks."""
import csv
import os
import sys
from pathlib import Path

import pytest

pytest.importorskip("pyspark")
from pyspark.sql import SparkSession  # noqa: E402

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "databricks/notebooks"))
from pipeline_transforms import read_raw, stage_records, build_mart, validate_stage  # noqa: E402


@pytest.fixture(scope="module")
def spark():
    os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
    os.environ.setdefault("SPARK_LOCAL_IP", "127.0.0.1")
    session = (SparkSession.builder.master("local[2]").appName("SpecialtyPulse transformation tests")
               .config("spark.ui.enabled", "false").config("spark.sql.shuffle.partitions", "2").getOrCreate())
    session.sparkContext.setLogLevel("ERROR")
    yield session
    session.stop()


def raw_file(tmp_path, duplicate=False, suppressed=False):
    with (ROOT / "data/sample_2023_puf_10k.csv").open(newline="") as source:
        template = next(csv.DictReader(source))
    rows = []
    for index, (services, payment) in enumerate([(10 if suppressed else 20, "10.00"), (80, "30.00")]):
        row = {**template, "npi": "9000000001" if duplicate else str(9000000001 + index),
               "provider_type": "Dermatology", "hcpcs_cd": "99213", "tot_srvcs": str(services),
               "avg_mdcr_pymt_amt": payment, "avg_sbmtd_chrg": "60.00", "avg_mdcr_stdzd_amt": payment}
        rows.append(row)
    path = tmp_path / "raw.csv"
    with path.open("w", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=list(template))
        writer.writeheader()
        writer.writerows(rows)
    return path


def test_raw_ingestion_staging_and_weighted_mart_share_the_notebook_path(spark, tmp_path):
    stage = stage_records(read_raw(spark, raw_file(tmp_path), 2023), 2023)
    assert validate_stage(stage) == 2
    row = build_mart(stage).first()
    assert row.avg_medicare_payment == 26.0
    assert row.total_services == 100
    assert row.total_providers == 2
    assert row.yoy_payment_change_pct is None


def test_duplicate_source_keys_are_rejected(spark, tmp_path):
    stage = stage_records(read_raw(spark, raw_file(tmp_path, duplicate=True), 2023), 2023)
    with pytest.raises(ValueError, match="Duplicate"):
        validate_stage(stage)


def test_suppression_happens_before_weighting(spark, tmp_path):
    stage = stage_records(read_raw(spark, raw_file(tmp_path, suppressed=True), 2023), 2023)
    assert validate_stage(stage) == 1
    row = build_mart(stage).first()
    assert row.total_services == 80
    assert row.avg_medicare_payment == 30.0


def test_missing_consecutive_year_does_not_become_a_one_year_change(spark, tmp_path):
    path = raw_file(tmp_path)
    stage21 = stage_records(read_raw(spark, path, 2021), 2021)
    stage23 = stage_records(read_raw(spark, path, 2023), 2023)
    rows = build_mart(stage21.unionByName(stage23)).orderBy("year").collect()
    assert [row.year for row in rows] == [2021, 2023]
    assert all(row.prior_year_avg_payment is None and row.yoy_payment_change_pct is None for row in rows)
