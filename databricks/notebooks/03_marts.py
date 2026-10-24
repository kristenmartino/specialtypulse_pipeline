# Databricks notebook source
"""Build the full mart with the shared, locally executed Spark transformations."""
from pipeline_transforms import build_mart, validate_mart

staging = spark.table("main.specialtypulse_staging.stg_cms_physician_puf")
mart_final = build_mart(staging).cache()
total = validate_mart(mart_final)

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

# Two-step replacement has an availability gap; it is not atomic.
spark.sql(f"DROP TABLE IF EXISTS {MART_TABLE}")
spark.sql(f"ALTER TABLE {MART_STAGING} RENAME TO {MART_TABLE}")

# Add table comment documenting certification
spark.sql(f"""
    COMMENT ON TABLE {MART_TABLE} IS
    'PORTFOLIO MART — SpecialtyPulse. Grain: provider_specialty × hcpcs_code × year.
     Source: configured CMS-schema input fixtures.
     Owner: Kristen Martino.
     Project-defined metrics — see README.md for verification limits.
     Do not modify schema without updating certified metric definitions.'
""")

print("✓ Written to main.specialtypulse_marts.mart_reimbursement_trends")

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
