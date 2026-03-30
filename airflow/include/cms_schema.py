# airflow/include/cms_schema.py
# ─────────────────────────────────────────────────────────────────────────────
# Data contract constants shared across all pipeline notebooks and the DAG.
# Single source of truth for column names, types, suppression thresholds,
# and catalog/schema paths.
#
# In a production Databricks environment these would live in Unity Catalog
# as table properties and comments. The Airflow DAG imports these constants
# directly. The Databricks notebooks duplicate the values since they run in
# a separate environment — keep both in sync when making changes.
# ─────────────────────────────────────────────────────────────────────────────

# ── CATALOG PATHS ─────────────────────────────────────────────────────────────
CATALOG        = "main"
RAW_SCHEMA     = "specialtypulse_raw"
STAGING_SCHEMA = "specialtypulse_staging"
MART_SCHEMA    = "specialtypulse_marts"

RAW_TABLE      = f"{CATALOG}.{RAW_SCHEMA}.cms_physician_puf_raw"
STAGING_TABLE  = f"{CATALOG}.{STAGING_SCHEMA}.stg_cms_physician_puf"
MART_TABLE     = f"{CATALOG}.{MART_SCHEMA}.mart_reimbursement_trends"

# ── PIPELINE CONFIG ────────────────────────────────────────────────────────────
VALID_YEARS           = [2021, 2022, 2023, 2024, 2025]
CMS_SUPPRESSION_MIN   = 11   # CMS suppresses rows where tot_srvcs < 11
OUTLIER_STDDEV_THRESH = 2.0  # Standard deviations below mean = outlier

# ── RAW SOURCE COLUMNS (CMS PUF naming) ───────────────────────────────────────
RAW_COLS = {
    "npi":               "provider_npi",
    "hcpcs_cd":          "hcpcs_code",
    "hcpcs_description": "hcpcs_description",
    "nppes_provider_last_org_name": "provider_last_name",
    "nppes_provider_first_name":    "provider_first_name",
    "nppes_entity_code":  "provider_entity_type",
    "nppes_provider_state": "provider_state",
    "provider_type":     "provider_type_raw",
    "hcpcs_drug_ind":    "is_drug_indicator",
    "place_of_srvc":     "place_of_service",
    "tot_benes":         "total_beneficiaries",
    "tot_srvcs":         "total_services",
    "tot_bene_day_srvcs": "total_beneficiary_day_services",
    "avg_mdcr_alowd_amt": "avg_medicare_allowed_amount",
    "avg_sbmtd_chrg":    "avg_submitted_charge",
    "avg_mdcr_pymt_amt": "avg_medicare_payment",
    "avg_mdcr_stdzd_amt": "avg_medicare_standardized_amount",
}

# ── CERTIFIED METRIC DEFINITIONS ──────────────────────────────────────────────
# These are the source-of-truth definitions. Any change requires a version bump.
# Docs: README.md > Certified Metric Definitions

CERTIFIED_METRICS = {
    "total_services": {
        "definition": "Sum of Medicare-allowed services for specialty × hcpcs × year",
        "grain":      "specialty × hcpcs_code × year",
        "source_col": "tot_srvcs",
        "certified":  True,
    },
    "avg_medicare_payment": {
        "definition": "Weighted average Medicare payment per service (volume-weighted, USD)",
        "grain":      "specialty × hcpcs_code × year",
        "source_col": "avg_mdcr_pymt_amt",
        "certified":  True,
    },
    "payment_to_charge_ratio": {
        "definition": "avg_medicare_payment / avg_submitted_charge. Range 0–1. Lower = more compression.",
        "grain":      "specialty × hcpcs_code × year",
        "source_col": "derived",
        "certified":  True,
    },
    "yoy_volume_change_pct": {
        "definition": "(current_services - prior_services) / prior_services. Null for base year 2021.",
        "grain":      "specialty × hcpcs_code × year",
        "source_col": "derived",
        "certified":  True,
    },
    "yoy_payment_change_pct": {
        "definition": "(current_avg_payment - prior_avg_payment) / prior_avg_payment. Null for 2021.",
        "grain":      "specialty × hcpcs_code × year",
        "source_col": "derived",
        "certified":  True,
    },
    "specialty_avg_payment": {
        "definition": "Specialty-wide volume-weighted average Medicare payment across all procedures for specialty × year.",
        "grain":      "specialty × hcpcs_code × year (benchmark computed over specialty × year window)",
        "source_col": "derived",
        "certified":  True,
    },
    "is_payment_outlier": {
        "definition": "True when payment_to_charge_ratio is > 2 stddev below specialty mean for that year.",
        "grain":      "specialty × hcpcs_code × year (outlier computed over specialty × year window)",
        "source_col": "derived",
        "certified":  True,
    },
}

# ── DOMO CONFIG ───────────────────────────────────────────────────────────────
DOMO_DATASET_NAME = "specialtypulse_mart_reimbursement_trends"
DOMO_DATASET_DESC = (
    "CERTIFIED — SpecialtyPulse mart. "
    "Grain: provider_specialty × hcpcs_code × year. "
    "Source: CMS Medicare Physician PUF 2021-2025. "
    "Owner: Kristen Martino. "
    "Do not modify schema without updating certified metric definitions."
)
