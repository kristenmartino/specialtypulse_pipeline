# Technical Design Document: SpecialtyPulse Pipeline

**Companion to:** `docs/PRD.md`
**Author:** Kristen Martino
**Last updated:** March 2026

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATION LAYER                             │
│                    Apache Airflow (Astro CLI)                       │
│              airflow/dags/specialtypulse_dag.py                     │
│         Triggers notebooks in sequence, handles retries             │
└──────────────┬──────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     TRANSFORMATION LAYER                             │
│                    Databricks (Free Edition)                         │
│                                                                      │
│  01_ingest_cms_puf ──→ 02_staging ──→ 03_marts ──→ 04_push_to_domo │
│        (raw)             (clean)       (certified)     (delivery)    │
│                                                                      │
│  Storage: Delta Lake, partitioned by year                            │
└──────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     ANALYTICS & DELIVERY LAYER                       │
│                          Domo Platform                                │
│                                                                      │
│  DataSets:                                                           │
│    mart_reimbursement_trends (pushed by notebook 04)                 │
│    sfdc_pipeline (CSV upload — synthetic for portfolio)              │
│    dashboard_engagement (CSV upload — synthetic for portfolio)       │
│                                                                      │
│  DataFlows:                                                          │
│    specialty_benchmarks (aggregation + diagnostics + projections     │
│                          + Pressure Index)                           │
│    pipeline_intelligence (market × SFDC join)                        │
│                                                                      │
│  Dashboard: 5 pages, 15+ cards, PDP-filtered                        │
│  Domo App: PDP Governance viewer (React)                             │
│                                                                      │
│  Governance:                                                         │
│    PDP policies (pdp_setup.py)                                       │
│    PDP verification (pdp_verify_writer.py)                           │
│    Nightly CI check (GitHub Actions)                                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Design Decisions & Tradeoffs

Each decision below documents what was chosen, why, and what a production team would do differently. This section is intentional — it marks the boundary between what a BI analyst owns and what Data Engineering owns.

### 2.1 Raw ingestion: all strings, cast in staging

**Decision:** Read CMS CSV with `inferSchema=false`. All columns arrive as strings. Type casting happens in `02_staging.py`.

**Why:** CMS files have trailing spaces, empty strings, and inconsistent formatting across years. Letting Spark infer types causes silent casting failures (e.g., a payment value with a trailing space becomes null). Explicit casting with `regexp_replace` cleanup is safer and documents every transformation.

**Production note:** In a production environment, DE would likely define an explicit StructType schema for the read, which is even safer than inferring. The current approach is a pragmatic middle ground for a project where the schema changes slightly across CMS release years.

### 2.2 Taxonomy crosswalk: inline, not a seed table

**Decision:** The CMS specialty taxonomy crosswalk (mapping numeric codes to text labels) is defined inline in `02_staging.py` as a DataFrame literal.

**Why:** Databricks Free Edition doesn't support seed tables or dbt-style ref() patterns. The crosswalk is small (~80 rows) and changes rarely (only when CMS reclassifies, which happened once in 2023).

**Production note:** This should be a Delta table loaded from a version-controlled CSV seed file, managed by DE. The BI analyst would define the mappings; DE would own the ingestion mechanism. A PR to modify the crosswalk requires both BI review (are the mappings correct?) and DE review (does the schema change break downstream?).

### 2.3 Atomic table swap: DROP + RENAME

**Decision:** `03_marts.py` writes the new mart to a staging table, validates row count, then does `DROP TABLE IF EXISTS` + `ALTER TABLE RENAME`.

**Why:** This prevents a partial write from corrupting the production mart. If the write fails, the previous version stays intact.

**Tradeoff:** `DROP + RENAME` is not truly atomic in Delta Lake — there's a brief window where the table doesn't exist. In a production system with concurrent queries, this could cause failures.

**Production note:** DE would implement this using `CREATE OR REPLACE TABLE` (Delta Lake), or a blue-green deployment pattern where two tables exist and a view switches between them. The BI analyst defines what "valid" means (row count check, uniqueness check); DE implements the swap mechanism.

### 2.4 Domo push: single Dataset API call

**Decision:** `04_push_to_domo.py` converts the mart to pandas and pushes via `domo.datasets.data_import()` in a single call.

**Why:** The CMS mart is typically 200k-500k rows, well within the single-push limit. Simple, debuggable, and sufficient for annual refresh cadence.

**Production note:** For datasets exceeding 1M rows or for real-time/daily refresh, DE would implement the Domo Streams API with chunked uploads. The BI analyst specs the schema and refresh cadence; DE implements the transport mechanism.

### 2.5 Airflow DAG: DatabricksSubmitRunOperator with serverless

**Decision:** Each notebook runs as a separate Databricks job submission using serverless compute.

**Why:** Databricks Free Edition requires serverless. Each notebook is an independent unit with its own timeout and retry configuration.

