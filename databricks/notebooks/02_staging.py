# Databricks notebook source
# ─────────────────────────────────────────────────────────────────────────────
# 02_staging.py
# Layer:   STAGING
# Purpose: Clean, type-cast, and standardize raw CMS PUF data.
#          Enforce data contract. Apply CMS suppression filter.
#          Normalize provider specialty taxonomy across the 2023 CMS reclassification.
#          Derive payment_to_charge_ratio. Generate surrogate key.
#
# Input:   main.specialtypulse_raw.cms_physician_puf_raw
# Output:  main.specialtypulse_staging.stg_cms_physician_puf
#
# Data contract:
#   - Grain: provider_npi × hcpcs_code × year (enforced via surrogate key unique check)
#   - CMS suppression: rows with total_services < 11 excluded
#   - payment_to_charge_ratio: range 0–1, null when avg_submitted_charge = 0
#   - All monetary columns cast to DoubleType, nulls coalesced where appropriate
# ─────────────────────────────────────────────────────────────────────────────

# COMMAND ----------

dbutils.widgets.text("year", "2023", "Service Year")
YEAR = int(dbutils.widgets.get("year"))
print(f"Running staging for year: {YEAR}")

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql import Window
from pyspark.sql.types import IntegerType, DoubleType, StringType, TimestampType

# ── READ RAW ──────────────────────────────────────────────────────────────────

raw = spark.table("main.specialtypulse_raw.cms_physician_puf_raw").filter(
    F.col("source_year") == YEAR
)

print(f"Raw rows for {YEAR}: {raw.count():,}")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 1 — Rename columns to snake_case and cast types

# COMMAND ----------

# Column rename map — raw CMS names → clean names
# Matches CERTIFIED_METRICS definitions in cms_schema.py
RENAME_MAP = {
    "npi":                          "provider_npi",
    "hcpcs_cd":                     "hcpcs_code",
    "hcpcs_description":            "hcpcs_description",
    "nppes_provider_last_org_name": "provider_last_name",
    "nppes_provider_first_name":    "provider_first_name",
    "nppes_entity_code":            "provider_entity_type",
    "nppes_provider_state":         "provider_state",
    "provider_type":                "provider_type_raw",
    "hcpcs_drug_ind":               "is_drug_indicator",
    "place_of_srvc":                "place_of_service",
    "tot_benes":                    "total_beneficiaries",
    "tot_srvcs":                    "total_services",
    "tot_bene_day_srvcs":           "total_beneficiary_day_services",
    "avg_mdcr_alowd_amt":           "avg_medicare_allowed_amount",
    "avg_sbmtd_chrg":               "avg_submitted_charge",
    "avg_mdcr_pymt_amt":            "avg_medicare_payment",
    "avg_mdcr_stdzd_amt":           "avg_medicare_standardized_amount",
}

# Only keep columns we need (CMS adds columns over time)
renamed = raw.select(
    *[F.col(old).alias(new) for old, new in RENAME_MAP.items()],
    F.col("source_year").alias("year"),
)

