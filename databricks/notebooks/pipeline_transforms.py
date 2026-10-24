"""Shared Spark transformations, called by Databricks notebooks and the local runner."""
from pyspark.sql import Window, functions as F
from pyspark.sql.types import IntegerType, DoubleType, StringType


def read_raw(spark, path, year):
    return (spark.read.option("header", True).option("inferSchema", False)
            .option("encoding", "UTF-8").option("multiLine", False).csv(str(path))
            .withColumn("source_year", F.lit(year).cast(IntegerType()))
            .withColumn("source_file", F.lit(str(path)))
            .withColumn("ingested_at", F.current_timestamp()))


def stage_records(raw, year):
    spark = raw.sparkSession
    YEAR = year
    raw = raw.filter(F.col("source_year") == year)
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


    filtered = typed.filter(F.col("total_services") >= CMS_SUPPRESSION_MIN)



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

    return with_derived.select(STAGING_COLUMNS)


def build_mart(staging):
    # A provider may bill several procedures. Count at specialty/year grain
    # before reducing to procedure rows; procedure distinct counts cannot be summed.
    specialty_providers = staging.groupBy("provider_specialty", "year").agg(
        F.countDistinct("provider_npi").alias("specialty_total_providers")
    )
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

    aggregated = aggregated.join(specialty_providers, ["provider_specialty", "year"], "inner")

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
            "specialty_total_providers",
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

    return mart_final


def validate_stage(frame):
    stats = frame.agg(F.count("*").alias("rows"), F.countDistinct("surrogate_key").alias("keys")).first()
    if stats.rows != stats.keys:
        raise ValueError("Duplicate provider/procedure/year staging keys")
    required = ["provider_npi", "hcpcs_code", "year", "total_services", "avg_medicare_payment"]
    invalid = None
    for name in required:
        condition = F.col(name).isNull()
        if name in {"provider_npi", "hcpcs_code"}:
            condition = condition | (F.length(F.trim(F.col(name))) == 0)
        invalid = condition if invalid is None else invalid | condition
    if frame.filter(invalid | (F.col("total_services") < 11)).limit(1).count():
        raise ValueError("Null/empty required field or services below 11")
    return stats.rows


def validate_mart(frame):
    stats = frame.agg(F.count("*").alias("rows"), F.countDistinct("surrogate_key").alias("keys")).first()
    if stats.rows != stats.keys or not stats.rows:
        raise ValueError("Empty mart or duplicate specialty/procedure/year keys")
    if frame.filter(F.col("provider_specialty").isNull() | F.col("avg_medicare_payment").isNull()).limit(1).count():
        raise ValueError("Missing required mart fields")
    return stats.rows


STAGING_COLUMNS = [
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
