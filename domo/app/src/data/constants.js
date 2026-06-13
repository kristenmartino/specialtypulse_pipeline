/**
 * constants.js
 * Shared design tokens, role metadata, formatters, and aggregation helpers.
 */

// ── ROLE METADATA ──────────────────────────────────────────────────────────────
export const ROLE_META = {
  finance_admin:     { label: "Finance Admin",     icon: "\u25C8", color: "gold",   desc: "Full access \u2014 all specialties, all states" },
  executive:         { label: "Executive",         icon: "\u25C6", color: "gold",   desc: "Full access \u2014 C-suite visibility" },
  specialty_analyst: { label: "Specialty Analyst",  icon: "\u25CE", color: "teal",   desc: "Own specialty only" },
  regional_sales:    { label: "Regional Sales",    icon: "\u25C9", color: "blue",   desc: "Assigned region states only" },
};

// ── CHART COLORS ───────────────────────────────────────────────────────────────
export const CHART_COLORS = {
  teal:     "#0A7E8C",
  tealLt:   "#12A4B4",
  tealXlt:  "#5ECFDB",
  gold:     "#F4A830",
  goldLt:   "#FAC84A",
  blue:     "#7AB8F5",
  purple:   "#B89FF5",
  red:      "#F87171",
  green:    "#4ADE80",
  muted:    "#7A92A3",
  ice:      "#CADCFC",
  navy:     "#0D2137",
  navyMid:  "#0D3A4A",
};

export const PRESSURE_COLORS = {
  "Immediate Opportunity": "#F4A830",
  "Emerging":              "#12A4B4",
  "Monitor":               "#7A92A3",
  "Low Priority":          "#3A5568",
};

export const COMPRESSION_COLORS = {
  "Payment Decline":  "#F87171",
  "Charge Inflation": "#F4A830",
  "Both":             "#FF8C42",
  "Improving":        "#4ADE80",
  "Stable":           "#7A92A3",
  "Base Year":        "#3A5568",
};

// ── FORMATTERS ─────────────────────────────────────────────────────────────────
export const DEFINITIONS = {
  pressureIndex:
    "Reimbursement Pressure Index (0\u2013100): a composite of payment-to-charge compression, year-over-year payment change, and service volume. Higher = more reimbursement pressure on the specialty. Certified metric \u2014 defined once in the pipeline's metric log.",
  pressureTier:
    "Buckets the Pressure Index into action tiers: Immediate Opportunity (highest), Emerging, Monitor, Low Priority.",
  ptcr:
    "Payment-to-Charge Ratio: average Medicare-allowed payment \u00f7 average submitted charge. Lower = steeper reimbursement compression.",
  compressionDriver:
    "What's driving compression this year: Payment Decline, Charge Inflation, Both, Improving, Stable, or Base Year (first year \u2014 no prior to compare against).",
  paymentOutlier:
    "Flagged when a procedure's average Medicare payment deviates materially from the specialty's average. The arrow shows direction; the value is the % difference. Note: the benchmark is the specialty's blended average across all procedures, so intrinsically expensive procedures (e.g. major surgery) can read high \u2014 magnitude is a screening signal, not a verdict.",
  facilityMix:
    "Share of services delivered in a facility setting (hospital/ASC) vs. an office setting, averaged across the specialty's procedures.",
  marketValidated:
    "Pipeline amount weighted by the account specialty's Reimbursement Pressure Index \u2014 a directional adjustment that discounts deals in low-pressure specialties and holds those under pressure. Representative model, not a forecast.",
  adoptionRate:
    "Active users (logged at least one session) \u00f7 provisioned users.",
};

export const fmt = {
  pct:  (v) => v == null ? "\u2014" : `${(v * 100).toFixed(1)}%`,
  pct0: (v) => v == null ? "\u2014" : `${(v * 100).toFixed(0)}%`,
  num:  (v) => v == null ? "\u2014" : Number(v).toLocaleString(),
  usd:  (v) => v == null ? "\u2014" : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  usd0: (v) => v == null ? "\u2014" : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
  usdCompact: (v) => {
    if (v == null) return "\u2014";
    const n = Number(v), a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  },
  score:(v) => v == null ? "\u2014" : Number(v).toFixed(1),
  plural: (n, word) => `${Number(n).toLocaleString()} ${word}${Number(n) === 1 ? "" : "s"}`,
  date: (iso) => {
    if (!iso) return "\u2014";
    try {
      return new Date(iso).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  },
};

// ── AGGREGATION HELPERS ────────────────────────────────────────────────────────
export function groupBy(arr, key) {
  const map = {};
  arr.forEach((row) => {
    const k = row[key];
    if (!map[k]) map[k] = [];
    map[k].push(row);
  });
  return map;
}

export function weightedAvg(rows, valueKey, weightKey) {
  let sumWV = 0, sumW = 0;
  rows.forEach((r) => {
    const v = Number(r[valueKey]);
    const w = Number(r[weightKey]);
    if (!isNaN(v) && !isNaN(w) && w > 0) {
      sumWV += v * w;
      sumW += w;
    }
  });
  return sumW > 0 ? sumWV / sumW : null;
}
