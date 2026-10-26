"""Airflow task functions. External authentication is checked only during a run."""
import hashlib
import json
import os
from datetime import timedelta
from pathlib import Path

from deployment.export_release import publish_export


def execute_databricks(client, job_id, idempotency_key, record_run):
    """Use SDK unified auth so the official CLI can refresh user OAuth securely."""
    waiting = client.jobs.run_now(job_id=job_id, idempotency_token=idempotency_key)
    record_run(waiting.run_id)
    waiting.result(timeout=timedelta(minutes=35))
    return waiting.run_id


def run_databricks_pipeline(ti, run_id, dag, **context):
    from databricks.sdk import WorkspaceClient
    key = hashlib.sha256(f"{dag.dag_id}:{run_id}".encode()).hexdigest()
    return execute_databricks(
        WorkspaceClient(), int(os.environ["SPECIALTYPULSE_DATABRICKS_JOB_ID"]), key,
        lambda value: ti.xcom_push(key="run_id", value=value),
    )


def validate_connections():
    required = ["DATABRICKS_HOST", "SPECIALTYPULSE_DATABRICKS_JOB_ID"]
    missing = [key for key in required if not os.getenv(key, "").strip()]
    if missing:
        raise ValueError("Deployment is not connected; missing settings: " + ", ".join(missing))
    if not os.environ["DATABRICKS_HOST"].startswith("https://"):
        raise ValueError("Databricks host must use HTTPS")
    int(os.environ["SPECIALTYPULSE_DATABRICKS_JOB_ID"])
    from databricks.sdk import WorkspaceClient
    # Supports the CLI OAuth profile or an explicitly configured deployment token.
    WorkspaceClient().current_user.me()


def publish_verified_export(ti, run_id, **context):
    from databricks.sdk import WorkspaceClient
    from databricks.sdk.service.jobs import RunResultState
    client = WorkspaceClient()
    parent_id = int(ti.xcom_pull(task_ids="run_databricks_pipeline", key="run_id"))
    run = client.jobs.get_run(parent_id)
    if (run.job_id != int(os.environ["SPECIALTYPULSE_DATABRICKS_JOB_ID"]) or
        run.state.result_state != RunResultState.SUCCESS or not run.tasks or len(run.tasks) != 1 or
        run.tasks[0].task_key != "build_and_verify_delta"):
        raise ValueError("Databricks run is not a successful single-task pipeline")
    output = client.jobs.get_run_output(run.tasks[0].run_id)
    if not output.notebook_output or output.notebook_output.truncated:
        raise ValueError("Databricks verification output is missing or truncated")
    receipt = json.loads(output.notebook_output.result)
    if receipt.get("status") != "verified" or receipt.get("run_key") != str(parent_id):
        raise ValueError("Databricks receipt does not identify this successful run")
    downloaded = client.files.download(receipt["export_path"])
    data = downloaded.contents.read()
    if hashlib.sha256(data).hexdigest() != receipt["export_sha256"]:
        raise ValueError("Databricks exported file differs from its run receipt")
    release = publish_export(os.environ["SPECIALTYPULSE_DATA_DIR"], data.decode(), receipt)
    result = {"airflow_run_id": run_id, "databricks_run_id": parent_id, "databricks": receipt, "release": release}
    directory = Path(os.getenv("SPECIALTYPULSE_RECEIPTS_DIR", "/opt/airflow/receipts"))
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f"databricks-{parent_id}.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def notify_success(ti):
    result = ti.xcom_pull(task_ids="publish_dashboard_export")
    if not result or result["databricks"]["status"] != "verified":
        raise ValueError("No verified dashboard export receipt")
    print(f"Verified synthetic pipeline: Databricks run {result['databricks_run_id']}; {result['release']['rows']} dashboard rows selected for release")
