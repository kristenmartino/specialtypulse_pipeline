# SpecialtyPulse technical design

**Owner:** Kristen Martino
**Updated:** October 24, 2026

This document describes the current source and its verification boundaries.
The public site is a portfolio demo. All bundled reimbursement, sales and usage
records are synthetic; no customer deployment or external metric approval is claimed.

## Two execution paths

### Public demo — available now

```text
synthetic dashboard mart CSV + synthetic opportunity CSV
  → generate-source-data.mjs → sourceData.json
  → aggregateMart / enrichBenchmarks / buildPipelineIntelligence
  → React views and deterministic dashboard summary
  → Vercel public deployment
```

`domoFetch.js` selects this path when `window.domo` is absent. Benchmarks and
scores are calculated from the fixture at load time. Governance assignments and
usage come from illustrative data. The public app does not enforce Domo access
controls and does not call a language model.

### Reconciled local Spark path — executed

```text
three synthetic raw CSVs → shared read_raw → stage_records
  → staging Parquet round-trip + validation → build_mart
  → 870-row exported mart + pipeline_run.json → browser JSON
  → normal procedure list and calculation check
```

29,982 raw records produce 29,982 staged rows. The three shared functions live in
`databricks/notebooks/pipeline_transforms.py`; notebook adapters 01–03 call the
same functions. The public app uses this real output. The $104.91 example is
not an isolated arithmetic fixture. The build verifies source/code/output hashes.
CI recomputes every business column and compares it with the committed mart.

2021–2022 are generated comparison scenarios, not historical observations. The
old synthetic fixture reused provider IDs across unrelated names; deterministic
fixture IDs now satisfy the enforced staging key contract. Duplicate keys are
rejected rather than silently deduplicated. See [data provenance](../data/README.md).

### External integration — not verified by the local run

Airflow, Databricks catalog/Delta writes, Domo upload/DataFlow and intended-user
policy checks require their own execution evidence. The local path exercises
Spark transformations and Parquet storage, not those services. The Domo trial
has ended. Notebook imports require the shared module alongside the adapters.

## Design choices

### Explicit types in staging

The ingestion notebook reads string columns; staging normalizes values and
casts types explicitly. This makes transformation rules inspectable. Null,
uniqueness and range assertions are present in the notebook code; the local run exercises these checks on the bundled sources. Syntax compilation
alone still does not establish external notebook execution.

### Service-volume weighting

The mart notebook groups by specialty, procedure and year and computes
`SUM(payment × services) / SUM(services)`. The public benchmark layer aggregates
the bundled mart with service-volume weighting for specialty average payment.
Specialty payment-to-charge ratios instead average procedure ratios; the
[metric definitions](METRIC_CERTIFICATION_LOG.md) explain that distinction.

### Validated replacement with an availability gap

The mart notebook writes and checks a temporary table before `DROP` + `RENAME`.
The two operations are not an atomic swap. An operational deployment needs an
atomic replacement or a view switch and a tested recovery path.

### Domo schema compatibility

The SQL benchmark output groups by specialty and year; it does not retain state.
Specialty and All Rows policies fit that output. Regional access is planned and
requires a separate state-level output. Setup inspects target columns before
changing policies and rejects missing filter dimensions. Direct imports of the deployed builders and setup function exercise
that guard with fake API clients; they do not grant or verify real user access.

Output policies must be configured on each reporting output. Input permissions
must be assessed separately; an input policy does not establish the output's
access scope. The repository's example config is not an operational security policy.

### Pressure index and projections

The public index uses project-defined weights and is not validated against
sales outcomes. SQL and JavaScript include linear projection fields; the public
UI does not present forecasts. Variability labels are not statistical confidence
intervals. The legacy `market_validated_amount` field remains for compatibility;
pressure-weighted dollars are not displayed by the public app.

## What verification establishes

| Check | Establishes | Does not establish |
|---|---|---|
| Dashboard regression tests | Computed summaries, ranking, policy counts and sample/recorded-state handling on fixtures | Business outcomes or full-release accuracy |
| Python policy tests | Offline policy construction and schema rejection before mutation | Access enforcement in Domo |
| Independent Decimal lineage tests | Services, providers and three weighted payment columns reconcile across all 870 real mart rows | Actual CMS populations or external service execution |
| Shared Spark regressions and reproduction | Real ingestion/staging/mart functions, quality guards and all business columns reproduce | Databricks, Airflow, Delta replacement or Domo services |
| Ruff, syntax and DAG import checks | Source validity and expected DAG tasks | Successful scheduled execution |
| Web / Domo package builds | App bundles compile | A working external integration |
| Public browser verification | Deployed pages, links and displayed values can be inspected | Real adoption, live CRM data or live Domo security |
| Conditional Domo verification job | Live API checks only when credentials are configured | A syntax-only fallback is not live verification |

## Operational work remaining

Reconcile complete source releases; collect Databricks and Airflow execution
receipts; run DataFlows in Domo; verify each intended user's output access;
replace synthetic CRM and usage data with controlled sources; and evaluate the
index against outcomes before using it for sales prioritization.

## Distinct specialty provider contract

`build_mart` counts distinct `provider_npi` at specialty/year grain directly from
staging, joins it to procedure rows as `specialty_total_providers`, and retains
procedure-level `total_providers` separately. The Domo upload schema includes the
new field. Transform 1 uses MAX of the repeated specialty count; the browser
requires the field to be consistent and never falls back to summed distincts.
Existing external Domo datasets must be migrated to this schema before using the
updated DataFlow. No Domo migration or external execution is claimed here.
