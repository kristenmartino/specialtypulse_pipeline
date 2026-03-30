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
export const fmt = {
  pct:  (v) => v == null ? "\u2014" : `${(v * 100).toFixed(1)}%`,
  pct0: (v) => v == null ? "\u2014" : `${(v * 100).toFixed(0)}%`,
  num:  (v) => v == null ? "\u2014" : Number(v).toLocaleString(),
  usd:  (v) => v == null ? "\u2014" : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  score:(v) => v == null ? "\u2014" : Number(v).toFixed(1),
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
