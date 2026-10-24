# Reproduce the displayed payment from raw records

The public procedure list now uses the actual mart exported by the local Spark
run. It no longer uses the old independent demonstration mart.

## Recorded path

1. Read the three synthetic CMS-schema CSVs (29,982 records). 2021–2022 are constructed comparison scenarios.
2. Execute read_raw and stage_records from databricks/notebooks/pipeline_transforms.py. The Databricks ingestion/staging notebooks call these same functions.
3. Write/read staging Parquet, validate 29,982 unique provider/procedure/year keys and required fields.
4. Execute the shared build_mart function, also called by notebook 03. Validate and export 870 specialty/procedure/year rows.
5. Generate browser JSON from that exported CSV. The public procedure list reads this data.

The [run receipt](../../data/pipeline_run.json) records the actual execution time,
Spark/Python versions, raw/code hashes, mart hash and checks. This proves a local
Spark run; it does not establish a Databricks, Airflow, Delta replacement or Domo
service run. Those integrations remain separately unverified.

## One displayed example

For Dermatology / HCPCS 99213 / 2023, select source rows with at least 11 services:

- 57 raw rows; 3,777 services.
- Sum of payment × services: $396,247.22.
- $396,247.22 / 3,777 = $104.910569… → **$104.91** per service.

The [UI artifact](../../data/payment_verification.json) lists every selected CSV
row and input. The procedure list and expandable calculation check read the same
$104.91 / 3,777-service mart row. There is no separate $122.25 example in the
current dashboard data.

An equal-row average for this group is $103.80; weighting by services answers a
different question by giving each service equal weight. Neither calculation
supports a clinically matched expected price for another procedure.

## Reproduce

With Java 21 and Python 3.11:

```bash
pip install pyspark==4.0.1 pytest requests
python scripts/run_local_pipeline.py --check
python -m pytest tests -q
npm --prefix domo/app run generate:data
npm --prefix domo/app test
npm --prefix domo/app run build:web
```

`--check` re-executes all shared transformations and compares every business
column to the published mart, excluding only the run-specific audit timestamp.
To deliberately regenerate outputs, omit `--check`, then regenerate the browser
JSON and verification artifact. To recreate the earlier-year scenario inputs,
run scripts/generate_scenario_inputs.py before the Spark run.

Independent Python Decimal tests reconcile all 870 groups' services, provider
counts and three weighted payment columns. Spark regressions exercise the real
functions for weighting, duplicate-key rejection, suppression before aggregation
and nonconsecutive-year handling. Policy tests import the deployed builders and
setup function directly; they do not copy or AST-extract implementation code.

Open [Dermatology / 99213 / CY2023](https://specialtypulse.kristenmartino.ai/?view=procedure&specialty=Dermatology&hcpcs=99213&year=2023)
and expand **Verify one calculation · Dermatology, HCPCS 99213**.


## Same-procedure comparison and portable references

The 2022 Dermatology / 99213 mart row has $108.05 per service and 3,626 services.
The 2023 row has $104.91 and 3,777 services. Using those displayed mart values:

- Payment difference: 10,491 cents − 10,805 cents = −314 cents (−$3.14).
- Payment change: −314 / 10,805 = −2.906…%, displayed as −2.9%.
- Service difference: 3,777 − 3,626 = 151.
- Service change: 151 / 3,626 = 4.164…%, displayed as +4.2%.

The comparison uses an exact specialty/HCPCS match and the immediately prior
year, not a specialty blend or the nearest available year. A missing prior row
or value leaves the change unavailable. A zero prior value leaves percentage
change unavailable. 2021–2022 remain generated scenarios, not observed history.

The brief carries both rows, changes, the exact live comparison URL, a versioned
mart link and its SHA-256, both synthetic raw input links/hashes, the local Spark
receipt and the reproduction guide. Webpack embeds the build's Git revision for
these file links. The detailed payment_verification.json trace covers 2023 only;
the prior-year value is traceable through its raw input file and the shared
pipeline, not through that single-year trace.