**Production note:** DE would configure job clusters with appropriate instance types, autoscaling policies, and cost controls. The BI analyst defines the task dependencies and parameters; DE owns compute configuration and SLA management.

### 2.6 PDP on DataFlow output, not input

**Decision:** PDP policies are applied exclusively to the DataFlow output dataset. The input mart dataset has zero PDP policies.

**Why:** This is a critical Domo architectural constraint. PDP applied to DataFlow inputs is silently stripped during execution — the output receives unfiltered data, providing zero security while creating a false sense of protection. This is the #1 PDP mistake in enterprise Domo implementations.

**Production note:** This decision is correct for any environment. The `pdp_verify.py` script explicitly checks for this antipattern and fails if PDP is detected on the input. See `domo/pdp/PDP_DESIGN.md` for full documentation.

### 2.7 Trend projections: linear, not statistical

**Decision:** The DataFlow calculates next-year projections using the trailing average YoY change rate. This is a simple linear projection, not a statistical model.

**Why:** For a BI analyst role, a defensible directional projection is appropriate. The projection includes a confidence indicator based on trend variance — high-variance trends are labeled "Directional Estimate" rather than "High Confidence."

**Production note:** A data science team would upgrade this to an ARIMA, Prophet, or similar time-series model with proper confidence intervals. The BI analyst's role is to identify where prediction adds value and spec the requirements; the DS team builds the model. The `is_projected` flag and `projection_confidence` column are designed to be forward-compatible — a DS model would populate the same columns with better values.

### 2.8 Sample data: synthetic, not production

**Decision:** The project uses a generated 10k-row CMS PUF sample and a synthetic 500-row Salesforce extract. No real customer or production data.

**Why:** Portfolio project. The data is structurally realistic — correct column names, realistic value distributions, ModMed-relevant specialty concentrations — but not actual CMS or Salesforce records.

**Production note:** In production, the CMS data comes from the annual PUF release (500MB+ per year). The Salesforce data comes from a live connector in Domo or an Airflow-orchestrated extract. The pipeline code handles both the sample and full-scale data without modification (tested via the file fallback logic in `01_ingest_cms_puf.py`).

---

## 3. Data Flow Diagram

