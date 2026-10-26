"""Annual synthetic fixture refresh; newly installed DAGs start paused.

Airflow starts the saved serverless Databricks job, verifies its persisted mart
export, and selects a versioned artifact for the next React dashboard release.
"""
from datetime import datetime, timedelta, timezone

from airflow import DAG
from airflow.providers.standard.operators.python import PythonOperator
from deployment.airflow_tasks import notify_success, publish_verified_export, run_databricks_pipeline, validate_connections


with DAG(
    dag_id="specialtypulse_annual_pipeline",
    description="Synthetic fixtures → Databricks Delta mart → validated React dashboard export",
    schedule="@yearly",
    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    max_active_runs=1,
    is_paused_upon_creation=True,
    default_args={"owner": "kristen.martino", "retries": 1, "retry_delay": timedelta(minutes=2)},
    tags=["specialtypulse", "synthetic", "databricks", "react"],
) as dag:
    validate = PythonOperator(task_id="validate_inputs", python_callable=validate_connections,
                              execution_timeout=timedelta(minutes=5))
    pipeline = PythonOperator(
        task_id="run_databricks_pipeline",
        python_callable=run_databricks_pipeline,
        execution_timeout=timedelta(minutes=40),
    )
    delivery = PythonOperator(task_id="publish_dashboard_export", python_callable=publish_verified_export,
                              execution_timeout=timedelta(minutes=10))
    complete = PythonOperator(task_id="notify_success", python_callable=notify_success)
    validate >> pipeline >> delivery >> complete
