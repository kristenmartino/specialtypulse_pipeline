# SpecialtyPulse Pipeline

**A production-style data pipeline demonstrating the Databricks → Airflow → Domo architecture.**

Live dashboard: [SpecialtyPulse on Domo](https://your-domo-instance.domo.com)  
Source data: CMS Medicare Physician & Other Practitioners PUF, 2021–2025

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
│  Databricks (Free Ed.)   │    │         Domo Platform           │
│                          │    │                                 │
│  01_ingest_cms_puf       │    │  • DataSet: mart_reimb_trends   │
│     ↓                    │    │  • SQL DataFlow: benchmarks     │
│  02_staging              │───▶│  • Beast Modes: YoY calcs       │
│     ↓                    │    │  • Dashboard: SpecialtyPulse    │
│  03_marts                │    │  • PDP: dept-level security     │
│     ↓                    │    │                                 │
│  04_push_to_domo ────────┼───▶│                                 │
│                          │    │                                 │
│  Storage: Delta Lake     │    │                                 │
└──────────────────────────┘    └─────────────────────────────────┘
```

### How this maps to ModMed's stack

| This project | ModMed equivalent | Purpose |
|---|---|---|
| Databricks Free Edition | Databricks (production) | PySpark transformations on raw data |
| Local Airflow via Astro CLI | Apache Airflow (managed) | DAG orchestration, scheduling, retries |
| Domo API push script | Databricks → Domo connector | Landing clean data into Domo DataSets |
| Domo SQL DataFlow | Domo SQL DataFlow | Certified metric definitions |
| Domo dashboard | Domo dashboard | Executive / operational reporting |
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
| **Certified by** | Validated against CMS published summary statistics |

---

## Certified Metric Definitions

These definitions are enforced in the Databricks mart notebook and documented in the
Domo SQL DataFlow. Any change requires a version bump + updated tests.

| Metric | Definition | Grain |
|---|---|---|
| `total_services` | Sum of Medicare-allowed services | specialty × hcpcs × year |
| `avg_medicare_payment` | Weighted avg payment (by service volume) | specialty × hcpcs × year |
| `payment_to_charge_ratio` | `avg_medicare_payment / avg_submitted_charge` | specialty × hcpcs × year |
| `yoy_volume_change_pct` | `(current - prior) / prior` services | specialty × hcpcs × year |
| `yoy_payment_change_pct` | `(current - prior) / prior` payment | specialty × hcpcs × year |
| `specialty_avg_payment` | Specialty-wide weighted avg (benchmark) | specialty × hcpcs × year |
| `is_payment_outlier` | `payment_to_charge_ratio` > 2 stddev below specialty mean | specialty × hcpcs × year |

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
│   ├── app/                            ← PDP governance dashboard (Domo App)
│   │   ├── package.json                ← React 18, Webpack 5
│   │   ├── webpack.config.js           ← Build config + AI proxy for local dev
│   │   ├── manifest.json               ← Domo app DataSet bindings
│   │   └── src/
│   │       ├── index.html              ← HTML entry point
│   │       ├── index.js                ← React DOM mount
│   │       ├── App.jsx                 ← Governance UI: roles, checks, matrix, AI
│   │       └── styles.css              ← Design tokens, dark theme
│   └── pdp/
│       ├── PDP_DESIGN.md               ← Security model: who sees what and why
│       ├── pdp_config.csv              ← User → role → filter values (source of truth)
│       ├── pdp_setup.py                ← Creates all PDP policies via Domo API
│       ├── pdp_verify.py               ← Verifies policies are correctly applied
│       └── pdp_verify_writer.py        ← Verify + write results to Domo DataSet
├── docs/
│   └── SETUP.md                        ← Step-by-step setup guide
└── README.md
```

---

## Setup Instructions

### 1. Databricks Free Edition

1. Sign up at [signup.databricks.com](https://signup.databricks.com) (no credit card)
2. Create a new notebook for each file in `databricks/notebooks/`
3. Upload `data/sample_2023_puf_10k.csv` to a Volume: `Catalog > default > Volumes > upload`
4. Run notebooks in order: 01 → 02 → 03 → 04

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

---

## Known Limitations & Notes

- **CMS suppression**: Rows with `tot_srvcs < 11` are excluded per CMS de-identification rules
- **Taxonomy shift (2023)**: CMS changed specialty taxonomy; handled in `02_staging.py`
- **Domo Free Trial**: DataSet push via API works on trial accounts
- **Databricks Free Edition**: Daily compute quota applies; CMS sample (~500MB) runs well within limits
- **YoY nulls**: 2021 is the base year — `yoy_*` columns are null for 2021 rows by design

---

*Built by Kristen Martino · GTM BI & Revenue Operations Analyst*  
*Demonstrates: Databricks PySpark · Airflow DAG orchestration · Domo DataSets + SQL DataFlows*
