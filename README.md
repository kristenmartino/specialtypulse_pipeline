# SpecialtyPulse

A specialty-review prototype for healthcare-software sales teams, using synthetic
CMS-schema inputs, shared Spark transformations, Airflow orchestration and an
existing React dashboard.

[Public demo](https://specialtypulse.kristenmartino.ai/) ·
[Case study](https://kristenmartino.ai/work/specialtypulse-pipeline) ·
[Deployment runbook](deployment/README.md) ·
[Calculation evidence](docs/verification/payment-check.md)

## Current architecture

`Airflow → saved Databricks serverless job → validated versioned export → React build → Vercel`

Domo is no longer a runtime, build, delivery or CI dependency. Earlier SQL,
DataSet mappings and policy scripts are retained in [archive/domo](archive/domo/README.md).
The dashboard source remains in `domo/app` to preserve its existing Vercel project
root; that directory name does not imply a Domo runtime.

The Databricks deployment job reads the three pinned fixture years and uses the
same ingestion, staging and mart functions as the recorded local Spark run. It
writes Unity Catalog Delta tables and compares the complete persisted mart to the
reconciled public artifact before exporting. Airflow checks the receipt, file
hash and all business values, then selects the export in
`data/dashboard_release.json`. The React build independently checks the selected
export. Website publication still requires a release build and deployment;
scheduled export creation does not automatically publish a new website.

## Verification boundaries

- The recorded local Spark run processes **29,982 raw rows into 870 mart rows**.
  Independent Decimal calculations and CI reproduce every business column.
- Databricks Spark 4.2.0 and Airflow 3.1.8 completed scheduled and clean manual
  runs on October 26, 2026. All four clean-run tasks passed on first attempts.
  [Cloud execution evidence](data/deployment_verification.json) records task
  states and export receipts. Airflow runs locally on the Mac with secure CLI
  OAuth and an enabled annual schedule; host availability remains a dependency.
- The dashboard uses the selected verified Databricks export. Its downloaded
  briefs pin that mart and receipt to the app build's repository revision. A
  website release is separate from scheduled export creation.
- Sales, usage, comparison scenarios and access assignments are synthetic.
  **The public dashboard does not enforce user-specific access controls.**
- One AI assistant completed an internal export rehearsal. No human study,
  customer adoption, stakeholder approval or business benefit has been measured.

## Review workflow

A specialty analyst compares payment and service figures, inspects procedure
rows, and prepares a Markdown brief for a sales or operations lead. The brief
carries the observations and limits, open question, next reviewer, requested
check, pinned reimbursement/sales sources and a link back to the comparison.
Downloading saves a copy; it does not send or assign work. Drafts persist only
until the page reloads. [Proposed human evaluation](docs/BUSINESS_REVIEW.md).

All 2021–22 inputs are generated comparison scenarios; 2023 is a synthetic base.
These are not historical CMS observations. The pressure index has project-defined
weights, and sales amounts are assumed annual contract value, not revenue or a
validated forecast. The invented sales snapshot is August 31, 2026; overdue open
opportunities remain in the open-stage balance pending review.

## Run locally

```sh
cd domo/app
npm ci
npm test
npm run build:web
npm start
```

From the repository root:

```sh
python -m pytest tests -q
ruff check .
# With Java 21 and pyspark==4.0.1:
python scripts/run_local_pipeline.py --check
```

CI checks Python, dashboard regressions/build, DAG import, shared Spark
regressions and full mart reproduction. It does not require Domo credentials.

See [deployment instructions](deployment/README.md),
[metric definitions](docs/METRIC_CERTIFICATION_LOG.md),
[data provenance](data/README.md) and [business workflow](docs/BUSINESS_REVIEW.md).
