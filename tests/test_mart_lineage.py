"""Independent CSV/Decimal reconciliation of every published procedure payment."""
import csv
import hashlib
import io
import json
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).parents[1]


def test_all_published_mart_payments_and_volumes_reconcile_to_raw_inputs():
    groups = defaultdict(list)
    for year in (2021, 2022, 2023):
        with (ROOT / f"data/sample_{year}_puf_10k.csv").open(newline="") as source:
            for row in csv.DictReader(source):
                if int(row["tot_srvcs"]) >= 11:
                    groups[(row["provider_type"].strip(), row["hcpcs_cd"].strip(), year)].append(row)
    with (ROOT / "data/sample_mart_reimbursement_trends.csv").open(newline="") as source:
        mart = list(csv.DictReader(source))
    assert len(mart) == len(groups) == 870
    assert {(row["provider_specialty"], row["hcpcs_code"], int(row["year"])) for row in mart} == set(groups)
    for output in mart:
        rows = groups[(output["provider_specialty"], output["hcpcs_code"], int(output["year"]))]
        services = sum(int(row["tot_srvcs"]) for row in rows)
        assert int(output["total_services"]) == services
        assert int(output["total_providers"]) == len({row["npi"] for row in rows})
        for raw_column, mart_column in [("avg_mdcr_pymt_amt", "avg_medicare_payment"), ("avg_sbmtd_chrg", "avg_submitted_charge"), ("avg_mdcr_stdzd_amt", "avg_medicare_standardized_amount")]:
            expected = (sum(Decimal(row[raw_column]) * int(row["tot_srvcs"]) for row in rows) / services).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            assert Decimal(output[mart_column]) == expected, (output["surrogate_key"], mart_column)


def test_run_receipt_hashes_match_current_sources_code_and_mart():
    receipt = json.loads((ROOT / "data/pipeline_run.json").read_text())
    for path, expected in {**receipt["source_sha256"], **receipt["code_sha256"]}.items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected
    mart_path = ROOT / "data/sample_mart_reimbursement_trends.csv"
    assert hashlib.sha256(mart_path.read_bytes()).hexdigest() == receipt["mart_csv_sha256"]
    with mart_path.open(newline="") as source:
        reader = csv.DictReader(source)
        fields = [field for field in reader.fieldnames if field != "mart_built_at"]
        rows = list(reader)
    target = io.StringIO(newline="")
    writer = csv.DictWriter(target, fieldnames=fields, lineterminator="\n", extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    assert hashlib.sha256(target.getvalue().encode()).hexdigest() == receipt["mart_business_sha256"]
