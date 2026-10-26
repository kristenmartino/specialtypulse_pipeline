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

## Specialty provider counts

The shared Spark mart counts distinct staged provider IDs at specialty/year grain
across all procedures, then repeats `specialty_total_providers` on each procedure
row. The browser and SQL DataFlow take that repeated count once for the table and
index. Procedure-level `total_providers` remains a distinct count for that procedure.
An overlap regression includes a provider billing multiple procedures; independent
CSV reconciliation checks specialty counts for every published row. The current
fixture assigns one ID per record, so correcting the rollup leaves its scores unchanged.

## Sales fixture interpretation

For the demo, `amount` is assumed annual contract value (ACV) in USD for software
subscriptions. The original fixture did not define that basis. Active totals are
unweighted and exclude Closed Won and Closed Lost; won ACV is not recognized revenue.
The constructed scenario snapshot is March 31, 2026, not a captured or reconstructed
CRM history. All 500 opportunities were created by that date. Closed-stage dates
represent completion within the synthetic scenario and cannot fall after the
snapshot; open-stage dates are expected and can fall before or after it. All rows
are included without a period filter. Created dates run September 2, 2025–February
24, 2026; close dates run October 11, 2025–August 14, 2026, separately from reimbursement years.
The 472 open opportunities total $40,178,200 assumed ACV: 278 are overdue by
1–171 days ($23,546,900), and 194 are not yet overdue ($16,631,300). Both groups
remain in the open-stage total pending review.

[sales_scenario.json](sales_scenario.json) records the fixture hash and deterministic
adjustments: move 12 future closed-stage dates to the snapshot minus their supplied
stage age, and align the other 16 closed-stage ages with their existing close dates.
IDs, stages, amounts and open-deal dates are unchanged. Build checks enforce these
temporal relationships. The AI comparison remains tied to its original August 31
scenario and the immutable CSV at revision d628a13592a5d0f5cc0ca93f6cce5f0c265258ca.


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
