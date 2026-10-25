# SpecialtyPulse setup

Use the current [deployment runbook](../deployment/README.md) for Databricks,
Airflow and the React dashboard. Domo is no longer required. Historical Domo
integration source is preserved under [archive/domo](../archive/domo/README.md).

For the public React dashboard, install dependencies in `domo/app`, run `npm test`
and `npm run build:web`. The directory name is retained for the existing Vercel
project configuration. It has no Domo SDK or runtime connection.
