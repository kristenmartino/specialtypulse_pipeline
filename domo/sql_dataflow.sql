-- ─────────────────────────────────────────────────────────────────────────────
-- domo/sql_dataflow.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- INSTRUCTIONS: Build this as a SQL DataFlow in Domo Data Center
--
-- 1. Go to Data Center > DataFlows > New DataFlow > SQL DataFlow
-- 2. Add input: "specialtypulse_mart_reimbursement_trends" (pushed by notebook 04)
-- 3. Copy this SQL into the DataFlow editor
-- 4. Name output DataSet: "specialtypulse_specialty_benchmarks"
-- 5. Schedule: trigger when input DataSet updates
--
-- Purpose:
--   Builds the specialty-level benchmark summary that powers the peer
--   comparison panel in the SpecialtyPulse dashboard.
--   Demonstrates Domo SQL DataFlow usage — the equivalent of a dbt mart
--   but living natively inside Domo.
--
-- NOTE: Domo SQL DataFlows use MySQL syntax.
--       CTEs are NOT supported — use subqueries instead.
--       Window functions ARE supported in newer Domo versions.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── OUTPUT: specialty_benchmarks ─────────────────────────────────────────────
-- Grain: provider_specialty × year
-- Used for: specialty summary cards, trend sparklines, benchmark panels

SELECT
    provider_specialty,
    `year`,

    -- Volume metrics
    SUM(total_services)                                             AS total_services,
    SUM(total_beneficiaries)                                        AS total_beneficiaries,
    SUM(total_providers)                                            AS total_providers,
    COUNT(DISTINCT hcpcs_code)                                      AS distinct_procedures,

    -- Payment metrics (volume-weighted)
    ROUND(
        SUM(avg_medicare_payment * total_services)
        / NULLIF(SUM(total_services), 0),
    2)                                                              AS specialty_avg_payment,

    ROUND(
        SUM(avg_submitted_charge * total_services)
        / NULLIF(SUM(total_services), 0),
    2)                                                              AS specialty_avg_charge,

    -- Reimbursement compression
    ROUND(AVG(payment_to_charge_ratio), 4)                         AS avg_ptcr,
    ROUND(MIN(payment_to_charge_ratio), 4)                         AS min_ptcr,
    ROUND(MAX(payment_to_charge_ratio), 4)                         AS max_ptcr,

    -- YoY trends (average across procedures for the specialty)
    ROUND(AVG(yoy_volume_change_pct), 4)                           AS avg_yoy_volume_change,
    ROUND(AVG(yoy_payment_change_pct), 4)                          AS avg_yoy_payment_change,

    -- Outlier count
    SUM(CASE WHEN is_payment_outlier = 'true' THEN 1 ELSE 0 END)  AS outlier_procedure_count,

    -- Facility mix
    ROUND(AVG(pct_facility_services), 4)                           AS avg_pct_facility

FROM `specialtypulse_mart_reimbursement_trends`

GROUP BY
    provider_specialty,
    `year`

ORDER BY
    provider_specialty,
    `year`


-- ─────────────────────────────────────────────────────────────────────────────
-- BEAST MODE DEFINITIONS
-- ─────────────────────────────────────────────────────────────────────────────
-- After building the DataFlow, add these as Beast Modes on the output DataSet.
-- Beast Modes are calculated fields evaluated at query time in Domo.
-- These are the ONLY Beast Modes that should be used for SpecialtyPulse —
-- any team-specific calculations should be added here and reused across cards,
-- NOT defined individually on each card (which creates metric proliferation).
--
-- To add: Data Center > open DataSet > Beast Modes > Add Beast Mode
--
-- BEAST MODE 1: YoY Volume Label
-- Name: yoy_volume_label
-- Formula:
/*
CASE
  WHEN `yoy_volume_change_pct` IS NULL THEN 'Base Year'
  WHEN `yoy_volume_change_pct` > 0.05  THEN CONCAT('+', FORMAT(ROUND(`yoy_volume_change_pct` * 100, 1)), '% ▲')
  WHEN `yoy_volume_change_pct` < -0.05 THEN CONCAT(FORMAT(ROUND(`yoy_volume_change_pct` * 100, 1)), '% ▼')
  ELSE CONCAT(FORMAT(ROUND(`yoy_volume_change_pct` * 100, 1)), '% →')
END
*/

-- BEAST MODE 2: Payment Compression Category
-- Name: compression_category
-- Formula:
/*
CASE
  WHEN `payment_to_charge_ratio` IS NULL   THEN 'Unknown'
  WHEN `payment_to_charge_ratio` >= 0.80   THEN 'Low Compression'
  WHEN `payment_to_charge_ratio` >= 0.60   THEN 'Moderate Compression'
  WHEN `payment_to_charge_ratio` >= 0.40   THEN 'High Compression'
  ELSE 'Severe Compression'
END
*/

-- BEAST MODE 3: Outlier Badge
-- Name: outlier_badge
-- Formula:
/*
CASE
  WHEN `is_payment_outlier` = 'true' THEN '⚠ Outlier'
  ELSE ''
END
*/

-- BEAST MODE 4: Payment vs Benchmark Label
-- Name: vs_benchmark_label
-- Formula:
/*
CASE
  WHEN `payment_vs_specialty_pct` IS NULL THEN '—'
  WHEN `payment_vs_specialty_pct` > 0
    THEN CONCAT('+', FORMAT(ROUND(`payment_vs_specialty_pct` * 100, 1)), '% vs avg')
  ELSE CONCAT(FORMAT(ROUND(`payment_vs_specialty_pct` * 100, 1)), '% vs avg')
END
*/
