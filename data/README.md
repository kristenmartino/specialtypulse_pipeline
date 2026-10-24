# Data provenance and reproducible lineage

All records are synthetic and follow the CMS PUF schema. No actual CMS release,
customer data or observed usage is represented. The 2021–2022 files are constructed
comparison scenarios derived from the synthetic 2023 fixture, not historical observations.

| File | Role | Origin |
|---|---|---|
| sample_2023_puf_10k.csv | 9,994 raw-format records | Synthetic base fixture. IDs were reassigned deterministically because the old fixture reused an identifier across unrelated names |
| sample_2021_puf_10k.csv / sample_2022_puf_10k.csv | 9,994 records per scenario year | Deterministic generation rules in scripts/generate_scenario_inputs.py |
| sample_mart_reimbursement_trends.csv | 870 procedure/specialty/year rows | Actual local Spark output from the three raw files, using the same functions called by notebooks 01–03 |
| pipeline_run.json | Execution receipt | Runtime, UTC execution time, source/code/output hashes, row counts and displayed example |
| payment_verification.json | UI evidence | Build-time raw-to-mart reconciliation for the actual displayed Dermatology / 99213 row |
| sample_sfdc_pipeline.csv | 500 synthetic opportunities | Separate synthetic sales fixture, joined to the rebuilt specialty benchmarks |
| sample_dashboard_engagement.csv | Usage fixture | Synthetic sessions, not observed activity |

## Scenario rules

The generator assigns one stable synthetic provider ID per source record.
For each earlier year, service/beneficiary counts use a 4% reduction per year
of distance from 2023 (rounded, with services kept at least 11). Charges use a
2% reduction per year. A fixed specialty-name checksum selects a payment rate
between -4% and +4%; that factor is compounded for each year of distance.
These rules create comparison scenarios, not estimates of historical changes.

## Verified path

Raw CSV → shared Spark read_raw → stage_records → staging Parquet round-trip →
build_mart → exported mart CSV → generated browser JSON → procedure list.
The Databricks notebooks import those same read/stage/mart functions. The local
run does not exercise Databricks, Airflow, Delta table replacement or Domo services.

Dermatology / HCPCS 99213 / 2023 reconciles 57 rows and 3,777 services to
$396,247.22 in weighted payment, producing **$104.91**. That is now the value in
the normal procedure list. The old independently generated mart has been replaced with this shared Spark output.

Independent Decimal tests reconcile service totals, provider counts and three
weighted payment columns for all 870 mart rows. CI re-executes Spark and compares
every business column with the committed mart. The app build rejects changed
source files, transformation code or mart bytes that do not match the run receipt.
