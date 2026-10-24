# Bundled data provenance

Every bundled fixture is synthetic, including the reimbursement records.
Column names and grains follow the CMS Medicare Physician PUF schema; the
records are not an extract from an actual CMS release.

| File | Role | Provenance |
|---|---|---|
| sample_2023_puf_10k.csv | Raw-format pipeline fixture; 9,994 data rows for 2023 despite the approximate filename | Generated reimbursement records; names and identifiers are fixture values |
| sample_mart_reimbursement_trends.csv | Public dashboard input; 570 specialty/procedure/year rows across 2021–2023 | Separately generated demonstration mart, not a reconciled output of the raw fixture |
| sample_sfdc_pipeline.csv | Public pipeline input; 500 opportunities | Synthetic sales records |
| sample_dashboard_engagement.csv | Usage fixture | Synthetic sessions, not observed user activity |
| payment_verification.json | Reproducible calculation artifact | Generated from the raw CSV at app data-generation/build time; includes source SHA-256, CSV row numbers, inputs and one verification mart row |

The UI imports a generated JSON copy of the dashboard mart and sales fixture.
The raw fixture is used separately by the payment check and can be used to
exercise the notebook code in a configured environment. A fixture's build
stamp is not evidence that the notebooks ran.

For Dermatology / HCPCS 99213, the raw-fixture check returns $104.91 across
3,777 services. The dashboard's independent mart contains $122.25 across 580
services for that procedure/year. These are different fixtures; no lineage
between those two values is claimed. See [the verification walkthrough](../docs/verification/payment-check.md).
