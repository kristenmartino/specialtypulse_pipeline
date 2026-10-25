"""Canonical comparison of the small synthetic mart across service boundaries."""
import csv
import hashlib
import io
import json
from decimal import Decimal


def csv_records(content):
    reader = csv.DictReader(io.StringIO(content))
    fields = reader.fieldnames
    rows = list(reader)
    if not fields or len(fields) != len(set(fields)) or not rows:
        raise ValueError("Empty CSV or duplicate/missing column names")
    if any(None in row or any(value is None for value in row.values()) for row in rows):
        raise ValueError("CSV rows do not match the header")
    return fields, rows


TEXT_FIELDS = {"surrogate_key", "provider_specialty", "hcpcs_code", "hcpcs_description"}
INTEGER_FIELDS = {
    "year", "total_services", "total_beneficiaries", "total_providers",
    "specialty_total_providers", "prior_year_services",
}


def canonical_rows(rows, fields):
    business_fields = [f for f in fields if f != "mart_built_at"]
    result = []
    keys = set()
    for row in rows:
        key = str(row["surrogate_key"])
        if not key or key in keys:
            raise ValueError("Empty or duplicate mart key")
        keys.add(key)
        values = []
        for field in business_fields:
            value = row[field]
            if value is None or str(value) == "":
                normalized = None
            elif field in TEXT_FIELDS:
                normalized = str(value)
            elif field == "is_payment_outlier":
                if str(value).lower() not in {"true", "false"}:
                    raise ValueError("Invalid boolean")
                normalized = str(value).lower()
            else:
                number = Decimal(str(value))
                if not number.is_finite() or (field in INTEGER_FIELDS and number != number.to_integral_value()):
                    raise ValueError("Invalid numeric value")
                normalized = format(number.normalize(), "f") if number else "0"
            values.append(normalized)
        result.append(values)
    return sorted(result, key=lambda row: json.dumps(row, ensure_ascii=False))


def content_hash(rows, fields):
    return hashlib.sha256(json.dumps(canonical_rows(rows, fields), ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def assert_matches(actual_csv, expected_csv):
    fields, actual = csv_records(actual_csv)
    expected_fields, expected = csv_records(expected_csv)
    if fields != expected_fields:
        raise ValueError("Mart schema or column order differs")
    if len(actual) != len(expected) or content_hash(actual, fields) != content_hash(expected, fields):
        raise ValueError("Mart business values differ")
    return {"rows": len(actual), "business_sha256": content_hash(actual, fields)}
