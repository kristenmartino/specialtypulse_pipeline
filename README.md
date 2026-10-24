# SpecialtyPulse Pipeline

A healthcare analytics portfolio project with PySpark notebooks, an Airflow DAG, Domo integration code and a five-page React dashboard.

**[Public demo](https://specialtypulse.kristenmartino.ai)** — bundled reimbursement samples (CY2021–2023), synthetic sales and usage data, and illustrative policy-check results. This is not an operational healthcare deployment or live security assessment. The Domo trial has ended; live policy verification requires a configured Domo instance.

The source contract supports additional years; bundled demo coverage is 2021–2023. Metric weights are design assumptions, not validated sales predictors. Stakeholder roles and approval workflows are illustrative; no executive sign-off is claimed.

---

## Architecture

This project mirrors a real healthcare analytics stack — specifically the pattern used at
companies like ModMed where Databricks handles transformation, Airflow orchestrates pipelines,
and Domo serves as the BI and executive reporting layer.

```
┌─────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATION LAYER                         │
│                    Apache Airflow (local)                       │
│              airflow/dags/specialtypulse_dag.py                 │
│         Triggers notebooks in sequence, handles retries         │
└──────────────┬──────────────────────────────┬───────────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐    ┌─────────────────────────────────┐
│   TRANSFORMATION LAYER   │    │        DELIVERY LAYER           │
│  Databricks (Free Ed.)   │    │   Dashboard (dual-mode)         │
│                          │    │                                 │
│  01_ingest_cms_puf       │    │  Domo runtime: native App    │
│     ↓                    │    │  • DataSet: mart_reimb_trends   │
│  02_staging              │───▶│  • SQL DataFlow: benchmarks     │
│     ↓                    │    │  • PDP: row-level security      │
│  03_marts                │    │                                 │
│     ↓                    │    │  Public demo: standalone web    │
│  04_push_to_domo ────────┼───▶│  • Vercel build, live URL       │
│                          │    │  • representative bundled data  │
│  Storage: Delta Lake     │    │  • 5-page SpecialtyPulse UI     │
└──────────────────────────┘    └─────────────────────────────────┘
```

The dashboard is a single React codebase that runs in two modes: as a native
**Domo App** (reading live Domo DataSets via `domo.js` behind PDP) and as a
**standalone web build** (Vercel) that falls back to bundled representative data
when `window.domo` is absent — that fallback is what powers the live demo above.

> **Pipeline boundary:** the Databricks notebooks + Airflow DAG build and deliver
> the reporting Delta mart to Domo. The Domo **SQL DataFlow** (specialty benchmarks,
> compression drivers, projections, and the Reimbursement Pressure Index) and the
> **dashboard** are built inside Domo / the React app — they are *not* executed by
> the Databricks/Airflow pipeline. See `docs/PRD.md` §5.2–5.3 for per-component
> build status. (In the standalone web build, that DataFlow scoring logic is ported
> to JavaScript and the Pressure Index is **recomputed in the browser** from the
> mart — see `domo/app/src/data/pressureIndex.js` — so the live demo shows the
> formula's actual output, not hard-coded values.)

### How this maps to ModMed's stack

| This project | ModMed equivalent | Purpose |
|---|---|---|
| Databricks Free Edition | Databricks (production) | PySpark transformations on raw data |
| Local Airflow via Astro CLI | Apache Airflow (managed) | DAG orchestration, scheduling, retries |
| Domo API push script | Databricks → Domo connector | Landing clean data into Domo DataSets |
| Domo SQL DataFlow | Domo SQL DataFlow | Documented metric definitions |
| Domo App (native, behind PDP) | Domo dashboard | Executive / operational reporting (production) |
| Standalone web build (Vercel) | — | Public demo surface on representative data |
| Delta tables (Unity Catalog) | S3 + Delta Lake | Intermediate storage between layers |

---

## Data Contract

| Attribute | Value |
|---|---|
| **Source** | CMS Medicare Physician PUF (Public Use File) |
| **Years** | 2021, 2022, 2023, 2024, 2025 |
| **Grain** | `provider_npi` × `hcpcs_code` × `year` |
| **Mart grain** | `provider_specialty` × `hcpcs_code` × `year` |
| **Owner** | Kristen Martino — pipeline runs annually post-CMS release |
| **Refresh** | Annual (triggered manually after CMS data release) |
| **Domo DataSet** | `specialtypulse_mart_reimbursement_trends` |
| **Definitions** | Formulas documented in `docs/METRIC_CERTIFICATION_LOG.md`; enforced via in-pipeline null/uniqueness/range assertions |

---

## Metric definitions

These definitions are enforced in the Databricks mart notebook and the
Domo SQL DataFlow. Any change requires a version bump and an entry in `docs/METRIC_CERTIFICATION_LOG.md`.
The five definitions below match the five entries in that log. No external certification is claimed.

| Metric | Definition | Grain |
|---|---|---|
| `avg_medicare_payment` | Weighted avg payment (by service volume) | specialty × hcpcs × year |
| `payment_to_charge_ratio` | `avg_medicare_payment / avg_submitted_charge` | specialty × hcpcs × year |
| `yoy_volume_change_pct` / `yoy_payment_change_pct` | `(current - prior) / prior` — YoY % change in services and payment | specialty × hcpcs × year |
| Reimbursement Pressure Index (`pressure_index`) | Composite: `0.30 × compression + 0.30 × trajectory + 0.25 × volume + 0.15 × market_size`, normalized 0–100 | specialty × year |
| `is_payment_outlier` | `payment_to_charge_ratio` > 2 stddev below specialty mean for that year | specialty × hcpcs × year |

`total_services` and `specialty_avg_payment` are mart/benchmark columns the dashboard
consumes, but they are not among the five metric entries in
`docs/METRIC_CERTIFICATION_LOG.md`.

---

## Dashboard

The React app (`domo/app/`) is a five-page analytics dashboard built with Recharts
on a shared component library (`KpiCard`, `ChartPanel`, `DataTable`, `TabBar`,
`PressureBadge`) and a thin data layer (`domoFetch.js`, `mockData.js`, `constants.js`).

| Page | What it shows |
|---|---|
| **Market Intelligence** | Specialty-level reimbursement pressure, benchmarks, and YoY trends |
| **Procedure Detail** | Drill-down into individual HCPCS procedures and payment-to-charge ratios |
| **Pipeline Intelligence** | Synthetic opportunities compared with reimbursement pressure |
| **Adoption Tracking** | Dashboard engagement and usage by role |
| **PDP Governance** | Example roles, sample check results and access-policy matrix |

The dashboard supports specialty drill-downs, ranked procedure views and a collapsible summary. Procedure views rank the latest year's top ten services within the selected specialty. Summary links open the related views directly. All summaries are computed; the app makes no model calls.

The public build has one demo disclosure. Governance results have no generated verification timestamp. CI runs live policy verification only with configured Domo credentials; its fallback checks syntax only.

See [`domo/app/README.md`](domo/app/README.md) for full local-dev, Vercel, and Domo
publishing instructions.

---

## Project Structure

```
specialtypulse_pipeline/
├── .github/
│   └── workflows/
│       └── ci.yml                      ← CI: lint, app build, PDP governance check
├── databricks/
│   └── notebooks/
│       ├── 01_ingest_cms_puf.py        ← Load raw CMS CSV → Delta (raw layer)
│       ├── 02_staging.py               ← Clean, type-cast, normalize → Delta (staging)
│       ├── 03_marts.py                 ← Aggregate, YoY, benchmarks → Delta (mart)
│       └── 04_push_to_domo.py          ← Push mart → Domo DataSet via API
├── airflow/
│   ├── dags/
│   │   └── specialtypulse_dag.py       ← Orchestrates all 4 notebooks
│   └── include/
│       └── cms_schema.py               ← Column definitions, data contract constants
├── domo/
│   ├── sql_dataflow.sql                ← The SQL DataFlow to build in Domo UI
│   ├── app/                            ← 5-page dashboard: standalone web (Vercel) + Domo App
│   │   ├── package.json                ← React 18, Recharts, Webpack 5 (build / build:web)
│   │   ├── webpack.config.js           ← Build config
│   │   ├── vercel.json                 ← Standalone web build (build:web → dist/)
│   │   ├── manifest.json               ← Domo app DataSet bindings (6 DataSets)
│   │   └── src/
│   │       ├── index.html              ← HTML entry point
│   │       ├── index.js                ← React DOM mount
│   │       ├── App.jsx                 ← Tab shell + computed summary
│   │       ├── pages/                  ← MarketIntelligence, ProcedureDetail,
│   │       │                              PipelineIntelligence, AdoptionTracking, PdpGovernance
│   │       ├── components/             ← KpiCard, ChartPanel, DataTable, TabBar,
│   │       │                              PressureBadge, DashboardSummary, InsightStrip, InfoTip
│   │       ├── data/                   ← domoFetch.js, mockData.js, constants.js
│   │       └── styles.css              ← Design tokens, dark theme
│   └── pdp/
│       ├── PDP_DESIGN.md               ← Security model: who sees what and why
│       ├── pdp_config.csv              ← User → role → filter values (source of truth)
│       ├── pdp_setup.py                ← Creates all PDP policies via Domo API
│       ├── pdp_verify.py               ← Verifies policies are correctly applied
│       └── pdp_verify_writer.py        ← Verify + write results to Domo DataSet
├── data/
│   ├── sample_2023_puf_10k.csv         ← 10k row CMS PUF sample for testing
│   ├── sample_sfdc_pipeline.csv        ← Synthetic Salesforce pipeline data
│   ├── sample_dashboard_engagement.csv ← Synthetic dashboard usage data
│   └── sample_mart_reimbursement_trends.csv ← Pre-built mart sample
├── tests/
│   └── test_pdp_policy_builders.py     ← PDP policy construction tests
├── docs/
│   ├── SETUP.md                        ← Step-by-step setup guide
│   ├── PRD.md                          ← Product requirements document
│   ├── TECHNICAL_DESIGN.md             ← Architecture and design decisions
│   ├── DASHBOARD_SPEC.md               ← Dashboard card specifications
│   ├── STAKEHOLDER_MAP.md              ← Ownership matrix and handoff points
│   └── METRIC_CERTIFICATION_LOG.md     ← Metric definition decisions and rationale
├── requirements.txt                    ← Python dependencies
├── .env.example                        ← Environment variable template
└── README.md
```

---

## Setup Instructions

### 1. Databricks Free Edition

1. Sign up at [signup.databricks.com](https://signup.databricks.com) (no credit card)
2. Create schemas and Volume (see `docs/SETUP.md` Part 1)
3. Upload `data/sample_2023_puf_10k.csv` to the Volume
4. Import and run notebooks in order: 01 → 02 → 03 → 04

### 2. Airflow (local via Astro CLI)

```bash
# Install Docker Desktop first, then:
brew install astro          # macOS
# or: curl -sSL install.astronomer.io | sudo bash  (Linux/WSL)

# Initialize and start
mkdir airflow && cd airflow
astro dev init
cp ../airflow/dags/specialtypulse_dag.py dags/
cp ../airflow/include/cms_schema.py include/
astro dev start             # Airflow UI at localhost:8080 (admin/admin)
```

### 3. Domo

1. Activate your Domo free trial at [domo.com](https://domo.com)
2. Run `databricks/notebooks/04_push_to_domo.py` to push the mart DataSet
3. In Domo Data Center: create a new SQL DataFlow using `domo/sql_dataflow.sql`
4. Build dashboard cards on top of the DataFlow output

### 3.5 Set up row-level security (PDP)

1. Edit `domo/pdp/pdp_config.csv` with real Domo user emails
2. Set environment variables:
```bash
export DOMO_CLIENT_ID="your-client-id"
export DOMO_CLIENT_SECRET="your-client-secret"
export DOMO_DATASET_ID="your-output-dataflow-dataset-id"   # OUTPUT, not input
export DOMO_INPUT_DATASET_ID="your-mart-dataset-id"        # for antipattern check
```
3. Run setup: `python domo/pdp/pdp_setup.py`
4. Verify: `python domo/pdp/pdp_verify.py`

See `domo/pdp/PDP_DESIGN.md` for the full security model and the critical
explanation of why PDP must be on the DataFlow **output**, not the input.

### 4. Run the dashboard

```bash
cd domo/app
npm install

# Local dev (representative bundled data — no Domo/Vercel needed)
npm start                 # http://localhost:3000

# Standalone web build (powers the live demo)
npm run build:web         # outputs to dist/
# Deploy on Vercel with project root = domo/app; vercel.json wires build:web → dist/.

# Native Domo App
npm run build && domo publish
```

### 5. Tests & tooling

```bash
pip install -r requirements.txt
pytest                    # PDP policy tests in tests/test_pdp_policy_builders.py
ruff check .              # lint (config in ruff.toml)
cp .env.example .env       # then fill in Domo/Databricks credentials
```

These mirror the GitHub Actions jobs in `.github/workflows/ci.yml`
(lint, app build, PDP governance check).

---

## Known Limitations & Notes

- **CMS suppression**: Rows with `tot_srvcs < 11` are excluded per CMS de-identification rules
- **Taxonomy shift (2023)**: CMS changed specialty taxonomy; handled in `02_staging.py`
- **Domo Free Trial**: DataSet push via API works on trial accounts
- **Databricks Free Edition**: Daily compute quota applies; CMS sample (~500MB) runs well within limits
- **YoY nulls**: 2021 is the base year — `yoy_*` columns are null for 2021 rows by design
- **Live demo data**: the hosted site runs on bundled *representative* data, not live Medicare data or live Domo DataSets
- **Sample vs. contract years**: the data contract spans 2021–2025; the bundled raw sample is 2023 only, and the representative demo data covers 2021–2023
- **Airflow 3.x**: the DAG uses `schedule` (not the deprecated `schedule_interval`) and requires `aiofiles`

---

*Built by Kristen Martino · GTM BI & Revenue Operations Analyst*  
*Demonstrates: Databricks PySpark · Airflow DAG orchestration · Domo DataSets + SQL DataFlows · PDP row-level security · React + Recharts dashboard (Domo App + standalone Vercel build) · GitHub Actions CI/CD*
