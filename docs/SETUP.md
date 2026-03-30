# Setup Guide — SpecialtyPulse Pipeline

Step-by-step instructions to get the full pipeline running.

---

## Part 1: Databricks Free Edition (30 min)

### 1.1 Create account
Go to https://signup.databricks.com
Sign up with your email — no credit card needed.
Choose "Free Edition" when prompted.

### 1.2 Create schemas
Once in your workspace, open a new notebook and run:

```sql
CREATE SCHEMA IF NOT EXISTS main.specialtypulse_raw;
CREATE SCHEMA IF NOT EXISTS main.specialtypulse_staging;
CREATE SCHEMA IF NOT EXISTS main.specialtypulse_marts;

CREATE VOLUME IF NOT EXISTS main.specialtypulse_raw.cms_files;
```

### 1.3 Upload sample data
1. Download the CMS PUF 2023 sample from:
   https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners

   OR use the included 10k sample from the repo: `data/sample_2023_puf_10k.csv`

2. In Databricks UI: Catalog > main > specialtypulse_raw > Volumes > cms_files > Upload

3. Rename the file to: `sample_2023_puf_10k.csv`

### 1.4 Import notebooks
1. In Databricks workspace: File > Import Notebook
2. Import each file from `databricks/notebooks/` in order:
   - 01_ingest_cms_puf.py
   - 02_staging.py
   - 03_marts.py
   - 04_push_to_domo.py

### 1.5 Test notebooks (before Airflow)
Run manually in order with the year widget set to 2023:
- Run 01 → confirm "SUCCESS: year=2023" exit value
- Run 02 → confirm validation passed message
- Run 03 → confirm mart built with summary table
- Skip 04 until Domo is set up (Part 3)

---

## Part 2: Airflow via Astro CLI (20 min)

### 2.1 Prerequisites
Install Docker Desktop: https://www.docker.com/products/docker-desktop/
Make sure Docker is running before proceeding.

### 2.2 Install Astro CLI

**macOS:**
```bash
brew install astro
```

**Linux / WSL:**
```bash
curl -sSL https://install.astronomer.io | sudo bash
```

**Windows:**
Download installer from https://docs.astronomer.io/astro/cli/install-cli

### 2.3 Initialize Airflow project

```bash
# Create project directory
mkdir specialtypulse_airflow && cd specialtypulse_airflow

# Initialize Astro project (creates DAGs/, plugins/, requirements.txt, etc.)
astro dev init

# Copy DAG and include files
# Adjust path below to where you cloned the repo
cp ../specialtypulse_pipeline/airflow/dags/specialtypulse_dag.py dags/
cp ../specialtypulse_pipeline/airflow/include/cms_schema.py include/
```

### 2.4 Add Databricks provider to requirements

Edit `requirements.txt` and add:
```
apache-airflow-providers-databricks==6.0.0
```

### 2.5 Start Airflow

```bash
astro dev start
```

This spins up Docker containers for the Airflow scheduler, webserver, and Postgres.
Airflow UI: http://localhost:8080
Login: admin / admin

### 2.6 Configure Databricks connection

In Airflow UI:
1. Admin > Connections > + Add Connection
2. Fill in:
   - Connection Id: `databricks_default`
   - Connection Type: `Databricks`
   - Host: `https://your-workspace-id.azuredatabricks.net`
     (find this in Databricks: User Settings > Developer > Access Tokens > workspace URL)
   - Password: your Databricks personal access token
     (Databricks: User Settings > Developer > Access Tokens > Generate new token)
3. Save

### 2.7 Trigger the DAG

In Airflow UI:
1. Find `specialtypulse_annual_pipeline` in the DAG list
2. Toggle it ON
3. Click ▶ (Trigger DAG) > Trigger DAG w/ config
4. Config: `{"year": 2023}`
5. Watch tasks execute in the Graph view

DAG graph will show:
```
validate_inputs → ingest_raw_cms → run_staging → run_marts → push_to_domo → notify_success
```

---

## Part 3: Domo (45 min — activate trial when ready)

Activate your Domo trial at https://www.domo.com/start/trial

### 3.1 Get Domo API credentials

1. In Domo: Admin > Security > Access Tokens > New Token
2. Note your Client ID and Client Secret
3. Store in Databricks Secrets:
```bash
# In Databricks CLI (install: pip install databricks-cli)
databricks secrets create-scope --scope domo
databricks secrets put --scope domo --key client_id
databricks secrets put --scope domo --key client_secret
```

