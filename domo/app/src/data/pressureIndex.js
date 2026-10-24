/**
 * pressureIndex.js
 * ---------------------------------------------------------------------------
 * Faithful JavaScript port of domo/sql_dataflow.sql (Transforms 1–3).
 *
 * The standalone build runs this in the browser at load time, so the
 * Reimbursement Pressure Index shown in the dashboard is computed by the real
 * scoring formula over the pipeline's mart — not shipped as hard-coded values.
 * (In the Domo deployment the same logic ran as a SQL DataFlow.)
 *
 * Authored as CommonJS so it is importable by both webpack (the app) and Node
 * (scripts/verify-index.js, which checks the numbers without a browser).
 */

function round(v, d) {
  if (v == null || Number.isNaN(v)) return null;
  const f = Math.pow(10, d);
  return ((v < 0 ? -1 : 1) * Math.round(Math.abs(v) * f + 1e-9)) / f;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const toNum = (v) => (v === "" || v == null ? null : Number(v));

function sum(rows, k) {
  let s = 0;
  for (const r of rows) { const v = toNum(r[k]); if (v != null && !Number.isNaN(v)) s += v; }
  return s;
}
function sumProduct(rows, a, b) {
  let s = 0;
  for (const r of rows) { const x = toNum(r[a]), y = toNum(r[b]); if (x != null && y != null) s += x * y; }
  return s;
}
function avgNonNull(rows, k) {
  let s = 0, n = 0;
  for (const r of rows) { const v = toNum(r[k]); if (v != null && !Number.isNaN(v)) { s += v; n++; } }
  return n ? s / n : null;
}
function extremeNonNull(rows, k, isMin) {
  let m = null;
  for (const r of rows) {
    const v = toNum(r[k]);
    if (v != null && (m == null || (isMin ? v < m : v > m))) m = v;
  }
  return m;
}
function popVariance(arr) {
  if (!arr.length) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / arr.length;
}
const safeDiv = (a, b) => (b ? a / b : null);
const keyOf = (spec, year) => spec + "\u0000" + year;

/** Transform 1 — aggregate mart (specialty×hcpcs×year) to base benchmarks (specialty×year). */
function aggregateMart(martRows) {
  const groups = {};
  for (const r of martRows) {
    const key = keyOf(r.provider_specialty, r.year);
    (groups[key] || (groups[key] = [])).push(r);
  }
  const out = [];
  for (const key of Object.keys(groups)) {
    const rows = groups[key];
    const totalServices = sum(rows, "total_services");
    // This specialty/year distinct count is repeated on procedure rows by Spark.
    // Fail closed on an old or inconsistent mart instead of summing distincts.
    const providerCounts = new Set(rows.map(r => toNum(r.specialty_total_providers)));
    const providers = [...providerCounts][0];
    if (providerCounts.size !== 1 || !Number.isInteger(providers) || providers < 0 ||
        rows.some(r => toNum(r.total_providers) > providers)) {
      throw new Error(`Missing or inconsistent specialty/year distinct provider count: ${key}`);
    }
    out.push({
      provider_specialty: rows[0].provider_specialty,
      year: Number(rows[0].year),
      total_services: totalServices,
      total_beneficiaries: sum(rows, "total_beneficiaries"),
      total_providers: providers,
      distinct_procedures: new Set(rows.map((r) => r.hcpcs_code)).size,
      specialty_avg_payment: round(safeDiv(sumProduct(rows, "avg_medicare_payment", "total_services"), totalServices), 2),
      specialty_avg_charge: round(safeDiv(sumProduct(rows, "avg_submitted_charge", "total_services"), totalServices), 2),
      avg_ptcr: round(avgNonNull(rows, "payment_to_charge_ratio"), 4),
      min_ptcr: round(extremeNonNull(rows, "payment_to_charge_ratio", true), 4),
      max_ptcr: round(extremeNonNull(rows, "payment_to_charge_ratio", false), 4),
      avg_yoy_volume_change: round(avgNonNull(rows, "yoy_volume_change_pct"), 4),
      avg_yoy_payment_change: round(avgNonNull(rows, "yoy_payment_change_pct"), 4),
      outlier_procedure_count: rows.reduce((s, r) => s + (String(r.is_payment_outlier) === "true" ? 1 : 0), 0),
      avg_pct_facility: round(avgNonNull(rows, "pct_facility_services"), 4),
    });
  }
  out.sort((a, b) => a.provider_specialty.localeCompare(b.provider_specialty) || a.year - b.year);
  return out;
}

/** Transform 2 — diagnostics, projections, and the prescriptive Pressure Index. */
function enrichBenchmarks(base) {
  const byKey = {};
  for (const r of base) byKey[keyOf(r.provider_specialty, r.year)] = r;
  // MAX(total_providers) OVER () — the market-size normaliser, across all rows.
  const maxProviders = base.reduce((m, r) => Math.max(m, r.total_providers || 0), 0);

  // AVG / VARIANCE of the year-over-year ptcr deltas, per specialty (window).
  const deltas = {};
  for (const r of base) {
    const prev = byKey[keyOf(r.provider_specialty, r.year - 1)];
    if (prev && prev.avg_ptcr != null && r.avg_ptcr != null) {
      (deltas[r.provider_specialty] || (deltas[r.provider_specialty] = [])).push(r.avg_ptcr - prev.avg_ptcr);
    }
  }

  return base.map((r) => {
    const prev = byKey[keyOf(r.provider_specialty, r.year - 1)] || null;
    const d = deltas[r.provider_specialty] || [];
    const avgDelta = d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
    const variance = d.length ? popVariance(d) : null;

    let driver;
    if (!prev || prev.specialty_avg_payment == null) driver = "Base Year";
    else if (r.specialty_avg_payment < prev.specialty_avg_payment && r.specialty_avg_charge > prev.specialty_avg_charge) driver = "Both";
    else if (r.specialty_avg_payment < prev.specialty_avg_payment) driver = "Payment Decline";
    else if (r.specialty_avg_charge > prev.specialty_avg_charge) driver = "Charge Inflation";
    else if (prev.avg_ptcr != null && r.avg_ptcr > prev.avg_ptcr) driver = "Improving";
    else driver = "Stable";

    // Component scores (0–100), evaluated un-rounded for the weighted composite.
    const compression = clamp((1 - r.avg_ptcr) * 100, 0, 100);
    const trajectory = clamp(
      prev == null || prev.avg_ptcr == null ? 50 : 50 + ((prev.avg_ptcr - r.avg_ptcr) / prev.avg_ptcr) * 500,
      0, 100,
    );
    const volume = clamp(50 + (r.avg_yoy_volume_change == null ? 0 : r.avg_yoy_volume_change) * 500, 0, 100);
    const market = clamp(maxProviders ? (r.total_providers * 100) / maxProviders : 0, 0, 100);

    const pressure_index = round(0.30 * compression + 0.30 * trajectory + 0.25 * volume + 0.15 * market, 1);
    const pressure_tier =
      pressure_index >= 70 ? "High pressure"
      : pressure_index >= 50 ? "Elevated pressure"
      : pressure_index >= 30 ? "Moderate pressure"
      : "Low pressure";

    return Object.assign({}, r, {
      prior_year_avg_payment: prev ? prev.specialty_avg_payment : null,
      prior_year_avg_charge: prev ? prev.specialty_avg_charge : null,
      payment_yoy_change: prev && prev.specialty_avg_payment ? round((r.specialty_avg_payment - prev.specialty_avg_payment) / prev.specialty_avg_payment, 4) : null,
      compression_driver: driver,
      avg_yoy_ptcr_change: round(avgDelta, 6),
      ptcr_trend_variance: round(variance, 8),
      projected_next_year_ptcr: round(r.avg_ptcr + (avgDelta == null ? 0 : avgDelta), 4),
      projected_next_year_services: round(r.total_services * (1 + (r.avg_yoy_volume_change == null ? 0 : r.avg_yoy_volume_change)), 0),
      projection_confidence: prev == null || prev.avg_ptcr == null ? "Insufficient Data" : variance != null && variance < 0.001 ? "High" : "Directional",
      compression_score: round(compression, 1),
      trajectory_score: round(trajectory, 1),
      volume_score: round(volume, 1),
      market_size_score: round(market, 1),
      pressure_index,
      pressure_tier,
    });
  });
}

/** Transform 3 — join the SFDC pipeline to the latest-year benchmarks. */
function buildPipelineIntelligence(sfdc, benchmarks) {
  if (!benchmarks.length) return sfdc.map((p) => Object.assign({}, p));
  const maxYear = benchmarks.reduce((m, r) => Math.max(m, r.year), -Infinity);
  const latest = {};
  for (const b of benchmarks) if (b.year === maxYear) latest[b.provider_specialty] = b;
  return sfdc.map((p) => {
    const b = latest[p.account_specialty] || null;
    const pi = b ? b.pressure_index : null;
    return Object.assign({}, p, {
      pressure_index: pi,
      pressure_tier: b ? b.pressure_tier : null,
      specialty_avg_payment: b ? b.specialty_avg_payment : null,
      avg_ptcr: b ? b.avg_ptcr : null,
      compression_driver: b ? b.compression_driver : null,
      market_validated_amount: b && pi != null ? round(Number(p.amount) * (pi / 100), 2) : null,
    });
  });
}

module.exports = { aggregateMart, enrichBenchmarks, buildPipelineIntelligence };
