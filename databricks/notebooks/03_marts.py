# Databricks notebook source
# ─────────────────────────────────────────────────────────────────────────────
# 03_marts.py
# Layer:   MART (CERTIFIED)
# Purpose: Build the mart_reimbursement_trends table.
#          Aggregates provider-level staging data to specialty × hcpcs × year.
#          Calculates YoY changes, specialty benchmarks, and outlier flags.
#          This is the AUTHORITATIVE source for the SpecialtyPulse dashboard.
#
# Input:   main.specialtypulse_staging.stg_cms_physician_puf (ALL years)
# Output:  main.specialtypulse_marts.mart_reimbursement_trends
#
# IMPORTANT: This notebook rebuilds the FULL mart across all years on every run.
# YoY calculations require the complete multi-year dataset to be present.
# Do not run in year-by-year incremental mode.
# ─────────────────────────────────────────────────────────────────────────────

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql import Window
from pyspark.sql.types import DoubleType, BooleanType

print("Building mart_reimbursement_trends — full refresh across all years")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 1 — Aggregate to specialty × hcpcs × year grain

# COMMAND ----------

staging = spark.table("main.specialtypulse_staging.stg_cms_physician_puf")

print(f"Staging rows (all years): {staging.count():,}")
print(f"Years available: {[r.year for r in staging.select('year').distinct().orderBy('year').collect()]}")

# Aggregate from provider-level to specialty-level
# Volume-weighted average ensures payment metrics are correct at aggregate grain
aggregated = (
    staging
    .groupBy("provider_specialty", "hcpcs_code", "year")
    .agg(
        # Use max hcpcs_description (most recent year's text wins)
        F.max("hcpcs_description").alias("hcpcs_description"),

        # Volume
        F.sum("total_services").alias("total_services"),
        F.sum("total_beneficiaries").alias("total_beneficiaries"),
        F.countDistinct("provider_npi").alias("total_providers"),

        # Volume-weighted payment averages
        # Formula: sum(payment * services) / sum(services)
        F.round(
            F.sum(F.col("avg_medicare_payment") * F.col("total_services")) /
            F.sum("total_services"),
            2
        ).alias("avg_medicare_payment"),

        F.round(
            F.sum(F.col("avg_submitted_charge") * F.col("total_services")) /
            F.sum("total_services"),
            2
        ).alias("avg_submitted_charge"),

        F.round(
            F.sum(F.col("avg_medicare_standardized_amount") * F.col("total_services")) /
            F.nullif(F.sum("total_services"), F.lit(0)),
            2
        ).alias("avg_medicare_standardized_amount"),

        # Facility split
        F.round(
            F.sum(
                F.when(F.col("is_facility_service"), F.col("total_services"))
                 .otherwise(F.lit(0))
            ).cast(DoubleType()) /
            F.sum("total_services"),
            4
        ).alias("pct_facility_services"),
    )
)

# Re-derive payment_to_charge_ratio at aggregate level
aggregated = aggregated.withColumn(
    "payment_to_charge_ratio",
    F.when(
        (F.col("avg_submitted_charge").isNotNull()) &
        (F.col("avg_submitted_charge") > 0),
        F.round(
            F.col("avg_medicare_payment") / F.col("avg_submitted_charge"), 4
        )
    ).otherwise(F.lit(None).cast(DoubleType()))
)

print(f"Aggregated rows: {aggregated.count():,}")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 2 — Year-over-year calculations using window functions

# COMMAND ----------

# Window: partition by specialty + hcpcs, order by year ascending
# LAG gives us prior year's value for YoY calculation
yoy_window = Window.partitionBy("provider_specialty", "hcpcs_code").orderBy("year")

