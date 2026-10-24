/**
 * constants.js
 * Shared design tokens, role metadata, formatters, and aggregation helpers.
 */
import React from "react";
import ChartTooltip from "../components/ChartTooltip";

// ── ROLE METADATA ──────────────────────────────────────────────────────────────
export const ROLE_META = {
  finance_admin:     { label: "Finance Admin",     icon: "\u25C8", color: "gold",   desc: "All benchmark rows" },
  executive:         { label: "Executive",         icon: "\u25C6", color: "gold",   desc: "All benchmark rows" },
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
  ember:    "#FF8C42",
  blue:     "#7AB8F5",
  purple:   "#B89FF5",
  red:      "#F87171",
  green:    "#4ADE80",
  muted:    "#8CA3B5",
  ice:      "#CADCFC",
  slate:    "#4A6478",
  navy:     "#0D2137",
  navyMid:  "#0D3A4A",
};

// Ordered categorical ramp for multi-line charts. The two PTCR trend charts can
// draw up to 8 specialties at once (19 in the mart, capped to the top 8), so the
// ramp carries 8 maximally-distinct hues. Core brand colors lead — charts with
// only 2–3 series never reach the accent tail (blue/purple/red).
export const CHART_SERIES = [
  CHART_COLORS.tealXlt,  // cyan
  CHART_COLORS.gold,     // amber
  CHART_COLORS.blue,     // sky
  CHART_COLORS.green,    // green
  CHART_COLORS.ember,    // orange
  CHART_COLORS.purple,   // lavender
  CHART_COLORS.ice,      // pale blue
  CHART_COLORS.red,      // coral
];

export const PRESSURE_COLORS = {
  "High pressure": "#F4A830",
  "Elevated pressure":              "#12A4B4",
  "Moderate pressure":               "#8CA3B5",
  "Low pressure":          "#3A5568",
};

export const COMPRESSION_COLORS = {
  "Payment Decline":  "#F87171",
  "Charge Inflation": "#F4A830",
  "Both":             "#FF8C42",
  "Improving":        "#4ADE80",
  "Stable":           "#8CA3B5",
  "Base Year":        "#3A5568",
};

// ── SHARED CHART PROPS ─────────────────────────────────────────────────────────
// One tooltip everywhere: branded ChartTooltip (series color as a swatch dot,
// text always legible on navy) plus a subtle teal hover cursor.
export const TOOLTIP_PROPS = {
  content: React.createElement(ChartTooltip),
  cursor:  { stroke: "rgba(94, 207, 219, 0.3)", fill: "rgba(94, 207, 219, 0.07)" },
};

// Chart value animations are off: Recharts drives them with requestAnimationFrame,
// which throttles in occluded iframes (Domo dashboards, background tabs) and leaves
// series invisible for seconds. Panels already choreograph their own entrance —
// data must be readable the instant a chart exists.
export const CHART_ANIM = {
  isAnimationActive: false,
};

// ── FORMATTERS ─────────────────────────────────────────────────────────────────
export const DEFINITIONS = {
  pressureIndex:
    "Reimbursement Pressure Index (0–100): 30% payment-to-charge compression, 30% change in that ratio, 25% service-volume change and 15% relative distinct provider count. Providers are deduplicated within each specialty and year across all procedures. Project-defined weights; not validated against sales outcomes.",
  pressureTier:
    "Score bands: High pressure ≥70; Elevated pressure ≥50; Moderate pressure ≥30; Low pressure <30. These bands describe the heuristic score, not purchasing urgency.",
  ptcr:
    "Payment-to-Charge Ratio: average Medicare payment ÷ average submitted charge. Specialty views average procedure-level ratios. This is not a practice profit-margin measure.",
  compressionDriver:
    "Year-over-year changes in specialty average payment and submitted charge. “Payments down, charges up” means both changes occurred. Submitted charges are not practice operating costs; these labels do not establish causality.",
  paymentOutlier:
    "Flagged when a procedure's payment-to-charge ratio is more than two standard deviations below its specialty mean for the year. The displayed payment deviation compares against the specialty's blended average, not a procedure-specific expected rate.",
  facilityMix:
    "Share of services delivered in a facility setting (hospital/ASC), averaged across the specialty's procedures.",
  adoptionRate:
    "Distinct users with a session in the displayed period ÷ configured users. The displayed period is shown above the totals.",
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
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
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

// Keep DataFlow category values intact while giving readers explicit labels.
export const CHANGE_LABELS = {
  "Both": "Payments down, charges up",
  "Charge Inflation": "Charges increased",
  "Payment Decline": "Payments decreased",
  "Improving": "Payment-to-charge ratio increased",
  "Stable": "No decline in ratio",
  "Base Year": "First year",
};
