# SpecialtyPulse external deployment

This is the deployment path for the existing **synthetic portfolio fixtures**.
It does not convert those fixtures into historical CMS data. The public Vercel
dashboard continues to use its pinned build-time artifact.

## Execution status — October 25, 2026

- Databricks: no authenticated workspace configured; cloud execution pending.
- Airflow: local Docker runtime healthy, DAG imports without errors and is paused;
  an annual schedule is defined but not enabled. End-to-end execution is pending access.
- Domo: saved OAuth credentials return HTTP 400; live delivery verification blocked.
- No Databricks run, Domo delivery, DataFlow, App, card or live PDP success is claimed.

## Architecture

`Airflow preflight → saved serverless Databricks job → Domo API upload/readback → receipt`

The Databricks job reads all three pinned years, uses the unchanged shared Spark
transformations, writes raw/staging/mart Unity Catalog Delta tables, and compares
all 870 mart business rows against the reconciled public artifact. Delta overwrite
replaces each table in a single table commit; the three tables are not one
cross-table transaction. A run-specific Volume export carries its SHA-256 and
business-content hash. Airflow only delivers an export from a successful run and
checks its bytes before upload. Domo returns every business row for comparison.

Domo delivery runs in the Airflow worker, so Databricks does not receive Domo
credentials or require outbound access to Domo. Delivery uses a dedicated
`specialtypulse_synthetic_mart_v1` DataSet and refuses a different name/schema.
It does not overwrite the legacy Domo App's DataSets. A verified DataSet delivery
still requires separate DataFlow, card, App mapping and intended-user/PDP checks
before those integrations can be described as verified.

## Databricks

1. Sign in to an existing workspace, or create a Free Edition workspace through
   https://www.databricks.com/learn/free-edition. The account owner completes any
   signup terms and access authorization. Find the workspace URL and catalog name.
2. Configure the Databricks SDK with authorized credentials outside the repository.
   For this local portfolio setup it reads `DATABRICKS_HOST` and `DATABRICKS_TOKEN`.
3. Install `databricks-sdk==0.157.0 requests==2.32.5` in an isolated Python environment.
4. Review the plan, then apply to the selected catalog and a dedicated user path:

```sh
python -m deployment.deploy_databricks --catalog YOUR_CATALOG --workspace-root /Workspace/Users/YOUR_EMAIL/specialtypulse
# Same command plus --apply performs the remote changes.
```

The script requires an existing catalog, creates dedicated schemas and a managed
Volume, uploads fixture/module files, and creates a serverless job with no second
schedule. No paid cluster configuration, ACL or secret scope is created. A repeat
deployment updates only the job recorded in ignored `deployment/.state.json`.
First run the job manually and inspect its receipt and Delta tables before
enabling the Airflow schedule. Free Edition compute quotas still apply.

## Local Airflow

```sh
docker compose -f deployment/airflow/compose.yaml up -d --build
docker compose -f deployment/airflow/compose.yaml exec airflow airflow dags list-import-errors
```

The UI is bound to http://127.0.0.1:8087. The `portfolio` admin password is generated
by Airflow and stored in the private Docker volume. This standalone local runtime
is for a portfolio deployment; it needs this computer and Docker running.

The DAG is created **paused**, with `@yearly`, catchup disabled and one active run.
This is an annual fixture refresh, not a CMS release-detection sensor. Configure
`deployment/airflow/.env` from the example, use the job ID in the deployment state,
then recreate the container. Keep real credentials out of Git and chat. Configure
the Databricks connection JSON as well as the SDK credentials. Preflight fails
before compute if required settings or Domo access are missing.

After a successful manual end-to-end run and receipt review:

```sh
docker compose -f deployment/airflow/compose.yaml exec airflow airflow dags unpause specialtypulse_annual_pipeline
```

Verify that the scheduler is healthy, the DAG is unpaused, its next annual run is
listed, and the manual run contains matching Databricks and Domo receipts. An
imported DAG or a running UI alone is not a successful pipeline or active schedule.

## Offline checks

`python -m pytest tests/test_cloud_deployment.py -q` exercises fixture integrity,
job specification, failed credentials, schema guards, delivery errors, missing or
changed rows and full business-value readback using test doubles. These are code
checks, not evidence of a Databricks or Domo service run.

References: [Databricks serverless limits](https://docs.databricks.com/aws/en/getting-started/free-edition-limitations),
[Delta overwrite semantics](https://docs.databricks.com/aws/en/delta/selective-overwrite),
[Airflow Databricks operator](https://airflow.apache.org/docs/apache-airflow-providers-databricks/stable/operators/run_now.html),
[Airflow local Docker guidance](https://airflow.apache.org/docs/apache-airflow/stable/howto/docker-compose/).
