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

-- ── TRANSFORM 1: Base aggregation (specialty × year) ────────────────────────

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


-- ── TRANSFORM 2: Add diagnostic + predictive + prescriptive columns ────────
-- Domo SQL does not support CTEs. Use the Transform 1 output as the input
-- for this second transform within the same DataFlow.
-- Name Transform 1 output: "_tmp_base_benchmarks"
-- Name Transform 2 output: "specialtypulse_specialty_benchmarks"

SELECT
    cur.*,

    -- ── DIAGNOSTIC: Prior-year values for compression driver analysis ────
    prev.specialty_avg_payment                                      AS prior_year_avg_payment,
    prev.specialty_avg_charge                                       AS prior_year_avg_charge,

    ROUND(
        (cur.specialty_avg_payment - prev.specialty_avg_payment)
        / NULLIF(prev.specialty_avg_payment, 0),
    4)                                                              AS payment_yoy_change,

    ROUND(
        (cur.specialty_avg_charge - prev.specialty_avg_charge)
        / NULLIF(prev.specialty_avg_charge, 0),
    4)                                                              AS charge_yoy_change,

    -- Compression driver classification
    CASE
        WHEN prev.specialty_avg_payment IS NULL THEN 'Base Year'
        WHEN (cur.specialty_avg_payment < prev.specialty_avg_payment)
         AND (cur.specialty_avg_charge > prev.specialty_avg_charge)
            THEN 'Both'
        WHEN cur.specialty_avg_payment < prev.specialty_avg_payment
            THEN 'Payment Decline'
        WHEN cur.specialty_avg_charge > prev.specialty_avg_charge
            THEN 'Charge Inflation'
        WHEN cur.avg_ptcr > prev.avg_ptcr
            THEN 'Improving'
        ELSE 'Stable'
    END                                                             AS compression_driver,

    -- ── PREDICTIVE: Trend projection ────────────────────────────────────
    -- Average annual ptcr change across available years
    ROUND(AVG(cur.avg_ptcr - prev.avg_ptcr) OVER (
        PARTITION BY cur.provider_specialty
    ), 6)                                                           AS avg_yoy_ptcr_change,

    -- Trend variance (stability indicator)
    ROUND(VARIANCE(cur.avg_ptcr - prev.avg_ptcr) OVER (
        PARTITION BY cur.provider_specialty
    ), 8)                                                           AS ptcr_trend_variance,

    -- Projected next-year ptcr (linear: current + avg change)
    ROUND(cur.avg_ptcr + COALESCE(
        AVG(cur.avg_ptcr - prev.avg_ptcr) OVER (
            PARTITION BY cur.provider_specialty
        ), 0
    ), 4)                                                           AS projected_next_year_ptcr,

    -- Projected next-year services
    ROUND(cur.total_services * (1 + COALESCE(cur.avg_yoy_volume_change, 0)))
                                                                    AS projected_next_year_services,

    -- Projection confidence
    CASE
        WHEN prev.avg_ptcr IS NULL THEN 'Insufficient Data'
        WHEN VARIANCE(cur.avg_ptcr - prev.avg_ptcr) OVER (
            PARTITION BY cur.provider_specialty
        ) < 0.001 THEN 'High'
        ELSE 'Directional'
    END                                                             AS projection_confidence,

    -- ── PRESCRIPTIVE: Pressure Index ────────────────────────────────────
    -- Component scores (0-100 normalized)

    -- Compression score: lower ptcr = higher pressure
    ROUND(GREATEST(0, LEAST(100,
        (1 - cur.avg_ptcr) * 100
    )), 1)                                                          AS compression_score,

    -- Trajectory score: declining ptcr = higher pressure
    ROUND(GREATEST(0, LEAST(100,
        CASE
            WHEN prev.avg_ptcr IS NULL THEN 50
            ELSE 50 + ((prev.avg_ptcr - cur.avg_ptcr) / NULLIF(prev.avg_ptcr, 0)) * 500
        END
    )), 1)                                                          AS trajectory_score,

    -- Volume score: growing volume = higher opportunity
    ROUND(GREATEST(0, LEAST(100,
        50 + COALESCE(cur.avg_yoy_volume_change, 0) * 500
    )), 1)                                                          AS volume_score,

    -- Market size score: more providers = bigger market
    ROUND(GREATEST(0, LEAST(100,
        cur.total_providers * 100.0
        / NULLIF(MAX(cur.total_providers) OVER (), 0)
    )), 1)                                                          AS market_size_score,

    -- Weighted composite
    ROUND(
        0.30 * GREATEST(0, LEAST(100, (1 - cur.avg_ptcr) * 100))
      + 0.30 * GREATEST(0, LEAST(100,
            CASE
                WHEN prev.avg_ptcr IS NULL THEN 50
                ELSE 50 + ((prev.avg_ptcr - cur.avg_ptcr) / NULLIF(prev.avg_ptcr, 0)) * 500
            END))
      + 0.25 * GREATEST(0, LEAST(100,
            50 + COALESCE(cur.avg_yoy_volume_change, 0) * 500))
      + 0.15 * GREATEST(0, LEAST(100,
            cur.total_providers * 100.0
            / NULLIF(MAX(cur.total_providers) OVER (), 0)))
    , 1)                                                            AS pressure_index,

    -- Pressure tier
    CASE
        WHEN ROUND(
            0.30 * GREATEST(0, LEAST(100, (1 - cur.avg_ptcr) * 100))
          + 0.30 * GREATEST(0, LEAST(100,
                CASE
                    WHEN prev.avg_ptcr IS NULL THEN 50
                    ELSE 50 + ((prev.avg_ptcr - cur.avg_ptcr) / NULLIF(prev.avg_ptcr, 0)) * 500
                END))
          + 0.25 * GREATEST(0, LEAST(100,
                50 + COALESCE(cur.avg_yoy_volume_change, 0) * 500))
          + 0.15 * GREATEST(0, LEAST(100,
                cur.total_providers * 100.0
                / NULLIF(MAX(cur.total_providers) OVER (), 0)))
        , 1) >= 70 THEN 'Immediate Opportunity'
        WHEN ROUND(
            0.30 * GREATEST(0, LEAST(100, (1 - cur.avg_ptcr) * 100))
          + 0.30 * GREATEST(0, LEAST(100,
                CASE
                    WHEN prev.avg_ptcr IS NULL THEN 50
                    ELSE 50 + ((prev.avg_ptcr - cur.avg_ptcr) / NULLIF(prev.avg_ptcr, 0)) * 500
                END))
          + 0.25 * GREATEST(0, LEAST(100,
                50 + COALESCE(cur.avg_yoy_volume_change, 0) * 500))
          + 0.15 * GREATEST(0, LEAST(100,
                cur.total_providers * 100.0
                / NULLIF(MAX(cur.total_providers) OVER (), 0)))
        , 1) >= 50 THEN 'Emerging'
        WHEN ROUND(
            0.30 * GREATEST(0, LEAST(100, (1 - cur.avg_ptcr) * 100))
          + 0.30 * GREATEST(0, LEAST(100,
                CASE
                    WHEN prev.avg_ptcr IS NULL THEN 50
                    ELSE 50 + ((prev.avg_ptcr - cur.avg_ptcr) / NULLIF(prev.avg_ptcr, 0)) * 500
                END))
          + 0.25 * GREATEST(0, LEAST(100,
                50 + COALESCE(cur.avg_yoy_volume_change, 0) * 500))
          + 0.15 * GREATEST(0, LEAST(100,
                cur.total_providers * 100.0
                / NULLIF(MAX(cur.total_providers) OVER (), 0)))
        , 1) >= 30 THEN 'Monitor'
        ELSE 'Low Priority'
    END                                                             AS pressure_tier

