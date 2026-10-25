# SpecialtyPulse deployment

Current stack: **Databricks → Airflow-validated export → existing React dashboard**.
Domo is archived and is not required by this workflow.

## Current verification status

The local Airflow Docker runtime is healthy. The annual DAG loads without import
errors and remains paused until an authenticated Databricks run can be verified.
The local Spark baseline is verified; Databricks execution, Airflow-triggered
cloud execution and selected cloud-export publication require separate receipts.
An imported DAG or running UI alone does not establish a completed pipeline.

## Deploy Databricks

Use the official CLI's OAuth login for the selected workspace:

```sh
databricks auth login --host WORKSPACE_URL --profile SPECIALTYPULSE
export DATABRICKS_CONFIG_PROFILE=SPECIALTYPULSE
python -m deployment.deploy_databricks --catalog YOUR_CATALOG --workspace-root /Workspace/Users/YOUR_EMAIL/specialtypulse
# Add --apply to the same command after reviewing the plan.
```

Install `databricks-sdk==0.157.0` in an isolated Python environment. Keep credentials
outside Git and chat. The script requires an existing catalog, creates dedicated
schemas and a managed Volume, uploads pinned fixtures/modules, and creates one
serverless job. No second schedule or paid classic cluster is created. Deployment
state is saved in ignored `deployment/.state.json`.

The job uses unchanged shared Spark transformations for all three fixture years.
Each Delta table replacement is atomic for that table; the three tables are not
one transaction. It checks all 870 persisted mart business rows against the
reconciled baseline and saves a run-specific export plus receipt. The data remains
synthetic, regardless of execution platform.

## Airflow

```sh
docker compose -f deployment/airflow/compose.yaml up -d --build
docker compose -f deployment/airflow/compose.yaml exec airflow airflow dags list-import-errors
```

The UI is bound to http://127.0.0.1:8087. This standalone local runtime requires
this computer and Docker running. The generated `portfolio` admin password is
stored in its private Docker volume.

Configure the Databricks connection and job ID using the ignored
`deployment/airflow/.env`. The token example is an optional authentication method;
short-lived OAuth access tokens alone cannot support unattended annual execution.
Persistent scheduling needs refresh-capable credentials accessible to the worker.
The DAG has one active run, catchup disabled and `@yearly` (an annual fixture
refresh, not automatic CMS release detection). Keep it paused until the complete
manual path is verified and recurring authentication is configured.

`validate_inputs → run_databricks_pipeline → publish_dashboard_export → notify_success`

The delivery task reads only a successful Databricks run's export, verifies its
bytes and every business value, saves immutable files under
`data/releases/databricks-RUN_ID`, and atomically changes
`data/dashboard_release.json`. It records an Airflow receipt separately. Repeated
publishes of the same run are idempotent; changed artifacts for an existing run
are rejected. No Domo service, SDK, credential or DataSet is involved.

## Publish the dashboard

The existing Vercel project builds `domo/app` (a historical directory name). It
uses the selected cloud export when present, otherwise the verified local Spark
artifact. The build checks the cloud receipt, file hash, source revision, row count
and full business values before creating browser JSON. Source/transform hashes
for the local baseline are also checked.

After a successful Airflow run, review and commit its selected release files,
receipt and updated `sourceData.json`, build/test the dashboard, then publish.
Scheduled export creation and public website publication are distinct steps.
Downloaded briefs pin the selected export and receipt at the deployed revision.
The public dashboard remains a synthetic-data demo with illustrative access
assignments; no authenticated row-level access control is claimed.

## Checks

`python -m pytest tests -q` checks deployment configuration, release promotion,
wrong hashes, wrong values, incomplete receipts and immutable-run protection.
`npm test --prefix domo/app` checks dashboard calculations and brief exports.
CI also re-executes Spark and reproduces the full mart. Offline checks do not
replace live Databricks execution or an observed Airflow run.