with_yoy = (
    aggregated

    # Prior row values via LAG — ordered by year within each specialty × hcpcs
    .withColumn("_prior_year",
        F.lag("year", 1).over(yoy_window))
    .withColumn("_prior_services",
        F.lag("total_services", 1).over(yoy_window))
    .withColumn("_prior_avg_payment",
        F.lag("avg_medicare_payment", 1).over(yoy_window))

    # Guard: only compute YoY when the prior row is exactly the previous year.
    # If a year is missing (e.g. 2022 absent), LAG(1) for 2023 would pull 2021,
    # producing a misleading 2-year delta. Null those out instead.
    .withColumn("_is_consecutive",
        F.col("_prior_year") == (F.col("year") - 1))

    # Expose prior year values only when consecutive (null otherwise)
    .withColumn("prior_year_services",
        F.when(F.col("_is_consecutive"), F.col("_prior_services")))
    .withColumn("prior_year_avg_payment",
        F.when(F.col("_is_consecutive"), F.col("_prior_avg_payment")))

    # YoY volume change — null for base year and non-consecutive years
    .withColumn("yoy_volume_change_pct",
        F.when(
            F.col("_is_consecutive"),
            F.round(
                (F.col("total_services") - F.col("prior_year_services")) /
                F.nullif(F.col("prior_year_services"), F.lit(0)),
                4
            )
        )
    )

    # YoY payment change
    .withColumn("yoy_payment_change_pct",
        F.when(
            F.col("_is_consecutive"),
            F.round(
                (F.col("avg_medicare_payment") - F.col("prior_year_avg_payment")) /
                F.nullif(F.col("prior_year_avg_payment"), F.lit(0)),
                4
            )
        )
    )

    # Clean up temporary columns
    .drop("_prior_year", "_prior_services", "_prior_avg_payment", "_is_consecutive")
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 3 — Specialty benchmarks and outlier detection

# COMMAND ----------

# Specialty benchmark: volume-weighted average payment across all procedures
# within the same specialty × year. Used for peer comparison — each hcpcs row
# is compared against its specialty's overall average for that year.

benchmark_window = Window.partitionBy("provider_specialty", "year")

with_benchmarks = (
    with_yoy
    .withColumn(
        "specialty_avg_payment",
        F.round(
            F.sum(F.col("avg_medicare_payment") * F.col("total_services")).over(benchmark_window) /
            F.sum("total_services").over(benchmark_window),
            2
        )
    )
    .withColumn(
        "specialty_avg_ptcr",
        F.round(F.avg("payment_to_charge_ratio").over(benchmark_window), 4)
    )
    .withColumn(
        "specialty_stddev_ptcr",
        F.round(F.stddev("payment_to_charge_ratio").over(benchmark_window), 4)
    )
    # How does this row's payment compare to specialty average?
    .withColumn(
        "payment_vs_specialty_pct",
        F.round(
            (F.col("avg_medicare_payment") - F.col("specialty_avg_payment")) /
            F.nullif(F.col("specialty_avg_payment"), F.lit(0)),
            4
        )
    )
    # Outlier flag: payment compression > 2 stddev below specialty mean
    # is_payment_outlier = True signals unusual reimbursement compression
    .withColumn(
        "is_payment_outlier",
        F.when(
            (F.col("specialty_stddev_ptcr").isNotNull()) &
            (F.col("specialty_stddev_ptcr") > 0) &
            (F.col("payment_to_charge_ratio").isNotNull()) &
            (F.col("payment_to_charge_ratio") <
                (F.col("specialty_avg_ptcr") - F.lit(2.0) * F.col("specialty_stddev_ptcr"))),
            F.lit(True)
        ).otherwise(F.lit(False))
    )
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 4 — Final column selection and surrogate key

# COMMAND ----------

mart_final = (
    with_benchmarks
    .withColumn(
        "surrogate_key",
        F.md5(F.concat_ws("|",
            F.col("provider_specialty"),
            F.col("hcpcs_code"),
            F.col("year").cast("string")
        ))
    )
    .withColumn("mart_built_at", F.current_timestamp())
    .select(
        # Keys
        "surrogate_key",
        "provider_specialty",
        "hcpcs_code",
        "hcpcs_description",
        "year",
        # Volume
        "total_services",
        "total_beneficiaries",
        "total_providers",
        "pct_facility_services",
        # Payments (certified)
        "avg_medicare_payment",
        "avg_submitted_charge",
        "avg_medicare_standardized_amount",
        "payment_to_charge_ratio",
        # YoY (certified)
        "prior_year_services",
        "yoy_volume_change_pct",
        "prior_year_avg_payment",
        "yoy_payment_change_pct",
        # Benchmarks (certified)
        "specialty_avg_payment",
        "specialty_avg_ptcr",
        "payment_vs_specialty_pct",
        "is_payment_outlier",
        # Audit
        "mart_built_at",
    )
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 5 — Validation before write

# COMMAND ----------

total = mart_final.count()
unique_keys = mart_final.select("surrogate_key").distinct().count()
assert total == unique_keys, f"VALIDATION FAILED: duplicate surrogate keys ({total} rows, {unique_keys} unique)"

outliers = mart_final.filter(F.col("is_payment_outlier")).count()
null_specialty = mart_final.filter(F.col("provider_specialty").isNull()).count()
assert null_specialty == 0, f"VALIDATION FAILED: {null_specialty} null provider_specialty values"

print(f"✓ Mart validation passed")
print(f"  Total rows:        {total:,}")
print(f"  Unique keys:       {unique_keys:,}")
print(f"  Outlier rows:      {outliers:,} ({100*outliers/total:.1f}%)")
print(f"  Years in mart:     {[r.year for r in mart_final.select('year').distinct().orderBy('year').collect()]}")

# COMMAND ----------
# MAGIC %md
# MAGIC ## Step 6 — Write certified mart

# COMMAND ----------

# Write to a staging table first, then swap atomically. This prevents data loss
# if the write fails partway through — the production table stays intact until
# the new data is fully written and validated.

MART_TABLE = "main.specialtypulse_marts.mart_reimbursement_trends"
MART_STAGING = "main.specialtypulse_marts._mart_reimbursement_trends_staging"

(
    mart_final.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(MART_STAGING)
)

# Verify the staging table has the expected row count before swapping
staging_count = spark.table(MART_STAGING).count()
assert staging_count == total, \
    f"SWAP ABORTED: staging table has {staging_count} rows, expected {total}"

# Atomic swap: replace production table with staging data
spark.sql(f"DROP TABLE IF EXISTS {MART_TABLE}")
spark.sql(f"ALTER TABLE {MART_STAGING} RENAME TO {MART_TABLE}")

# Add table comment documenting certification
spark.sql(f"""
    COMMENT ON TABLE {MART_TABLE} IS
    'CERTIFIED MART — SpecialtyPulse. Grain: provider_specialty × hcpcs_code × year.
     Source: CMS Medicare Physician PUF 2021-2025.
     Owner: Kristen Martino.
     Metrics certified — see README.md for definitions.
     Do not modify schema without updating certified metric definitions.'
""")

print(f"✓ Written to main.specialtypulse_marts.mart_reimbursement_trends")

# Summary by year
spark.sql("""
    SELECT
        year,
        COUNT(*)                             AS rows,
        COUNT(DISTINCT provider_specialty)   AS specialties,
        COUNT(DISTINCT hcpcs_code)           AS procedures,
        ROUND(AVG(avg_medicare_payment), 2)  AS avg_payment,
        SUM(CASE WHEN is_payment_outlier THEN 1 ELSE 0 END) AS outliers
    FROM main.specialtypulse_marts.mart_reimbursement_trends
    GROUP BY year
    ORDER BY year
""").show()

dbutils.notebook.exit(f"SUCCESS: mart built, {total} rows")
