"""Independently reconcile the saved web verification output with Decimal."""
import csv
import hashlib
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).parents[1]
RAW = ROOT / "data/sample_2023_puf_10k.csv"
TRACE = json.loads((ROOT / "data/payment_verification.json").read_text())


def selected_rows():
    with RAW.open(newline="") as source:
        return [(number, row) for number, row in enumerate(csv.DictReader(source), 2)
                if row["provider_type"] == "Dermatology" and row["hcpcs_cd"] == "99213"
                and int(row["tot_srvcs"]) >= 11]


def test_trace_records_exact_source_rows_and_hash():
    rows = selected_rows()
    assert TRACE["source_sha256"] == hashlib.sha256(RAW.read_bytes()).hexdigest()
    assert TRACE["source_row_count"] == len(rows) == 57
    assert TRACE["inputs"] == [
        {"csv_row": number, "total_services": int(row["tot_srvcs"]),
         "avg_medicare_payment_cents": int(Decimal(row["avg_mdcr_pymt_amt"]) * 100)}
        for number, row in rows
    ]


def test_verification_mart_reconciles_weighted_payment_and_services():
    rows = selected_rows()
    services = sum(int(row["tot_srvcs"]) for _, row in rows)
    weighted_sum = sum(Decimal(row["avg_mdcr_pymt_amt"]) * int(row["tot_srvcs"]) for _, row in rows)
    payment = (weighted_sum / services).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    assert services == 3777
    assert weighted_sum == Decimal("396247.22")
    assert payment == Decimal("104.91")
    assert TRACE["payment_service_cents"] == int(weighted_sum * 100)
    assert TRACE["verification_mart_row"] == {
        "provider_specialty": "Dermatology", "hcpcs_code": "99213", "year": 2023,
        "total_services": services, "avg_medicare_payment": float(payment),
    }
