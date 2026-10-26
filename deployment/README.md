# SpecialtyPulse deployment

Current stack: **Databricks → Airflow-validated export → existing React dashboard**.
Domo is archived and is not required by this workflow.

## Verified October 26, 2026

Databricks Spark 4.2.0 processed 29,982 raw records into 870 persisted Delta mart
rows matching every reconciled business value. Airflow 3.1.8 completed the first
scheduled refresh and a separate clean manual run; all four clean-run tasks
passed on first attempts. [Execution evidence](../data/deployment_verification.json)
records receipts, task states, setup corrections and the selected export.

The annual UTC schedule is enabled. Its next run is January 1, 2027 at 00:00 UTC
(December 31, 2026 at 7 p.m. America/New_York). Airflow is a local macOS user
service: the Mac must be awake, the user signed in and OAuth access valid. The
Docker instance is stopped. This is not a managed cloud Airflow deployment.

The selected Databricks export is checked again at React build time. A scheduled
export does not automatically publish a website; publication remains an explicit
release step. All data remains synthetic and human validation remains pending.

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

## Airflow with secure CLI OAuth on macOS

The current local deployment runs Airflow as a macOS user service. All four
Airflow tasks use the Databricks SDK's unified authentication; the official CLI
refreshes the existing user OAuth credentials from macOS secure storage. No
OAuth token is copied into the repository, a Docker image or the service plist.

Create an isolated environment alongside this checkout:

```sh
uv venv --python 3.11 /PATH/TO/RUNTIME/airflow-venv
uv pip install --python /PATH/TO/RUNTIME/airflow-venv/bin/python -r deployment/airflow/requirements-host.txt
python -m deployment.local_airflow --root /PATH/TO/RUNTIME --host WORKSPACE_URL --job-id JOB_ID
# Add --apply to install the reviewed user service.
```

Loopback-only proxy exclusions avoid macOS system-preference discovery inside
forked task workers. The installer refuses enabled system proxies until an
explicit service proxy is configured; TLS verification remains enabled.

The installer generates a user LaunchAgent and binds the UI/task API to loopback
at http://127.0.0.1:8087. It starts at user login and restarts on failure. This is a
local portfolio runtime: the Mac must be awake, the user signed in, and OAuth
access valid. It is not managed cloud Airflow. The old Docker runtime is stopped
to prevent duplicate schedulers; its optional configuration remains available.

`validate_inputs → run_databricks_pipeline → publish_dashboard_export → notify_success`

The SDK submission records the external run ID before waiting and uses a stable
idempotency token per Airflow run, so a retry reconnects to the same external job.
Delivery accepts only a successful run of the configured job and task. It checks
export bytes and every business value, saves immutable files under
`data/releases/databricks-RUN_ID`, and atomically changes
`data/dashboard_release.json`. Airflow records its own receipt separately.

New DAG installations start paused, with one active run, catchup disabled and `@yearly` (an
annual fixture refresh, not CMS release detection). Verify a manual full-chain
run and refresh-capable worker authentication before enabling the schedule. A
first scheduled run can fire on initial enablement; its logical date is not the
actual execution date. Read the run's timestamps and the next-run creation time.

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
