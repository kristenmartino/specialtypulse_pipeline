# Databricks notebook source
# ─────────────────────────────────────────────────────────────────────────────
# 04_push_to_domo.py
# Layer:   DELIVERY
# Purpose: Push mart_reimbursement_trends from Delta to Domo via Domo Dataset API.
#          Creates the DataSet if it doesn't exist (first run).
#          Uses REPLACE mode — full refresh on each pipeline run.
#
# Input:   main.specialtypulse_marts.mart_reimbursement_trends (Delta)
# Output:  Domo DataSet: "specialtypulse_mart_reimbursement_trends"
#
# Prerequisites:
#   1. Store Domo credentials in Databricks Secrets:
#      databricks secrets create-scope --scope domo
#      databricks secrets put --scope domo --key client_id
#      databricks secrets put --scope domo --key client_secret
#   2. pip install pydomo (included in requirements.txt)
#
# Domo API docs: https://developer.domo.com/docs/dataset-api-reference/dataset
# ─────────────────────────────────────────────────────────────────────────────

# COMMAND ----------

# Install pydomo if not already present
# In production, add to cluster libraries; for Free Edition install inline
%pip install pydomo --quiet

# COMMAND ----------

dbutils.widgets.text("domo_dataset_id", "", "Domo DataSet ID (leave blank to create new)")
DATASET_ID_OVERRIDE = dbutils.widgets.get("domo_dataset_id").strip()

# COMMAND ----------

import json
import requests
from pydomo import Domo
from pydomo.datasets import DataSetRequest, Schema, Column, ColumnType

# ── CREDENTIALS ───────────────────────────────────────────────────────────────
# Stored in Databricks Secrets — never hardcode credentials
# To set up: see Prerequisites in header comment above
#
# For the Free Edition / local testing, you can temporarily set these as
# environment variables and read with os.getenv() — but use Secrets in prod.

try:
    CLIENT_ID     = dbutils.secrets.get(scope="domo", key="client_id")
    CLIENT_SECRET = dbutils.secrets.get(scope="domo", key="client_secret")
except Exception:
    # Fallback for local testing — replace with your actual values
    import os
    CLIENT_ID     = os.getenv("DOMO_CLIENT_ID", "your-client-id-here")
    CLIENT_SECRET = os.getenv("DOMO_CLIENT_SECRET", "your-client-secret-here")

print(f"Domo client ID: {CLIENT_ID[:8]}***")

# ── CONNECT ───────────────────────────────────────────────────────────────────
domo = Domo(CLIENT_ID, CLIENT_SECRET, api_host="api.domo.com")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 1 — Read mart from Delta

# COMMAND ----------

mart_df = spark.table("main.specialtypulse_marts.mart_reimbursement_trends")
row_count = mart_df.count()
print(f"Mart rows to push: {row_count:,}")

# Convert to pandas for Domo API
# Note: for large datasets (>1M rows) use chunked upload via Domo Streams API
# CMS PUF mart is typically 200k–500k rows — single push is fine
mart_pd = mart_df.toPandas()

# Convert boolean to string for Domo compatibility
mart_pd["is_payment_outlier"] = mart_pd["is_payment_outlier"].map({True: "true", False: "false"})

# Convert timestamps to string
mart_pd["mart_built_at"] = mart_pd["mart_built_at"].astype(str)

print(f"Converted to pandas: {len(mart_pd)} rows × {len(mart_pd.columns)} columns")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 2 — Define Domo DataSet schema

# COMMAND ----------

# Domo column types: STRING, LONG, DOUBLE, DECIMAL, DATE, DATETIME
# This schema is the DATA CONTRACT between Databricks and Domo.
# Any schema change here must be coordinated with the Domo SQL DataFlow owner.

