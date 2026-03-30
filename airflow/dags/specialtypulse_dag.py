"""
specialtypulse_dag.py
─────────────────────────────────────────────────────────────────────────────
Airflow DAG: SpecialtyPulse Annual Pipeline
Orchestrates the full CMS PUF → Databricks → Domo pipeline.

Schedule: @yearly (manual trigger for portfolio; in production would be
          triggered by a sensor watching for new CMS PUF file release)

Architecture:
  This DAG mirrors the pattern used at companies like ModMed where Airflow
  orchestrates Databricks notebook runs in sequence, with task-level retry
  logic, alerting, and clear dependency management.

  Task flow:
    validate_inputs
        ↓
    ingest_raw (01_ingest_cms_puf.py)
        ↓
    run_staging (02_staging.py)
        ↓
    run_marts (03_marts.py)
        ↓
    push_to_domo (04_push_to_domo.py)
        ↓
    notify_success

Prerequisites:
  1. Databricks connection configured in Airflow:
     Airflow UI > Admin > Connections > Add:
       Conn Id:   databricks_default
       Conn Type: Databricks
       Host:      https://your-workspace.azuredatabricks.net
       Password:  your-personal-access-token

  2. Domo secrets in Databricks (see 04_push_to_domo.py)

  3. CMS file uploaded to Databricks Volume before triggering DAG
─────────────────────────────────────────────────────────────────────────────
"""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.databricks.operators.databricks import DatabricksSubmitRunOperator
from airflow.utils.trigger_rule import TriggerRule

# Import shared data contract constants — single source of truth for table
# paths, valid years, and pipeline thresholds. See airflow/include/cms_schema.py.
from cms_schema import (
    RAW_TABLE,
    STAGING_TABLE,
    MART_TABLE,
    VALID_YEARS,
    CMS_SUPPRESSION_MIN,
    DOMO_DATASET_NAME,
)


# ── DAG DEFAULT ARGS ──────────────────────────────────────────────────────────
default_args = {
    "owner":            "kristen.martino",
    "depends_on_past":  False,
    "email":            ["kristen.martino@email.com"],
    "email_on_failure": True,
    "email_on_retry":   False,
    "retries":          2,
    "retry_delay":      timedelta(minutes=5),
    "retry_exponential_backoff": True,
}

# ── PIPELINE CONFIG ────────────────────────────────────────────────────────────
# These would come from Airflow Variables in production
# Set via: Airflow UI > Admin > Variables
DATABRICKS_CONN_ID  = "databricks_default"
DATABRICKS_CLUSTER  = "serverless"   # Free Edition uses serverless
SERVICE_YEAR        = 2023           # Override via Airflow Variable or DAG run conf

# Notebook paths — match where you imported them in Databricks workspace
NOTEBOOK_BASE = "/Workspace/Users/kristen.martino@email.com/specialtypulse"
NOTEBOOKS = {
    "ingest":  f"{NOTEBOOK_BASE}/01_ingest_cms_puf",
    "staging": f"{NOTEBOOK_BASE}/02_staging",
    "marts":   f"{NOTEBOOK_BASE}/03_marts",
    "domo":    f"{NOTEBOOK_BASE}/04_push_to_domo",
}


# ── HELPER: BUILD NOTEBOOK TASK CONFIG ────────────────────────────────────────
def notebook_task(path: str, params: dict = None) -> dict:
    """
    Returns the Databricks notebook task spec for DatabricksSubmitRunOperator.
    Using serverless compute (required for Free Edition).
    """
    task = {
        "notebook_task": {
            "notebook_path": path,
            "base_parameters": params or {},
        },
        "new_cluster": {
            # Serverless config for Databricks Free Edition
            # In production: replace with existing_cluster_id or job_cluster_key
            "spark_version":  "14.3.x-scala2.12",
            "node_type_id":   "Standard_DS3_v2",  # smallest available
            "num_workers":    1,
            "spark_conf": {
                "spark.databricks.cluster.profile": "singleNode",
                "spark.master": "local[*]",
            },
            "custom_tags": {
                "pipeline":    "specialtypulse",
                "environment": "portfolio",
            },
        },
    }
    return task


# ── VALIDATION FUNCTION ────────────────────────────────────────────────────────
def validate_pipeline_inputs(**context):
    """
    Pre-flight validation before running expensive Databricks jobs.
    In production: check S3 for new CMS file, validate Domo connectivity, etc.
    """
    run_conf = context.get("dag_run").conf or {}
    year = run_conf.get("year", SERVICE_YEAR)

    # Validate year against the data contract (from cms_schema.py)
    if int(year) not in VALID_YEARS:
        raise ValueError(
            f"Year {year} is not in VALID_YEARS {VALID_YEARS}. "
            "Update cms_schema.py to add new years."
        )

    print(f"Pipeline validation for year: {year}")
    print(f"  Valid years (cms_schema):  {VALID_YEARS}")
    print(f"  Target tables:             {RAW_TABLE} → {STAGING_TABLE} → {MART_TABLE}")
    print(f"  Domo DataSet:              {DOMO_DATASET_NAME}")
    print(f"  Databricks connection:     {DATABRICKS_CONN_ID}")
    print(f"  CMS suppression threshold: {CMS_SUPPRESSION_MIN}")

    # In production: add checks like
    #   - Verify CMS file exists in the Volume
    #   - Test Domo API connectivity
    #   - Validate no pipeline is already running

    print("✓ Validation passed — starting pipeline")
    return {"year": year, "validated_at": datetime.utcnow().isoformat()}