```
CMS PUF CSV (annual release)
    │
    ▼
┌──────────────────────────────────┐
│ 01_ingest_cms_puf.py             │
│ • Read CSV (all strings)         │
│ • Add year, source_file,         │
│   ingested_at audit columns      │
│ • Write Delta, partition by year │
│ • Validate: null NPI, null HCPCS │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│ 02_staging.py                                 │
│ • Rename columns (CMS names → clean names)    │
│ • Type cast (string → int/double)             │
│ • CMS suppression filter (services < 11)      │
│ • Taxonomy crosswalk (pre/post 2023)          │
│ • Derive payment_to_charge_ratio              │
│ • Generate surrogate key (md5)                │
│ • Validate: uniqueness, nulls, ratio range    │
│ • Write Delta staging, partition by year      │
└──────────────┬────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────┐
│ 03_marts.py (FULL REBUILD — all years)                │
│ • Aggregate: provider-level → specialty × hcpcs × yr  │
│ • Volume-weighted payment averages (CERTIFIED method)  │
│ • YoY calculations with consecutive-year guard         │
│ • Specialty benchmarks via window functions             │
│ • Outlier detection (2 stddev below specialty mean)     │
│ • Atomic swap: write staging → validate → rename       │
│ • Validate: uniqueness, null specialty, row count       │
└──────────────┬────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────┐
│ 04_push_to_domo.py                            │
│ • Read certified mart from Delta              │
│ • Convert to pandas                           │
│ • Create or find Domo DataSet                 │
│ • Push via Dataset API (full replace)         │
│ • Verify push: compare row counts             │
└──────────────┬────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Domo DataFlow: specialty_benchmarks                          │
│ • Aggregate to specialty × year                              │
│ • Compression driver classification (DIAGNOSTIC)             │
│ • Trend projection with confidence (PREDICTIVE)              │
│ • Reimbursement Pressure Index scoring (PRESCRIPTIVE)        │
│                                                              │
│ Domo DataFlow: pipeline_intelligence                         │
│ • Join benchmarks to SFDC pipeline on specialty + state      │
│ • Market-validated pipeline metric                           │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────┐
│ Domo Dashboard (5 pages, PDP-filtered)                  │
│ • Page 1: Market Intelligence (all 4 pillars)           │
│ • Page 2: Procedure Detail (diagnostic)                 │
│ • Page 3: Pipeline Intelligence (prescriptive)          │
│ • Page 4: Adoption Tracking                             │
│ • Page 5: PDP Governance (Domo App)                     │
│                                                         │
│ PDP Policies:                                           │
│ • finance_admin, executive → All Rows                   │
│ • specialty_analyst → filtered by provider_specialty     │
│ • regional_sales → filtered by provider_state           │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Data Contract

### 4.1 Mart grain and certified metrics

| Attribute | Value |
|---|---|
| Table | main.specialtypulse_marts.mart_reimbursement_trends |
| Grain | provider_specialty × hcpcs_code × year |
| Owner | Kristen Martino |
| Refresh | Annual (triggered by CMS PUF release) |
| Certification | All metrics in `CERTIFIED_METRICS` dict in `cms_schema.py` |
| Change control | Changes require version bump + updated tests + RevOps sign-off |

### 4.2 Column-level data contract

Defined in `airflow/include/cms_schema.py` — single source of truth imported by both the Airflow DAG and Databricks notebooks.

Key constraints enforced in pipeline:
- No null values in `provider_npi`, `hcpcs_code`, `year`, `total_services`, `avg_medicare_payment`
- `total_services >= 11` (CMS suppression — no exceptions)
- `surrogate_key` is unique across all rows
- `payment_to_charge_ratio` is null when `avg_submitted_charge` is 0 (not zero — null, to prevent misleading ratios)
- `yoy_*` columns are null for base year 2021 and for non-consecutive years (prevents misleading multi-year deltas)

---

## 5. Security Architecture

Defined in detail in `domo/pdp/PDP_DESIGN.md`. Summary:

| Layer | Mechanism | What it protects |
|---|---|---|
| Credential storage | Databricks Secrets (prod), env vars (dev) | API keys never in code |
| Row-level access | Domo PDP on DataFlow output | Users see only their specialty/states |
| Metric-level presentation | Beast Mode labels + dashboard design | Users see appropriate calculation method for their role |
| Governance monitoring | pdp_verify_writer.py + CI | Policy drift detected nightly |
| Antipattern prevention | pdp_verify.py checks input DataSet has NO PDP | Prevents false security from misplaced policies |

---

## 6. CI/CD Pipeline

Defined in `.github/workflows/ci.yml`.

| Job | What it checks | Trigger |
|---|---|---|
| validate | Python syntax (flake8), Airflow DAG structure, notebook syntax, PDP script syntax | Push, PR |
| app-build | Domo App builds successfully (npm install, webpack, verify output) | Push, PR |
| pdp-verify | PDP policies correct (live Domo if secrets present, syntax-only otherwise) | Push, PR, nightly schedule |

### What's tested in CI vs. what's tested manually

| Automated (CI) | Manual (Domo build) |
|---|---|
| Code syntax and lint | Dashboard card correctness |
| DAG structure (task names, dependencies) | DataFlow output validation |
| PDP policy state (live or mock) | Beast Mode formulas |
| Domo App build | PDP filter behavior per user role |
| Notebook compilability | Scheduled delivery configuration |

---

## 7. Failure Modes & Recovery

| Failure | Detection | Recovery |
|---|---|---|
| CMS file not found in Volume | `01_ingest` raises FileNotFoundError | Upload file, re-trigger DAG |
| Staging type cast fails (bad data in CMS file) | Null check assertions in `02_staging` | Investigate source data, update regexp_replace pattern |
| Duplicate surrogate keys | Uniqueness assertion in `02_staging` and `03_marts` | Investigate: likely a duplicate row in CMS source or a grain mismatch |
| Mart build fails partway through | Atomic swap: production table unchanged, staging table contains partial write | Re-run `03_marts` — overwrites staging table, retries swap |
| Domo push auth failure | `04_push_to_domo` raises error (not silent fallback) | Regenerate Domo API credentials, update secrets |
| PDP policy drift | `pdp_verify_writer.py` check fails, CI badge turns red | Run `pdp_setup.py` to recreate policies from config |
| DataFlow output missing expected columns | Dashboard cards show errors | Verify DataFlow SQL matches mart schema, rerun DataFlow |

---

## 8. Capacity & Performance

### Current (portfolio scale)

| Resource | Volume | Performance |
|---|---|---|
| CMS sample data | 10k rows × 3 years = 30k rows | Seconds to process |
| Mart output | ~5k-15k rows after aggregation | Sub-second Domo queries |
| SFDC pipeline | 500 rows | Trivial |
| Engagement data | 200 rows | Trivial |

### Production scale

| Resource | Volume | Consideration |
|---|---|---|
| CMS full PUF | ~10M rows per year × 5 years = 50M | Spark handles this natively; partition pruning on year is critical |
| Mart output | ~500k-1M rows | Single Domo API push works up to ~1M; above that, use Streams API |
| SFDC pipeline | 10k-50k opportunities | DataFlow join performs well at this scale in Domo |
| Dashboard queries | Concurrent users during QBR | Domo handles this; PDP adds minimal query overhead |

**Scaling decisions that belong to DE, not BI:**
- Cluster instance types and autoscaling for Databricks
- Partition strategy for Delta tables beyond year
- Domo Streams API implementation for large datasets
- Airflow infrastructure (managed vs. self-hosted, worker scaling)
