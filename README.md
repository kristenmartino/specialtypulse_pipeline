# SpecialtyPulse

A healthcare analytics portfolio project by Kristen Martino: PySpark notebook
and Airflow DAG source, Domo integration code, and a public five-view React dashboard.

[Public demo](https://specialtypulse.kristenmartino.ai/) ·
[Case study](https://kristenmartino.ai/work/specialtypulse-pipeline) ·
[Implementation status](docs/PRD.md) · [Calculation evidence](docs/verification/payment-check.md)

A specialty analyst prepares a payment-pattern review for a sales or operations
lead: identify which scenario to investigate and what questions to hand off.
Market Intelligence includes a selectable sample brief and Markdown download,
with source/account validation pending. [Proposed acceptance criteria](docs/BUSINESS_REVIEW.md)
describe how a future user evaluation would assess the workflow. Selecting a specialty opens its procedure detail.
The summary calculates observations and links to the underlying views.

## Data provenance

All records are synthetic CMS-schema fixtures. The 2021–2022 inputs are
constructed comparison scenarios, not historical CMS observations. The three
raw files contain 29,982 records. Shared Spark transformations produce the
870-row mart used by the dashboard; the local run receipt links sources, code
and output. Sales and usage remain synthetic. See [file-level provenance](data/README.md).

## What is implemented and what is verified

| Area | Current state |
|---|---|
| Public dashboard | Deployed React app; benchmarks, pressure scores, ranked procedures and summaries computed from fixtures |
| Calculation check | Raw CSV → shared local Spark ingestion/staging/mart → actual procedure list; $104.91 / 3,777 services reconciled independently |
| PySpark notebooks | Shared ingestion/staging/mart functions executed locally with Spark; notebook adapters call the same functions. Databricks and Domo services remain unverified |
| Airflow DAG | Source present; CI validates import and expected tasks, not a successful Databricks run |
| Domo DataFlow | SQL present; public app runs the JavaScript implementation, not live Domo |
| Policy scripts | Direct imports test the deployed builders and setup function without credentials or network calls. Live checks require a configured Domo instance |
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

Reconciled dashboard input:
three synthetic raw CSVs → shared local Spark read / stage / mart
                         → exported mart CSV + execution receipt
                         → browser JSON → procedure list and calculation check
```

The actual run produced 29,982 staging rows and 870 mart rows. Source/code/output
hashes are recorded in data/pipeline_run.json. The app build rejects stale input
or output hashes. CI re-runs Spark and compares all business columns.

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
# With Java 21 and pyspark==4.0.1 installed:
python scripts/run_local_pipeline.py --check
ruff check .
```

CI runs Python lint, direct policy/payment tests, shared Spark transformation
regressions, full mart reproduction, notebook syntax/DAG validation, dashboard
regressions and a Domo package build. Its governance
job calls Domo only with configured credentials; the fallback checks script
syntax and provides no live security assurance.

## Repository guide

- `databricks/notebooks/`: shared Spark functions and notebook adapters.
- `scripts/`: scenario generation and the executable local Spark pipeline.
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

## External deployment

[Deployment runbook](deployment/README.md): serverless Databricks execution of
the pinned synthetic fixtures, Airflow orchestration, and Domo API delivery with
full business-row readback. Service access and live execution remain pending;
the runbook distinguishes preparation, local runtime checks and external runs.
