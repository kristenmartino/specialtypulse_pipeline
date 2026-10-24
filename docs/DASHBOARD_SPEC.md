# SpecialtyPulse dashboard: current specification

**Updated:** October 24, 2026
**Scope:** Current public React demo. See [implementation status](PRD.md) for external-runtime limits.

## Entry and provenance

The opening line states the review task: compare specialty payment trends,
inspect procedures and review synthetic sales exposure. Case-study and source
links remain available on each public view. One disclosure explains that all
reimbursement, sales and usage records are synthetic and that Domo access
controls are inactive here. Reimbursement records follow the CMS PUF schema; 2021–2022 are generated comparison scenarios.

## Views

| View | Current behavior | Definitions / boundary |
|---|---|---|
| Market Intelligence | Latest-year pressure ranking, payment-to-charge trends, payment/charge categories and service-volume scatterplot | Project-defined index; not a validated sales predictor. Select a specialty row to open Procedure Detail |
| Procedure Detail | Specialty selector, top ten latest-year services, average payments, flagged rows, ratio trend and facility mix | All analytical views follow the selected specialty. Blended specialty payment is not an expected rate for a clinically comparable procedure |
| Pipeline Intelligence | Active/won dollars, active amounts by specialty, specialty scores, owner totals and highest pressure tier | Synthetic opportunities. Scores and dollar amounts are separate; no pressure-weighted dollar KPI |
| Adoption Tracking | Active users, sessions, session duration, page/card interactions and roles for the displayed period | Synthetic activity; configured users form the adoption-rate denominator |
| PDP Governance | Role counts, six example rules, derived policy-group count and assignment matrix | Expected conditions, not simulated passing checks. Regional rows marked planned |

## Calculation check

Procedure Detail includes an expandable lineage check for Dermatology / HCPCS
99213 / 2023. It reconciles 57 source rows and 3,777 services to $104.91. The
normal procedure list uses this same exported Spark mart row. The check links
to the input/output artifact and local Spark execution receipt. It demonstrates
local execution, not external Databricks, Airflow or Domo service operation.

`?view=procedure` opens Procedure Detail directly; recognized view keys are
market, procedure, pipeline, adoption and pdp. Unknown keys open Market Intelligence.

## Computed summary

The collapsible summary appears on the three analysis views. Its observations
come from loaded data; buttons open the relevant view and specialty. A nested
table reconciles pipeline shares. There are no model calls or AI summary endpoints.

## Domo runtime

When `window.domo` exists, the app requests configured DataSet aliases. Recorded
policy checks remain distinct from sample rules and display their recorded
run time. The public browser verification does not test this external runtime.

## Removed or deferred ideas

Model-generated summaries and pressure-weighted pipeline KPIs were removed.
Geographic heatmaps, regional filtering, standardized-payment toggles, scheduled
Domo delivery and intended-user access tests are deferred. Projection fields
exist in the calculation layer but are not rendered as public forecasts.