DOMO_SCHEMA = Schema([
    Column(ColumnType.STRING,   "surrogate_key"),
    Column(ColumnType.STRING,   "provider_specialty"),
    Column(ColumnType.STRING,   "hcpcs_code"),
    Column(ColumnType.STRING,   "hcpcs_description"),
    Column(ColumnType.LONG,     "year"),
    Column(ColumnType.LONG,     "total_services"),
    Column(ColumnType.LONG,     "total_beneficiaries"),
    Column(ColumnType.LONG,     "total_providers"),
    Column(ColumnType.DECIMAL,  "pct_facility_services"),
    Column(ColumnType.DECIMAL,  "avg_medicare_payment"),
    Column(ColumnType.DECIMAL,  "avg_submitted_charge"),
    Column(ColumnType.DECIMAL,  "avg_medicare_standardized_amount"),
    Column(ColumnType.DECIMAL,  "payment_to_charge_ratio"),
    Column(ColumnType.LONG,     "prior_year_services"),
    Column(ColumnType.DECIMAL,  "yoy_volume_change_pct"),
    Column(ColumnType.DECIMAL,  "prior_year_avg_payment"),
    Column(ColumnType.DECIMAL,  "yoy_payment_change_pct"),
    Column(ColumnType.DECIMAL,  "specialty_avg_payment"),
    Column(ColumnType.DECIMAL,  "specialty_avg_ptcr"),
    Column(ColumnType.DECIMAL,  "payment_vs_specialty_pct"),
    Column(ColumnType.STRING,   "is_payment_outlier"),   # boolean as string
    Column(ColumnType.STRING,   "mart_built_at"),
])

DATASET_NAME = "specialtypulse_mart_reimbursement_trends"
DATASET_DESC = (
    "CERTIFIED — SpecialtyPulse mart. "
    "Grain: provider_specialty x hcpcs_code x year. "
    "Source: CMS Medicare Physician PUF 2021-2025. "
    "Owner: Kristen Martino. "
    "Do not modify without updating certified metric definitions."
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 3 — Create or update DataSet

# COMMAND ----------

def get_dataset_id_by_name(domo_client, name):
    """Search Domo for a DataSet by name. Returns ID if found, None otherwise."""
    offset = 0
    page_size = 50
    while True:
        datasets = domo_client.datasets.list(limit=page_size, offset=offset)
        if not datasets:
            break
        for ds in datasets:
            if ds.get("name") == name:
                return ds.get("id")
        if len(datasets) < page_size:
            break
        offset += page_size
    return None


if DATASET_ID_OVERRIDE:
    dataset_id = DATASET_ID_OVERRIDE
    print(f"Using provided DataSet ID: {dataset_id}")
else:
    # Check if dataset already exists
    dataset_id = get_dataset_id_by_name(domo, DATASET_NAME)

    if dataset_id:
        print(f"Found existing DataSet: {dataset_id}")
    else:
        # First run — create the DataSet
        print("DataSet not found — creating new DataSet...")
        ds_request = DataSetRequest()
        ds_request.name        = DATASET_NAME
        ds_request.description = DATASET_DESC
        ds_request.schema      = DOMO_SCHEMA

        created = domo.datasets.create(ds_request)
        dataset_id = created["id"]
        print(f"✓ Created new DataSet: {dataset_id}")
        print(f"  Save this ID for future runs: {dataset_id}")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 4 — Push data to Domo (full replace)

# COMMAND ----------

# Full replace — pushes all years fresh on each pipeline run
# This matches the mart rebuild strategy (full overwrite, not incremental)
print(f"Pushing {len(mart_pd):,} rows to DataSet {dataset_id}...")

domo.datasets.data_import(dataset_id, mart_pd.to_csv(index=False))

print(f"✓ Successfully pushed to Domo DataSet: {dataset_id}")
print(f"  DataSet name:  {DATASET_NAME}")
print(f"  Rows pushed:   {len(mart_pd):,}")
print(f"  Columns:       {len(mart_pd.columns)}")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 5 — Verify push via Domo API

# COMMAND ----------

# Pull back the DataSet metadata to confirm row count
ds_info = domo.datasets.get(dataset_id)
print(f"\nDomo DataSet verification:")
print(f"  Name:         {ds_info.get('name')}")
print(f"  Row count:    {ds_info.get('rowCount', 'unknown')}")
print(f"  Last updated: {ds_info.get('updatedAt', 'unknown')}")
print(f"  DataSet URL:  https://your-instance.domo.com/datasources/{dataset_id}")

# COMMAND ----------

dbutils.notebook.exit(
    f"SUCCESS: pushed {len(mart_pd)} rows to Domo DataSet {dataset_id}"
)