# Type casting — raw data is all strings from CSV
typed = (
    renamed
    # Identifiers — trim whitespace, keep as string
    .withColumn("provider_npi",       F.trim(F.col("provider_npi")))
    .withColumn("hcpcs_code",         F.trim(F.col("hcpcs_code")))
    .withColumn("hcpcs_description",  F.trim(F.col("hcpcs_description")))
    .withColumn("provider_state",     F.trim(F.col("provider_state")))
    .withColumn("provider_type_raw",  F.trim(F.col("provider_type_raw")))
    .withColumn("place_of_service",   F.trim(F.col("place_of_service")))
    .withColumn("is_drug_indicator",  F.trim(F.col("is_drug_indicator")))

    # Volume metrics — cast to integer
    .withColumn("total_services",
        F.col("total_services").cast(IntegerType()))
    .withColumn("total_beneficiaries",
        F.col("total_beneficiaries").cast(IntegerType()))
    .withColumn("total_beneficiary_day_services",
        F.col("total_beneficiary_day_services").cast(IntegerType()))

    # Payment metrics — CMS raw files have trailing spaces and empty strings
    # Use regexp_replace to strip non-numeric chars (preserving negative sign and decimal), then cast
    .withColumn("avg_medicare_payment",
        F.regexp_replace(F.trim(F.col("avg_medicare_payment")), "[^0-9.\\-]", "")
         .cast(DoubleType()))
    .withColumn("avg_submitted_charge",
        F.regexp_replace(F.trim(F.col("avg_submitted_charge")), "[^0-9.\\-]", "")
         .cast(DoubleType()))
    .withColumn("avg_medicare_allowed_amount",
        F.regexp_replace(F.trim(F.col("avg_medicare_allowed_amount")), "[^0-9.\\-]", "")
         .cast(DoubleType()))
    .withColumn("avg_medicare_standardized_amount",
        F.regexp_replace(F.trim(F.col("avg_medicare_standardized_amount")), "[^0-9.\\-]", "")
         .cast(DoubleType()))
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 2 — Apply CMS suppression filter

# COMMAND ----------

# CMS suppresses rows with fewer than 11 services to protect patient privacy.
# These rows are excluded from ALL downstream processing.
# This is a data contract requirement — not optional.

CMS_SUPPRESSION_MIN = 11

before_suppression = typed.count()
filtered = typed.filter(F.col("total_services") >= CMS_SUPPRESSION_MIN)
after_suppression = filtered.count()
suppressed = before_suppression - after_suppression

print(f"Rows before CMS suppression filter: {before_suppression:,}")
print(f"Rows after  CMS suppression filter: {after_suppression:,}")
print(f"Suppressed rows excluded:           {suppressed:,}")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 3 — Normalize specialty taxonomy

# COMMAND ----------

# CMS changed provider specialty taxonomy in 2023.
# Pre-2023: numeric codes (e.g. "01" = Internal Medicine)
# Post-2023: text labels (e.g. "Internal Medicine")
# This crosswalk normalizes both to the current text labels.
#
# In production this would be a Delta table loaded from seeds/specialty_taxonomy_crosswalk.csv
# For the Free Edition, we define the crosswalk inline.

taxonomy_crosswalk = spark.createDataFrame([
    # CMS Medicare Specialty Codes — complete crosswalk for PUF provider_type field.
    # Source: CMS Medicare Provider/Supplier to Healthcare Provider Taxonomy Crosswalk
    # (raw_code, normalized_specialty, effective_year_max)

    # Primary care & internal medicine subspecialties
    ("01", "Internal Medicine",              2022),
    ("02", "General Practice",               2022),
    ("03", "Allergy/Immunology",             2022),
    ("04", "Otolaryngology",                 2022),
    ("05", "Anesthesiology",                 2022),
    ("06", "Cardiology",                     2022),
    ("07", "Dermatology",                    2022),
    ("08", "Orthopedic Surgery",             2022),
    ("09", "Family Practice",                2022),
    ("10", "Gastroenterology",               2022),

    # Surgical & procedural specialties
    ("11", "Medical Oncology",               2022),
    ("12", "Ophthalmology",                  2022),
    ("13", "Neurology",                      2022),
    ("14", "Neurosurgery",                   2022),
    ("16", "Obstetrics/Gynecology",          2022),
    ("17", "Hospice and Palliative Care",    2022),
    ("18", "Ophthalmology",                  2022),
    ("19", "Oral Surgery (Dentists Only)",   2022),
    ("20", "Optometry",                      2022),
    ("22", "Pathology",                      2022),

    # Radiology, psychiatry, therapy
    ("24", "Diagnostic Radiology",           2022),
    ("25", "Physical Medicine and Rehabilitation", 2022),
    ("26", "Psychiatry",                     2022),
    ("27", "General Surgery",                2022),
    ("28", "Colorectal Surgery",             2022),
    ("29", "Pulmonary Disease",              2022),
    ("30", "Thoracic Surgery",               2022),
    ("33", "Thoracic Surgery",               2022),
    ("34", "Urology",                        2022),
    ("35", "Chiropractic",                   2022),
    ("36", "Nuclear Medicine",               2022),

    # Subspecialties
    ("37", "Pediatric Medicine",             2022),
    ("38", "Geriatric Medicine",             2022),
    ("39", "Nephrology",                     2022),
    ("40", "Hand Surgery",                   2022),
    ("41", "Optometry",                      2022),
    ("42", "Certified Nurse Midwife",        2022),
    ("43", "Certified Registered Nurse Anesthetist", 2022),
    ("44", "Infectious Disease",             2022),
    ("46", "Endocrinology",                  2022),
    ("48", "Podiatry",                       2022),

    # Non-physician practitioners
    ("50", "Nurse Practitioner",             2022),
    ("62", "Psychologist",                   2022),
    ("64", "Audiologist",                    2022),
    ("65", "Physical Therapist",             2022),
    ("66", "Rheumatology",                   2022),
    ("67", "Occupational Therapist",         2022),
    ("68", "Clinical Psychologist",          2022),
    ("69", "Clinical Laboratory",            2022),
    ("70", "Multispecialty Clinic or Group Practice", 2022),
    ("72", "Pain Management",               2022),

    # Vascular, critical care, other
    ("76", "Peripheral Vascular Disease",    2022),
    ("77", "Vascular Surgery",               2022),
    ("78", "Cardiac Surgery",                2022),
    ("79", "Addiction Medicine",              2022),
    ("81", "Critical Care (Intensivists)",   2022),
    ("82", "Hematology",                     2022),
    ("83", "Hematology/Oncology",            2022),
    ("84", "Preventive Medicine",            2022),
    ("85", "Maxillofacial Surgery",          2022),
    ("86", "Neuropsychiatry",                2022),

    # Advanced practitioners & remaining codes
    ("89", "Certified Clinical Nurse Specialist", 2022),
    ("90", "Medical Oncology",               2022),
    ("91", "Surgical Oncology",              2022),
    ("92", "Radiation Oncology",             2022),
    ("93", "Emergency Medicine",             2022),
    ("94", "Interventional Radiology",       2022),
    ("97", "Physician Assistant",            2022),
    ("98", "Gynecological/Oncology",         2022),
    ("99", "Unknown Physician Specialty",    2022),

    # Non-physician supplier types (common in PUF)
    ("15", "Speech Language Pathologist",    2022),
    ("47", "Independent Diagnostic Testing Facility", 2022),
    ("49", "Ambulatory Surgical Center",     2022),
    ("71", "Registered Dietitian or Nutrition Professional", 2022),
    ("74", "Radiation Therapy Center",       2022),
    ("75", "Slide Preparation Facility",     2022),
], ["raw_code", "normalized_specialty", "max_year"])

# For pre-2023 data, join on numeric code; for 2023+ pass through as-is
if YEAR <= 2022:
    with_specialty = (
        filtered
        .join(
            taxonomy_crosswalk.select("raw_code", "normalized_specialty"),
            filtered.provider_type_raw == taxonomy_crosswalk.raw_code,
            how="left"
        )
        .withColumn(
            "provider_specialty",
            F.coalesce(F.col("normalized_specialty"), F.col("provider_type_raw"))
        )
        .drop("raw_code", "normalized_specialty")
    )
else:
    # 2023+: CMS already uses text labels — pass through directly
    with_specialty = filtered.withColumn(
        "provider_specialty",
        F.col("provider_type_raw")
    )

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 4 — Derive metrics and generate surrogate key

# COMMAND ----------

# payment_to_charge_ratio: core certified metric
# Null when avg_submitted_charge is 0 or null (avoids division by zero)
# Range 0-1: values > 1 indicate data error, flagged below

with_derived = (
    with_specialty
    .withColumn(
        "payment_to_charge_ratio",
        F.when(
            (F.col("avg_submitted_charge").isNotNull()) &
            (F.col("avg_submitted_charge") > 0),
            F.round(
                F.col("avg_medicare_payment") / F.col("avg_submitted_charge"),
                4
            )
        ).otherwise(F.lit(None).cast(DoubleType()))
    )

    # place_of_service flag — facility vs. office
    .withColumn(
        "is_facility_service",
        F.when(F.col("place_of_service") == "F", True).otherwise(False)
    )

    # Surrogate key: deterministic hash of grain columns
    # md5(provider_npi || hcpcs_code || year)
    .withColumn(
        "surrogate_key",
        F.md5(
            F.concat_ws("|",
                F.col("provider_npi"),
                F.col("hcpcs_code"),
                F.col("year").cast(StringType())
            )
        )
    )

    # Audit column
    .withColumn("stg_loaded_at", F.current_timestamp())
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 5 — Validation

# COMMAND ----------

# 1. Uniqueness: surrogate key must be unique
total_rows = with_derived.count()
unique_keys = with_derived.select("surrogate_key").distinct().count()
assert total_rows == unique_keys, \
    f"VALIDATION FAILED: {total_rows - unique_keys} duplicate surrogate keys"

# 2. Payment ratio in valid range
bad_ratio = with_derived.filter(
    F.col("payment_to_charge_ratio").isNotNull() &
    (F.col("payment_to_charge_ratio") > 1.0)
).count()
if bad_ratio > 0:
    print(f"WARNING: {bad_ratio} rows have payment_to_charge_ratio > 1.0 — possible data error")

# 3. No nulls on key columns
null_checks = {
    "provider_npi":       with_derived.filter(F.col("provider_npi").isNull()).count(),
    "hcpcs_code":         with_derived.filter(F.col("hcpcs_code").isNull()).count(),
    "year":               with_derived.filter(F.col("year").isNull()).count(),
    "total_services":     with_derived.filter(F.col("total_services").isNull()).count(),
    "avg_medicare_payment": with_derived.filter(F.col("avg_medicare_payment").isNull()).count(),
}
for col_name, null_count in null_checks.items():
    assert null_count == 0, f"VALIDATION FAILED: {null_count} nulls in {col_name}"

# 4. All services above suppression threshold
below_threshold = with_derived.filter(F.col("total_services") < 11).count()
assert below_threshold == 0, \
    f"VALIDATION FAILED: {below_threshold} rows below CMS suppression threshold"

print(f"✓ All validations passed — {total_rows:,} rows, {unique_keys:,} unique keys")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 6 — Write to Delta staging table

# COMMAND ----------

# Select final column order for the staging table
staging_cols = [
    "surrogate_key",
    "provider_npi",
    "hcpcs_code",
    "hcpcs_description",
    "year",
    "provider_specialty",
    "provider_type_raw",
    "provider_last_name",
    "provider_first_name",
    "provider_entity_type",
    "provider_state",
    "is_drug_indicator",
    "place_of_service",
    "is_facility_service",
    "total_services",
    "total_beneficiaries",
    "total_beneficiary_day_services",
    "avg_medicare_payment",
    "avg_submitted_charge",
    "avg_medicare_allowed_amount",
    "avg_medicare_standardized_amount",
    "payment_to_charge_ratio",
    "stg_loaded_at",
]

final_df = with_derived.select(staging_cols)

# Dynamic partition overwrite: only replaces the year partition being processed,
# leaving other years untouched. Safer than replaceWhere for partitioned tables.
spark.conf.set("spark.sql.sources.partitionOverwriteMode", "dynamic")

(
    final_df.write
    .format("delta")
    .mode("overwrite")
    .option("mergeSchema", "true")
    .partitionBy("year")
    .saveAsTable("main.specialtypulse_staging.stg_cms_physician_puf")
)

print(f"✓ Written to main.specialtypulse_staging.stg_cms_physician_puf (year={YEAR})")

# Summary stats for this run
spark.sql(f"""
    SELECT
        year,
        COUNT(*)                            AS row_count,
        COUNT(DISTINCT provider_specialty)  AS specialties,
        COUNT(DISTINCT hcpcs_code)          AS procedures,
        COUNT(DISTINCT provider_state)      AS states,
        ROUND(AVG(avg_medicare_payment), 2) AS avg_payment,
        ROUND(AVG(payment_to_charge_ratio), 4) AS avg_ptcr
    FROM main.specialtypulse_staging.stg_cms_physician_puf
    WHERE year = {YEAR}
    GROUP BY year
""").show()

dbutils.notebook.exit(f"SUCCESS: year={YEAR}, rows={total_rows}")
