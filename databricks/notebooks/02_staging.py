# Databricks notebook source
"""Stage one source year using the same transformations as the local verified path.
Import pipeline_transforms.py alongside this notebook in the workspace repo.
"""
from pipeline_transforms import stage_records, validate_stage

dbutils.widgets.text("year", "2023", "Service Year")
YEAR = int(dbutils.widgets.get("year"))
raw = spark.table("main.specialtypulse_raw.cms_physician_puf_raw")
final_df = stage_records(raw, YEAR).cache()
total_rows = validate_stage(final_df)
print(f"Validated staging: {total_rows} rows for {YEAR}")

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
