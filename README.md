# SpecialtyPulse

A healthcare analytics portfolio project by Kristen Martino: PySpark notebook
and Airflow DAG source, Domo integration code, and a public five-view React dashboard.

[Public demo](https://specialtypulse.kristenmartino.ai/) ·
[Case study](https://kristenmartino.ai/work/specialtypulse-pipeline) ·
[Implementation status](docs/PRD.md) · [Calculation evidence](docs/verification/payment-check.md)

Compare specialty payment trends, inspect procedure differences and review
synthetic sales exposure. Selecting a specialty opens its procedure detail.
The summary calculates observations and links to the underlying views.

## Data provenance

All bundled records are synthetic. Reimbursement fixtures follow the CMS
Medicare PUF schema; they are not actual CMS extracts. The raw-format fixture
has 9,994 rows for 2023. The independently generated dashboard mart has 570 rows
across 2021–2023. Sales and usage are synthetic too. A fixture timestamp is not
a pipeline execution receipt. See [file-level provenance](data/README.md).

## What is implemented and what is verified

| Area | Current state |
|---|---|
| Public dashboard | Deployed React app; benchmarks, pressure scores, ranked procedures and summaries computed from fixtures |
| Calculation check | Raw fixture → offline weighted-payment calculation → verification mart row → displayed $104.91 result, with independent Decimal tests |
| PySpark notebooks | Source present for ingestion, staging, mart and Domo upload; syntax checked, no current Databricks execution receipt bundled |
| Airflow DAG | Source present; CI validates import and expected tasks, not a successful Databricks run |
| Domo DataFlow | SQL present; public app runs the JavaScript implementation, not live Domo |
| Policy scripts | Source present; offline policy and schema-guard tests. Live checks require credentials and a configured Domo instance |
| Public access page | Example rules and assignments; no simulated passing results or active Domo enforcement |
| Regional filtering | Planned; specialty/year benchmarks omit state and need a separate state-level output |

The Domo trial has ended. No operational healthcare deployment, observed
adoption, executive sign-off or validated sales outcome is claimed. Pressure
weights are project-defined assumptions. See the [current PRD](docs/PRD.md) for
removed/deferred ideas and exact verification boundaries.

## Architecture

```text
Integration code:
raw-format CSV → PySpark ingestion / staging / mart → Domo upload
                   ↑ Airflow sequencing and retries
                   → SQL DataFlow → configured Domo App

Current public execution:
synthetic dashboard mart + sales CSV → build-time JSON → browser calculations
                                     → React / Recharts → Vercel

Separate calculation evidence:
synthetic raw CSV → offline weighted aggregation → payment_verification.json
                                               → public calculation check
```

The main dashboard mart is a separate fixture, not the output of the bundled
raw CSV. The verification example makes that boundary explicit.

## Run and check locally

```bash
cd domo/app
npm install
npm test
npm run build:web
npm start
```

The web output is `domo/app/dist/`. `npm run build` instead creates the package
filenames expected by Domo. `generate:data` runs before either build and creates
the browser input JSON and payment verification artifact.

From the repository root, with development dependencies installed:

```bash
python -m pytest tests -q
ruff check .
```

CI runs Python lint, offline policy/payment checks, notebook syntax and DAG
validation, dashboard regression checks and a Domo package build. Its governance
job calls Domo only with configured credentials; the fallback checks script
syntax and provides no live security assurance.

## Repository guide

- `databricks/notebooks/`: ingestion, staging, mart and upload source.
- `airflow/`: DAG and shared contract definitions.
- `domo/sql_dataflow.sql`: specialty benchmarks, change categories, projections, score and pipeline join.
- `domo/app/`: React UI, browser calculations, data generator and dashboard checks.
- `domo/pdp/`: example config, schema guard, setup and verification scripts.
- `data/`: synthetic fixtures and reproducible payment artifact.
- `tests/`: offline policy and payment-trace checks.
- `docs/`: current scope, technical choices, UI specification, metric definitions and proposed responsibilities.

[Dashboard setup and publishing](domo/app/README.md) ·
[External environment setup](docs/SETUP.md) ·
[Metric definitions](docs/METRIC_CERTIFICATION_LOG.md) ·
[Policy model](domo/pdp/PDP_DESIGN.md)
