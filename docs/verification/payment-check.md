# Reproduce one weighted-payment calculation

This check starts from actual rows in the **synthetic raw fixture**. It produces
a small verification mart row and displays that output in the public app.
It does not execute Spark, Airflow or Domo, and it is separate from the dashboard's
independently generated demonstration mart.

## Inputs and calculation

1. Read `data/sample_2023_puf_10k.csv` (9,994 data records for 2023).
2. Select `provider_type = Dermatology`, `hcpcs_cd = 99213`, `tot_srvcs >= 11`.
3. The 57 selected rows contain 3,777 services. The generated artifact lists every selected CSV row number and its inputs.
4. Sum `avg_mdcr_pymt_amt × tot_srvcs`: **$396,247.22**.
5. Divide by **3,777**: **$104.910569…**, rounded to **$104.91** per service.

The generator uses integer cents for the weighted products and writes
`data/payment_verification.json`. Its `verification_mart_row` is at specialty ×
procedure × year grain. The artifact includes a SHA-256 of the source file and
each input row number, service count and payment in cents. Python's independent
Decimal calculation checks the selection, sums, rounding, hash and saved output.

## Reproduce

```bash
npm --prefix domo/app run generate:data
python -m pytest tests/test_payment_trace.py -q
npm --prefix domo/app run build:web
```

Open [Procedure Detail](https://specialtypulse.kristenmartino.ai/?view=procedure)
and expand **Verify one calculation · Dermatology, HCPCS 99213**. The displayed
$104.91 is read from the generated verification output; it is not typed into the
React component.

## Why the procedure list has a different value

The main procedure list reads `sample_mart_reimbursement_trends.csv`, a separate
synthetic fixture with $122.25 and 580 services for the same specialty/procedure/year.
It was not reproduced from this raw CSV. The check therefore does not claim that
the main dashboard's $122.25 has provider-level lineage in the bundled raw file.
Rebuilding the complete multi-year mart from reconciled source releases remains
operational work to be done.
