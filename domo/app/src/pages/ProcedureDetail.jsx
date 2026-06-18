import React, { useMemo } from "react";
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import ChartPanel from "../components/ChartPanel";
import DataTable from "../components/DataTable";
import InsightStrip from "../components/InsightStrip";
import { CHART_COLORS, fmt, groupBy, DEFINITIONS } from "../data/constants";

export default function ProcedureDetail({ mart, focusSpecialty, onClearFocus }) {
  // Latest year, all specialties — used for the comparative trend charts.
  const latestYearAll = useMemo(() => {
    if (!mart.length) return [];
    const maxY = Math.max(...mart.map(r => Number(r.year)));
    return mart.filter(r => Number(r.year) === maxY);
  }, [mart]);

  // Procedure-level views narrow to the drilled-in specialty when one is set.
  const view = useMemo(
    () => focusSpecialty ? latestYearAll.filter(r => r.provider_specialty === focusSpecialty) : latestYearAll,
    [latestYearAll, focusSpecialty]
  );

  // Outlier procedures
  const outliers = useMemo(
    () => view.filter(r => r.is_payment_outlier === "true")
      .sort((a, b) => Math.abs(Number(b.payment_vs_specialty_pct)) - Math.abs(Number(a.payment_vs_specialty_pct))),
    [view]
  );

  // Payment vs benchmark bar
  const benchmarkBar = useMemo(() =>
    view.slice(0, 12).map(r => ({
      name: r.hcpcs_code,
      desc: r.hcpcs_description,
      payment: Number(r.avg_medicare_payment),
      benchmark: Number(r.specialty_avg_payment),
      diff: Number(r.payment_vs_specialty_pct),
    })),
    [view]
  );

  // Surfaced "so what" — tracks the focus (specialty-specific when drilled in).
  const insights = useMemo(() => {
    if (!view.length) return [];
    const items = [];

    const over = [...view].filter(r => r.is_payment_outlier === "true")
      .sort((a, b) => Number(b.payment_vs_specialty_pct) - Number(a.payment_vs_specialty_pct))[0];
    if (over) items.push({
      tone: "alert",
      label: "Largest over-benchmark",
      value: `${over.hcpcs_description} ↑ ${fmt.pct(over.payment_vs_specialty_pct)}`,
      detail: `${over.provider_specialty} — vs the specialty's blended average (a screening signal).`,
    });

    const flaggedBySpec = {};
    outliers.forEach(r => { flaggedBySpec[r.provider_specialty] = (flaggedBySpec[r.provider_specialty] || 0) + 1; });
    const topSpec = Object.entries(flaggedBySpec).sort((a, b) => b[1] - a[1])[0];
    items.push({
      tone: "info",
      label: "Flagged procedures",
      value: `${outliers.length} flagged`,
      detail: topSpec ? `Most in ${topSpec[0]} (${topSpec[1]}).` : "None flagged in this view.",
    });

    const cut = [...view].filter(r => r.yoy_payment_change_pct != null)
      .sort((a, b) => Number(a.yoy_payment_change_pct) - Number(b.yoy_payment_change_pct))[0];
    if (cut) items.push({
      tone: "trend",
      label: "Steepest payment cut",
      value: `${cut.hcpcs_description} ${fmt.pct(cut.yoy_payment_change_pct)}`,
      detail: `${cut.provider_specialty} — sharpest YoY reimbursement drop.`,
    });

    return items;
  }, [view, outliers]);

  // Facility mix by specialty (latest year, always comparative across specialties)
  const facilityData = useMemo(() => {
    const bySpec = groupBy(latestYearAll, "provider_specialty");
    return Object.entries(bySpec).map(([spec, rows]) => {
      const avgFac = rows.reduce((s, r) => s + Number(r.pct_facility_services), 0) / rows.length;
      return { specialty: spec, facility: avgFac, office: 1 - avgFac };
    });
  }, [latestYearAll]);

  // PTCR comparison across years by specialty
  const ptcrTrend = useMemo(() => {
    const years = [...new Set(mart.map(r => r.year))].sort();
    const bySpec = groupBy(mart, "provider_specialty");
    return years.map(y => {
      const row = { year: y };
      Object.entries(bySpec).forEach(([spec, rows]) => {
        const yr = rows.filter(r => r.year === y);
        if (yr.length) {
          row[spec] = yr.reduce((s, r) => s + Number(r.payment_to_charge_ratio), 0) / yr.length;
        }
      });
      return row;
    });
  }, [mart]);

  // Cap the multi-specialty trend to the 8 highest-volume specialties (19 total).
  const trendSpecialties = useMemo(() => {
    const tot = {};
    latestYearAll.forEach(r => { tot[r.provider_specialty] = (tot[r.provider_specialty] || 0) + Number(r.total_services); });
    return Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]);
  }, [latestYearAll]);
  const colorCycle = [CHART_COLORS.tealXlt, CHART_COLORS.gold, CHART_COLORS.blue, CHART_COLORS.purple, CHART_COLORS.green, CHART_COLORS.red, CHART_COLORS.goldLt, CHART_COLORS.ice];

  const outlierColumns = [
    { key: "hcpcs_code", label: "HCPCS" },
    { key: "hcpcs_description", label: "Description" },
    { key: "provider_specialty", label: "Specialty" },
    { key: "avg_medicare_payment", label: "Avg Payment", render: (v) => fmt.usd(v) },
    { key: "specialty_avg_payment", label: "Specialty Avg", render: (v) => fmt.usd(v) },
    { key: "payment_vs_specialty_pct", label: "vs Benchmark", render: (v) => {
      // Every row here is already a flagged outlier — direction is informational,
      // not good/bad. Single "flagged" color + arrow avoids implying a positive
      // deviation is desirable.
      const n = Number(v);
      const arrow = n > 0 ? "↑" : "↓";
      return (
        <span style={{ color: CHART_COLORS.gold, fontFamily: "var(--font-mono)", fontSize: 11 }}>
          {arrow} {fmt.pct(Math.abs(n))}
        </span>
      );
    }},
    { key: "total_services", label: "Services", render: (v) => fmt.num(v) },
  ];

  return (
    <div className="page-grid">
      {focusSpecialty && (
        <div className="focus-chip span-full">
          <span className="focus-chip-label">Drilled in:</span>
          <span className="focus-chip-value">{focusSpecialty}</span>
          <span className="focus-chip-note">procedure views below are filtered to this specialty</span>
          <button className="focus-chip-clear" onClick={onClearFocus}>Clear ✕</button>
        </div>
      )}

      <InsightStrip items={insights} />

      {/* Outlier Table */}
      <ChartPanel
        title="Payment outlier procedures"
        subtitle={`${outliers.length} flagged${focusSpecialty ? ` · ${focusSpecialty}` : ""}`}
        info={DEFINITIONS.paymentOutlier}
        className="span-full"
      >
        {outliers.length ? (
          <DataTable columns={outlierColumns} data={outliers} defaultSort="payment_vs_specialty_pct" />
        ) : (
          <div className="empty-state">
            <span className="empty-icon">{"◌"}</span>
            No flagged outlier procedures{focusSpecialty ? ` for ${focusSpecialty}` : ""}.
          </div>
        )}
      </ChartPanel>

      {/* Payment vs Benchmark */}
      <ChartPanel title="Payment vs specialty benchmark" subtitle="Latest year, by procedure">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={benchmarkBar}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis dataKey="name" stroke={CHART_COLORS.muted} tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={v => `$${v}`} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v) => fmt.usd(v)}
              contentStyle={{ background: "#0D2137", border: "1px solid rgba(10,126,140,0.3)", borderRadius: 6 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="payment" name="Procedure Payment" fill={CHART_COLORS.tealXlt} radius={[4, 4, 0, 0]} />
            <Bar dataKey="benchmark" name="Specialty Avg" fill={CHART_COLORS.gold} radius={[4, 4, 0, 0]} opacity={0.6} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Facility Mix */}
      <ChartPanel title="Facility vs office mix" subtitle="By specialty, latest year" info={DEFINITIONS.facilityMix}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={facilityData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis type="number" tickFormatter={v => fmt.pct0(v)} domain={[0, 1]} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis dataKey="specialty" type="category" width={130} stroke={CHART_COLORS.muted} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => fmt.pct(v)} contentStyle={{ background: "#0D2137", border: "1px solid rgba(10,126,140,0.3)", borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="facility" name="Facility" stackId="a" fill={CHART_COLORS.teal} />
            <Bar dataKey="office" name="Office" stackId="a" fill={CHART_COLORS.navyMid} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* PTCR Comparison Lines */}
      <ChartPanel title="Payment-to-charge ratio trend" subtitle="By specialty across years · top 8 by volume" info={DEFINITIONS.ptcr} className="span-full">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={ptcrTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis dataKey="year" stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => fmt.pct(v)} domain={["auto", "auto"]} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt.pct(v)} contentStyle={{ background: "#0D2137", border: "1px solid rgba(10,126,140,0.3)", borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {trendSpecialties.map((s, i) => (
              <Line key={s} type="monotone" dataKey={s} stroke={colorCycle[i % colorCycle.length]} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}
