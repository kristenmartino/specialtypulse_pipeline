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

A separate path proves one calculation:

```text
synthetic raw CSV → filter Dermatology / 99213 / services ≥11
  → service-weighted payment calculation → payment_verification.json
  → Procedure Detail calculation check
```

The verification artifact records source row numbers and a source-file hash.
It is independently checked with Python Decimal. This is an offline calculation
receipt; it is not the lineage of the separately generated dashboard mart.

### Databricks / Airflow / Domo integration — code present

```text
raw-format CSV → notebook 01 ingestion → notebook 02 staging
  → notebook 03 specialty/procedure/year mart → notebook 04 Domo upload
  → SQL DataFlow specialty/year output → configured Domo App
```

The DAG defines sequencing and retries. CI validates DAG import, expected tasks
and notebook syntax. Those checks do not execute a Databricks job or verify a
Domo DataFlow. No current external execution receipt is bundled. The Domo trial
has ended; current live checks require a configured instance and credentials.

## Design choices

### Explicit types in staging

The ingestion notebook reads string columns; staging normalizes values and
casts types explicitly. This makes transformation rules inspectable. Null,
uniqueness and range assertions are present in the notebook code; successful
syntax compilation alone does not establish that these assertions passed on data.

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
changing policies and rejects missing filter dimensions. Offline tests exercise
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
| Python payment-trace tests | Raw-fixture row selection, weighted arithmetic and generated artifact reconciliation | Spark execution or lineage of the dashboard mart |
| Ruff, syntax and DAG import checks | Source validity and expected DAG tasks | Successful scheduled execution |
| Web / Domo package builds | App bundles compile | A working external integration |
| Public browser verification | Deployed pages, links and displayed values can be inspected | Real adoption, live CRM data or live Domo security |
| Conditional Domo verification job | Live API checks only when credentials are configured | A syntax-only fallback is not live verification |

## Operational work remaining

Reconcile complete source releases; collect Databricks and Airflow execution
receipts; run DataFlows in Domo; verify each intended user's output access;
replace synthetic CRM and usage data with controlled sources; and evaluate the
index against outcomes before using it for sales prioritization.
