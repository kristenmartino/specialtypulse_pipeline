# SpecialtyPulse dashboard

A React app with five views: reimbursement comparisons, procedure detail, sales pipeline, usage and access policies.

The public demo uses synthetic reimbursement records following the CMS PUF schema (2021–2023), synthetic sales and usage, and example policy rules. The shell discloses this once. A configured Domo runtime reads DataSets and recorded check timestamps instead.

## Using the dashboard

Select a specialty on the market table to open its procedures. Procedure Detail has a specialty selector; its callouts, flagged rows, facility mix and payment-ratio trend follow that selection. Most-used procedures are the latest year's top ten by service count, with full descriptions, HCPCS codes and average payments.

The collapsible dashboard summary computes observations and pipeline shares from the loaded data. Review links open the relevant view directly. There are no model calls or AI endpoints.

The public pipeline page shows active and won dollars separately from specialty pressure scores. It does not display pressure-weighted dollars. The legacy `market_validated_amount` field remains in the DataFlow contract for compatibility. Metric definitions and assumptions are in `../../docs/METRIC_CERTIFICATION_LOG.md`.

## Local preview and checks

```bash
npm install
npm start
npm test
npm run build:web
```

The web build is written to `dist/`. The default `npm run build` writes the filenames expected by the Domo app package. Recharts bundle-size warnings remain.

## Publishing

The Vercel project builds `domo/app` with `npm run build:web`. Its production domain is [specialtypulse.kristenmartino.ai](https://specialtypulse.kristenmartino.ai).

For Domo, configure the DataSet bindings in `manifest.json`, build with `npm run build`, and use the Domo CLI to publish. Domo trial access has ended; a new configured instance is required to run live checks.

`pdp_verify_writer.py` records policy-check results. CI runs it with configured Domo credentials; without credentials the governance job checks syntax. Sample results never receive a generated verification timestamp.

The standalone access page presents example rules as expected conditions, without simulated pass/fail results. Synthetic usage labels match the current dashboard views.

Policy group totals come from the displayed assignments, using the same role,
filter dimension and value grouping as the setup script. The example has 12
groups across 13 assignments. Regional rows are marked planned: the current
specialty/year output omits state, so those filters need a separate output that
retains `provider_state`. Setup checks schema compatibility before changing
policies.

The opening task and project links explain what to review. Procedure Detail
shows raw-to-displayed-mart lineage: 57 source rows / 3,777 services → $104.91.
That is the actual procedure-list value from the recorded local Spark run.
`generate:data` checks source/code/output hashes before building browser JSON.
See [the executable path](../../docs/verification/payment-check.md).
2021–2022 are generated comparison scenarios. `?view=procedure` opens the view
directly; unknown keys use Market Intelligence.
