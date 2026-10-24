# SpecialtyPulse dashboard

A React app with five views: reimbursement comparisons, procedure detail, sales pipeline, usage and access policies.

The public demo uses bundled reimbursement samples (2021–2023), synthetic sales and usage, and example policy-check results. The shell discloses this once. A configured Domo runtime reads DataSets and recorded check timestamps instead.

## Using the dashboard

Select a specialty on the market table to open its procedures. Procedure Detail has a specialty selector; its callouts, flagged rows, facility mix and payment-ratio trend follow that selection. Most-used procedures are the latest year's top ten by service count, with full descriptions, HCPCS codes and average payments.

The collapsible dashboard summary computes observations and pipeline shares from the loaded data. Review links open the relevant view directly. There are no model calls or AI endpoints.

Pressure-weighted pipeline is deal amount × pressure score ÷ 100. Metric definitions and assumptions are in `../../docs/METRIC_CERTIFICATION_LOG.md`. The legacy field name `market_validated_amount` is retained for Domo compatibility.

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
