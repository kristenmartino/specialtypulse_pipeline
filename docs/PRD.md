# SpecialtyPulse: scope and implementation status

**Owner:** Kristen Martino
**Updated:** October 24, 2026
**Status:** Public portfolio demo; no operational healthcare deployment.

## Purpose and intended workflow

An analyst compares specialty payment trends, opens a specialty's procedure
records and examines synthetic sales exposure. The project demonstrates data
modeling, metric definitions, dashboard navigation and example access-policy
logic. It does not establish sales prioritization accuracy or business impact.

The public app has five views: Market Intelligence, Procedure Detail, Pipeline
Intelligence, Adoption Tracking and PDP Governance. Start with a specialty in
the market table, inspect its procedures, then compare its active pipeline.

## Data provenance

All records are synthetic CMS-schema fixtures. The 2021–2022 inputs are generated
comparison scenarios, not historical CMS releases. Three raw files contain
29,982 records; the shared local Spark run produces 870 mart rows. The public
app uses this exported output. Source, transformation-code and output hashes,
counts and execution time are recorded in data/pipeline_run.json. Sales and usage
remain synthetic. See [data provenance](../data/README.md).

## Current implementation and verification

“Code present” means source can be inspected; it does not mean the external
system ran successfully. Current CI and deployment checks establish only the
boundaries listed below.

| Component | Current state | Evidence and limit |
|---|---|---|
| Shared ingestion, staging and mart transformations | Executed locally with Spark 4.0.1; notebook adapters import the same functions | Recorded local run, independent reconciliation of all 870 rows, CI full-output reproduction; Databricks/Delta I/O and Domo upload not verified |
| Airflow sequencing and retries | Code present; DAG import validated in CI | Import/task checks do not establish successful notebook execution |
| SQL DataFlow aggregation, change categories, projections and pressure score | SQL present | Public build executes the JavaScript implementation; no current Domo DataFlow run is verified |
| Specialty benchmarks and pressure index in public app | Implemented and exercised by regression tests | Computed from the synthetic dashboard mart in the browser |
| Specialty procedure selection, top-ten service ranking, flagged rows and trends | Implemented in public app | Current UI and regression tests; procedure comparison is not a clinically matched benchmark |
| Synthetic pipeline comparison | Implemented in public app | Joins latest specialty scores by specialty; amounts and scores are displayed separately |
| Usage view | Implemented in public app | Uses synthetic engagement; no observed product adoption is claimed |
| Computed dashboard summary and navigation links | Implemented in public app | Deterministic calculations; no model call or AI endpoint |
| Example policy configuration and schema guard | Directly tested deployed functions | Builders/setup imported without credential or HTTP side effects; schema guard stops incompatible filters before mutation |
| Public access-policy view | Implemented as example rules and assignments | No simulated pass results; public app does not enforce Domo PDP |
| Regional access | Planned extension | Needs a separate output retaining provider_state; specialty/year benchmarks omit state |
| Domo policy verification | Script present; conditional CI job | Domo credentials are required; syntax-only fallback is not live security verification |
| Metric definitions and stakeholder responsibilities | Written | Project design choices and proposed responsibilities; no external certification or stakeholder sign-off |
| Displayed payment lineage | Reconciled to the actual dashboard mart | Raw CSV → shared Spark path → exported mart → browser JSON → $104.91 / 3,777 services in the normal procedure list |

## Current dashboard scope

| View | Available now |
|---|---|
| Market Intelligence | Latest specialty ranking, payment-to-charge trends, payment/charge change categories and service-volume comparison |
| Procedure Detail | Specialty selector; latest-year top ten procedures by service count; payments, flagged rows, facility mix and ratio trend; raw-to-displayed-value lineage check |
| Pipeline Intelligence | Active and won amounts, active pipeline by specialty, scores and owner totals |
| Adoption Tracking | Users, sessions, average session duration and interactions for the displayed synthetic period |
| PDP Governance | Role counts, expected policy rules, derived policy-group count and assignments; regional entries marked planned |

## Metric decisions

Average payment is service-volume weighted at specialty × procedure × year
grain. Specialty payment-to-charge ratios average procedure-level ratios; this
is different from a ratio of totals. Submitted charges are not operating costs.

The pressure index combines compression, ratio change, service-volume change
and relative provider totals with project-defined weights. It is a comparison
heuristic, not purchase probability or a validated sales forecast. A provider
appearing under several procedures can contribute to several procedure totals.
The outlier flag and displayed deviation from the blended specialty payment
average are separate measures. See [metric definitions](METRIC_CERTIFICATION_LOG.md).

## Deferred and retired scope

- State-level outputs, regional filtering and live CRM integration remain planned.
- Domo scheduling, intended-user access tests and full-release reconciliation require a configured environment and execution evidence.
- Projection fields exist in the calculation layer; the public UI does not present forecasts or statistical confidence intervals.
- Standardized-payment toggles, geographic heatmaps and role-specific metric defaults are not implemented in the public UI.
- Model-generated summaries and pressure-weighted pipeline dollars were removed from the public app. A legacy weighted field remains in the DataFlow contract for compatibility; it is not a validated pipeline value.

## Validation and next steps

CI re-executes the shared Spark path and compares every business column with
the public mart. Independent Decimal tests reconcile all 870 groups. Direct
policy-builder tests exercise the deployed functions, not copied helpers.
Reproduce the pipeline with `python scripts/run_local_pipeline.py --check`;
see [the walkthrough](verification/payment-check.md) for runtime requirements.

Operational use would require complete-source reconciliation, successful
Databricks/Airflow execution receipts, Domo DataFlow and intended-user policy
tests, and validation of the pressure score against outcomes. Adoption and
business-impact targets would need baselines and observation; none are claimed.

## Supporting documents

- [Technical design and verification boundaries](TECHNICAL_DESIGN.md)
- [Current dashboard specification](DASHBOARD_SPEC.md)
- [Proposed stakeholder responsibilities](STAKEHOLDER_MAP.md)
- [Policy model](../domo/pdp/PDP_DESIGN.md)
- [Reproducible payment check](verification/payment-check.md)
