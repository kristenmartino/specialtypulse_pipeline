> Migration note: the current implementation uses Databricks, Airflow and the React dashboard. Domo-specific sections below describe the archived integration. See [current deployment](../deployment/README.md) and [current project status](../README.md).

# SpecialtyPulse dashboard: current specification

**Updated:** October 24, 2026
**Scope:** Current public React demo. See [implementation status](PRD.md) for external-runtime limits.

## Entry and provenance

The opening identifies a specialty analyst preparing a payment-pattern review for
a sales or operations lead. The intended decision is what to investigate and what
questions to hand off. Case-study and source links remain available. The disclosure
identifies synthetic CMS-schema inputs, generated 2021–2022 comparison scenarios,
illustrative sales/usage/access rules and inactive Domo controls.

Market Intelligence contains a collapsed sample-handoff panel before the charts.
A specialty selector updates its computed observations; links open procedures or
pipeline comparison. A downloadable Markdown brief contains questions, proposed
receiving roles, next checks and pending validation. Nothing is sent to a recipient.
The nested proposed acceptance criteria describe a future user evaluation with no
observed outcomes claimed. See [the business review plan](BUSINESS_REVIEW.md).

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