### 3.2 Push mart DataSet to Domo

Run notebook `04_push_to_domo.py` in Databricks.
On first run it creates the DataSet and prints the DataSet ID.
**Save this DataSet ID** — you'll need it for PDP setup and the Domo App:
```
export DOMO_DATASET_ID="<the ID printed by notebook 04>"
```

### 3.3 Build the SQL DataFlow in Domo

1. Domo > Data > DataFlows > New DataFlow > SQL DataFlow
2. Add input DataSet: "specialtypulse_mart_reimbursement_trends"
3. Paste SQL from `domo/sql_dataflow.sql` (the SELECT query, not the comments)
4. Name output: "specialtypulse_specialty_benchmarks"
5. Run DataFlow — verify output rows in the preview

### 3.4 Add Beast Modes

Follow the Beast Mode instructions in `domo/sql_dataflow.sql` comments:
- `yoy_volume_label`
- `compression_category`
- `outlier_badge`
- `vs_benchmark_label`

### 3.5 Build dashboard cards

Create a new Domo Page called "SpecialtyPulse".
Suggested cards:

| Card | DataSet | Chart Type | Metrics |
|---|---|---|---|
| Volume Trend by Specialty | mart_reimbursement_trends | Line | total_services by year |
| Payment Compression Heatmap | mart_reimbursement_trends | Heat Map | payment_to_charge_ratio |
| YoY Volume Change | specialty_benchmarks | Bar | avg_yoy_volume_change |
| Outlier Procedures | mart_reimbursement_trends (filtered is_payment_outlier=true) | Table | hcpcs_code, specialty, ptcr |
| Specialty Benchmark Comparison | specialty_benchmarks | Bar | specialty_avg_payment |

---

## Part 3.5: PDP and Governance App

### 3.6 Set up row-level security (PDP)

1. Edit `domo/pdp/pdp_config.csv` with real Domo user emails
2. Copy `.env.example` to `domo/pdp/.env` and fill in your Domo credentials:
```bash
cp .env.example domo/pdp/.env
# Edit domo/pdp/.env with your DOMO_CLIENT_ID, DOMO_CLIENT_SECRET, DOMO_DATASET_ID
```
3. Run PDP setup: `python domo/pdp/pdp_setup.py`
4. Verify policies: `python domo/pdp/pdp_verify.py`
5. Write verify results to Domo: `python domo/pdp/pdp_verify_writer.py`

See `domo/pdp/PDP_DESIGN.md` for the full security model and the critical
explanation of why PDP must be on the DataFlow **output**, not the input.

### 3.7 Deploy the governance Domo App

1. Update `domo/app/manifest.json` with your DataSet IDs:
   - Replace `REPLACE_WITH_PDP_CONFIG_DATASET_ID` with the pdp_config DataSet ID
   - Replace `REPLACE_WITH_VERIFY_RESULTS_DATASET_ID` with the ID printed by `pdp_verify_writer.py`
2. Build and deploy:
```bash
cd domo/app
npm install
npm run build
domo login       # authenticate to your Domo instance
domo publish     # deploy the app
```
3. Find the app in Domo: App Store > My Apps. Add it to a Page.

---

## Part 4: Verify end-to-end

Full pipeline test:
1. In Airflow: trigger DAG with `{"year": 2023}`
2. Watch all 5 tasks go green
3. In Domo: confirm DataSet last updated timestamp is current
4. Confirm DataFlow ran and output has fresh rows
5. Confirm dashboard cards are populated

---

## Troubleshooting

**Airflow can't connect to Databricks:**
- Verify the Host URL has no trailing slash
- Verify the PAT hasn't expired (Databricks tokens expire after 90 days by default)
- Check Airflow logs: Airflow UI > DAG > Task > Logs

**Databricks notebook fails with file not found:**
- Confirm volume path: `/Volumes/main/specialtypulse_raw/cms_files/sample_2023_puf_10k.csv`
- The widget `file_path` can override the path if needed

**Domo push fails with authentication error:**
- Regenerate Domo access token
- Update Databricks secret: `databricks secrets put --scope domo --key client_id`

**Domo DataFlow returns no rows:**
- Confirm the input DataSet name matches exactly: `specialtypulse_mart_reimbursement_trends`
- Check DataSet row count in Domo Data Center
