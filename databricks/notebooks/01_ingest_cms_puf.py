# Databricks notebook source
# ─────────────────────────────────────────────────────────────────────────────
# 01_ingest_cms_puf.py
# Layer:   RAW
# Purpose: Load raw CMS PUF CSV files into a Delta table.
#          No transformations — raw data preserved exactly as received from CMS.
#          Adds a `year` column (extracted from filename or passed as parameter).
#          Adds `ingested_at` audit column.
#
# Input:   CSV files uploaded to Databricks Volume
#          Path: /Volumes/main/specialtypulse_raw/cms_files/
# Output:  Delta table: main.specialtypulse_raw.cms_physician_puf_raw
#
# Run:     Manually once per CMS annual release, or triggered by Airflow DAG
#          Parameter: year (int) — the service year of the file being loaded
# ─────────────────────────────────────────────────────────────────────────────

# COMMAND ----------
# MAGIC %md
# MAGIC ## Setup — schemas and parameters

# COMMAND ----------

# Pipeline parameter — set by Airflow or run manually
# When running manually in Databricks UI, set via "Configure" > "Parameters"
dbutils.widgets.text("year", "2023", "Service Year")
dbutils.widgets.text("file_path", "", "Override file path (optional)")

YEAR = int(dbutils.widgets.get("year"))
FILE_OVERRIDE = dbutils.widgets.get("file_path")

print(f"Loading CMS PUF data for year: {YEAR}")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Create schemas and volumes if not exist

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE SCHEMA IF NOT EXISTS main.specialtypulse_raw
# MAGIC   COMMENT 'Raw CMS PUF data — unmodified source files';
# MAGIC
# MAGIC CREATE SCHEMA IF NOT EXISTS main.specialtypulse_staging
# MAGIC   COMMENT 'Cleaned and standardized CMS data';
# MAGIC
# MAGIC CREATE SCHEMA IF NOT EXISTS main.specialtypulse_marts
# MAGIC   COMMENT 'Certified analytical marts powering SpecialtyPulse';

# COMMAND ----------
# MAGIC %md
# MAGIC ## Load raw CSV into Delta

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.types import IntegerType

# ── FILE PATH ─────────────────────────────────────────────────────────────────
# Default path follows naming convention: /Volumes/main/specialtypulse_raw/cms_files/
# Files should be named: Medicare_Physician_Other_Practitioners_{YEAR}.csv
# or the 10k sample: sample_2023_puf_10k.csv

VOLUME_PATH = "/Volumes/main/specialtypulse_raw/cms_files"

if FILE_OVERRIDE:
    file_path = FILE_OVERRIDE
else:
    # Try the full CMS filename first, fall back to the 10k sample file.
    # This lets the pipeline work in both production (full CMS PUF) and
    # demo/portfolio mode (small sample) without manual path changes.
    full_path = f"{VOLUME_PATH}/Medicare_Physician_Other_Practitioners_{YEAR}.csv"
    sample_path = f"{VOLUME_PATH}/sample_{YEAR}_puf_10k.csv"
    try:
        dbutils.fs.ls(full_path)
        file_path = full_path
    except Exception:
        print(f"Full CMS file not found at {full_path}, trying sample...")
        try:
            dbutils.fs.ls(sample_path)
            file_path = sample_path
        except Exception:
            # Neither file exists — use full_path so the read fails with a clear error
            file_path = full_path

print(f"Reading from: {file_path}")

# ── READ ──────────────────────────────────────────────────────────────────────
# CMS PUF files are large (500MB–1GB per year). inferSchema=False + explicit
# cast in staging is safer and faster for known schemas.

raw_df = (
    spark.read
    .option("header", "true")
    .option("inferSchema", "false")   # everything as string — cast in staging
    .option("encoding", "UTF-8")
    .option("multiLine", "false")
    .csv(file_path)
)

print(f"Raw row count: {raw_df.count():,}")
print(f"Raw column count: {len(raw_df.columns)}")

# ── ADD AUDIT COLUMNS ─────────────────────────────────────────────────────────
raw_df = (
    raw_df
    .withColumn("source_year",   F.lit(YEAR).cast(IntegerType()))
    .withColumn("source_file",   F.lit(file_path))
    .withColumn("ingested_at",   F.current_timestamp())
)

# ── WRITE TO DELTA ────────────────────────────────────────────────────────────
# Dynamic partition overwrite: only replaces the partition(s) present in the
# DataFrame (source_year = YEAR), leaving other years untouched. This is safer
# than mode("overwrite") + replaceWhere, which can drop the full table on first
# run or behave inconsistently if the table doesn't exist yet.
# Merge schema = True allows CMS column additions across years without failing.

spark.conf.set("spark.sql.sources.partitionOverwriteMode", "dynamic")

(
    raw_df.write
    .format("delta")
    .mode("overwrite")
    .option("mergeSchema", "true")
    .partitionBy("source_year")
    .saveAsTable("main.specialtypulse_raw.cms_physician_puf_raw")
)

print(f"✓ Written to main.specialtypulse_raw.cms_physician_puf_raw (year={YEAR})")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Validation — row counts and null check on key columns

# COMMAND ----------

validation_df = spark.sql(f"""
    SELECT
        source_year,
        COUNT(*)                                        AS total_rows,
        COUNT(CASE WHEN npi IS NULL THEN 1 END)         AS null_npi,
        COUNT(CASE WHEN hcpcs_cd IS NULL THEN 1 END)    AS null_hcpcs,
        COUNT(CASE WHEN tot_srvcs IS NULL THEN 1 END)   AS null_services,
        MIN(ingested_at)                                AS ingested_at
    FROM main.specialtypulse_raw.cms_physician_puf_raw
    WHERE source_year = {YEAR}
    GROUP BY source_year
""")

validation_df.show()

# Fail loudly if key columns have nulls — catch bad file loads early
null_npi = validation_df.collect()[0]["null_npi"]
null_hcpcs = validation_df.collect()[0]["null_hcpcs"]

assert null_npi == 0,   f"VALIDATION FAILED: {null_npi} null NPI values found"
assert null_hcpcs == 0, f"VALIDATION FAILED: {null_hcpcs} null HCPCS values found"

print(f"✓ Validation passed for year {YEAR}")

# COMMAND ----------
# Return exit value for Airflow task success detection
dbutils.notebook.exit(f"SUCCESS: year={YEAR}")
