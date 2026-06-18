# Databricks notebook source
# ─────────────────────────────────────────────────────────────────────────────
# 05_export_demo_mart.py
# Layer:   UTILITY (not part of the annual DAG)
# Purpose: Export a small, representative subset of the certified mart so the
#          standalone dashboard demo can be driven by real CMS-derived numbers
#          instead of the bundled synthetic sample.
#
#          The React app computes the Reimbursement Pressure Index in the
#          browser from this CSV (domo/app/src/data/pressureIndex.js, a port of
#          the Domo SQL DataFlow), so swapping the CSV swaps the demo's data
#          with no code change.
#
# Input:   main.specialtypulse_marts.mart_reimbursement_trends (Delta)
# Output:  A single CSV in a Volume (see the output_path widget). Download it
#          from Catalog > main > specialtypulse_raw > Volumes > cms_files.
#
# Why a subset: the full national mart is far too large to bundle into a browser
#          demo. We keep the top-N HCPCS per specialty-year by service volume
#          (volume is concentrated, so this captures most of each specialty's
#          activity) — optionally scoped to a chosen specialty list. That is
#          enough for accurate specialty-level benchmarks and a clean
#          Procedure Detail page.
#
# Then, in the repo:
#   1. Download the CSV from the Volume.
#   2. Replace data/sample_mart_reimbursement_trends.csv with it
#      (or add it as data/real_mart_export.csv and point the generator at it).
#   3. cd domo/app && npm run generate:data && npm run build:web
# ─────────────────────────────────────────────────────────────────────────────

# COMMAND ----------

dbutils.widgets.text("mart_table", "main.specialtypulse_marts.mart_reimbursement_trends", "Source mart table")
dbutils.widgets.text("specialties", "", "Specialties (comma-separated; blank = all)")
dbutils.widgets.text("top_n", "15", "Top HCPCS per specialty-year (by service volume)")
dbutils.widgets.text(
    "output_path",
    "/Volumes/main/specialtypulse_raw/cms_files/real_mart_export.csv",
    "Output CSV path (Volume)",
)

MART_TABLE  = dbutils.widgets.get("mart_table")
SPECIALTIES = [s.strip() for s in dbutils.widgets.get("specialties").split(",") if s.strip()]
TOP_N       = int(dbutils.widgets.get("top_n"))
OUTPUT_PATH = dbutils.widgets.get("output_path")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 1 — Inspect coverage (years, specialties, row counts)
# MAGIC The Index's trajectory / projection / compression-driver columns need a
# MAGIC prior year to compare against — aim for 2+ consecutive years.

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.window import Window

mart = spark.table(MART_TABLE)

print("Year coverage:")
(
    mart.groupBy("year")
    .agg(
        F.count("*").alias("rows"),
        F.countDistinct("provider_specialty").alias("specialties"),
    )
    .orderBy("year")
    .show()
)

print("Specialties present:")
mart.select("provider_specialty").distinct().orderBy("provider_specialty").show(100, truncate=False)

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 2 — Build the representative subset (top-N HCPCS per specialty-year)

# COMMAND ----------

df = mart
if SPECIALTIES:
    df = df.filter(F.col("provider_specialty").isin(SPECIALTIES))

rank = Window.partitionBy("provider_specialty", "year").orderBy(F.col("total_services").desc())

# Column order matches data/sample_mart_reimbursement_trends.csv so the repo's
# generator (domo/app/scripts/generate-source-data.mjs) reads it unchanged.
COLS = [
    "surrogate_key", "provider_specialty", "hcpcs_code", "hcpcs_description", "year",
    "total_services", "total_beneficiaries", "total_providers", "pct_facility_services",
    "avg_medicare_payment", "avg_submitted_charge", "avg_medicare_standardized_amount",
    "payment_to_charge_ratio", "prior_year_services", "yoy_volume_change_pct",
    "prior_year_avg_payment", "yoy_payment_change_pct", "specialty_avg_payment",
    "specialty_avg_ptcr", "payment_vs_specialty_pct", "is_payment_outlier", "mart_built_at",
]

subset = (
    df.withColumn("_rn", F.row_number().over(rank))
    .filter(F.col("_rn") <= TOP_N)
    .drop("_rn")
    .select(*COLS)
    .orderBy("provider_specialty", "year")
)

pdf = subset.toPandas()
print(f"{len(pdf)} rows | {pdf['provider_specialty'].nunique()} specialties | years {sorted(pdf['year'].unique())}")
# Keep this comfortably small (a few hundred to ~1,000 rows) so it bundles into
# the browser demo. If it is large, scope `specialties` or lower `top_n`.

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 3 — Write a single CSV to the Volume

# COMMAND ----------

pdf.to_csv(OUTPUT_PATH, index=False)
print("Wrote", OUTPUT_PATH)
print("Download: Catalog > main > specialtypulse_raw > Volumes > cms_files")

# COMMAND ----------

dbutils.notebook.exit(f"SUCCESS: wrote {len(pdf)} rows to {OUTPUT_PATH}")