FROM `_tmp_base_benchmarks` cur
LEFT JOIN `_tmp_base_benchmarks` prev
    ON cur.provider_specialty = prev.provider_specialty
    AND cur.`year` = prev.`year` + 1

ORDER BY
    cur.provider_specialty,
    cur.`year`


-- ── TRANSFORM 3: Pipeline Intelligence ──────────────────────────────────────
-- Joins SFDC pipeline to specialty benchmarks for the most recent year.
-- Create as a SEPARATE DataFlow, or as a 3rd transform in the same DataFlow.
-- Input: specialtypulse_sfdc_pipeline, specialtypulse_specialty_benchmarks
-- Output: specialtypulse_pipeline_intelligence

-- SELECT
--     p.*,
--     b.pressure_index,
--     b.pressure_tier,
--     b.specialty_avg_payment,
--     b.avg_ptcr,
--     b.compression_driver,
--     ROUND(p.amount * (b.pressure_index / 100), 2) AS market_validated_amount
-- FROM `specialtypulse_sfdc_pipeline` p
-- LEFT JOIN `specialtypulse_specialty_benchmarks` b
--     ON p.account_specialty = b.provider_specialty
--     AND b.`year` = (SELECT MAX(`year`) FROM `specialtypulse_specialty_benchmarks`)


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