def notify_success(**context):
    """Post-pipeline success notification."""
    print("✓ SpecialtyPulse pipeline completed successfully")
    print(f"  DAG run ID:  {context['run_id']}")
    print(f"  Completed:   {datetime.utcnow().isoformat()}")
    # In production: send Slack notification, update lineage catalog, etc.


# ── DAG DEFINITION ─────────────────────────────────────────────────────────────
with DAG(
    dag_id="specialtypulse_annual_pipeline",
    description="CMS PUF ingestion → Databricks transformation → Domo delivery",
    default_args=default_args,
    schedule_interval="@yearly",   # Run once per year on CMS release
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["specialtypulse", "cms", "databricks", "domo"],
    doc_md=__doc__,
    # Allow manual trigger with year override:
    # airflow dags trigger specialtypulse_annual_pipeline --conf '{"year": 2024}'
    params={"year": SERVICE_YEAR},
) as dag:

    # ── TASK: validate inputs ─────────────────────────────────────────────────
    validate = PythonOperator(
        task_id="validate_inputs",
        python_callable=validate_pipeline_inputs,
        doc_md="Pre-flight checks before running Databricks notebooks.",
    )

    # ── TASK: ingest raw CMS data ─────────────────────────────────────────────
    ingest = DatabricksSubmitRunOperator(
        task_id="ingest_raw_cms",
        databricks_conn_id=DATABRICKS_CONN_ID,
        json=notebook_task(
            path=NOTEBOOKS["ingest"],
            params={"year": "{{ dag_run.conf.get('year', params.year) }}"}
        ),
        timeout_seconds=3600,      # 1 hour max for large CMS files
        polling_period_seconds=30,
        doc_md=(
            "Loads raw CMS PUF CSV into Delta raw layer. "
            "Notebook: 01_ingest_cms_puf.py"
        ),
    )

    # ── TASK: run staging transformations ─────────────────────────────────────
    staging = DatabricksSubmitRunOperator(
        task_id="run_staging",
        databricks_conn_id=DATABRICKS_CONN_ID,
        json=notebook_task(
            path=NOTEBOOKS["staging"],
            params={"year": "{{ dag_run.conf.get('year', params.year) }}"}
        ),
        timeout_seconds=3600,
        polling_period_seconds=30,
        doc_md=(
            "Cleans, casts, and standardizes raw data. "
            "Applies CMS suppression filter. "
            "Notebook: 02_staging.py"
        ),
    )

    # ── TASK: build marts ─────────────────────────────────────────────────────
    # NOTE: marts task does a FULL rebuild across all years.
    # No year parameter — it reads all staging data.
    marts = DatabricksSubmitRunOperator(
        task_id="run_marts",
        databricks_conn_id=DATABRICKS_CONN_ID,
        json=notebook_task(
            path=NOTEBOOKS["marts"],
            params={}   # No year param — full rebuild
        ),
        timeout_seconds=3600,
        polling_period_seconds=30,
        doc_md=(
            "Full rebuild of mart_reimbursement_trends. "
            "Calculates YoY, benchmarks, outlier flags. "
            "Notebook: 03_marts.py"
        ),
    )

    # ── TASK: push to Domo ────────────────────────────────────────────────────
    push_domo = DatabricksSubmitRunOperator(
        task_id="push_to_domo",
        databricks_conn_id=DATABRICKS_CONN_ID,
        json=notebook_task(
            path=NOTEBOOKS["domo"],
            params={}
        ),
        timeout_seconds=1800,
        polling_period_seconds=30,
        doc_md=(
            "Pushes certified mart to Domo DataSet via API. "
            "Notebook: 04_push_to_domo.py"
        ),
    )

    # ── TASK: notify success ──────────────────────────────────────────────────
    notify = PythonOperator(
        task_id="notify_success",
        python_callable=notify_success,
        trigger_rule=TriggerRule.ALL_SUCCESS,
        doc_md="Post-pipeline success notification.",
    )

    # ── TASK DEPENDENCIES (the DAG shape) ─────────────────────────────────────
    #
    #  validate → ingest → staging → marts → push_domo → notify
    #
    validate >> ingest >> staging >> marts >> push_domo >> notify
