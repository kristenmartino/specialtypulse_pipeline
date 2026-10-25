"""Annual synthetic fixture refresh; paused until external access is verified.

Airflow starts the saved serverless Databricks job, then uploads its verified
mart export to Domo. Every business value is read back before reporting success.
"""
import hashlib
import os
from datetime import datetime, timedelta, timezone

from airflow import DAG
from airflow.providers.standard.operators.python import PythonOperator
from airflow.providers.databricks.operators.databricks import DatabricksRunNowOperator

from deployment.airflow_tasks import notify_success, push_verified_export, validate_connections


def idempotency_key(value):
    """Reconnect retries to the same external run instead of duplicating it."""
    return hashlib.sha256(value.encode()).hexdigest()


with DAG(
    dag_id="specialtypulse_annual_pipeline",
    description="Synthetic fixtures → verified Databricks Delta mart → verified Domo DataSet",
    schedule="@yearly",
    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    max_active_runs=1,
    is_paused_upon_creation=True,
    default_args={"owner": "kristen.martino", "retries": 1, "retry_delay": timedelta(minutes=2)},
    user_defined_filters={"specialtypulse_idempotency": idempotency_key},
    tags=["specialtypulse", "synthetic", "databricks", "domo"],
) as dag:
    validate = PythonOperator(task_id="validate_inputs", python_callable=validate_connections)
    pipeline = DatabricksRunNowOperator(
        task_id="run_databricks_pipeline",
        databricks_conn_id="databricks_default",
        job_id=int(os.getenv("SPECIALTYPULSE_DATABRICKS_JOB_ID", "0") or "0"),
        idempotency_token="{{ (dag.dag_id ~ ':' ~ run_id) | specialtypulse_idempotency }}",
        wait_for_termination=True,
        do_xcom_push=True,
        execution_timeout=timedelta(minutes=40),
    )
    delivery = PythonOperator(task_id="push_to_domo", python_callable=push_verified_export,
                              execution_timeout=timedelta(minutes=10))
    complete = PythonOperator(task_id="notify_success", python_callable=notify_success)
    validate >> pipeline >> delivery >> complete
