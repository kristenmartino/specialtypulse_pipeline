import React, { useMemo } from "react";
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import ChartPanel from "../components/ChartPanel";
import DataTable from "../components/DataTable";
import { CHART_COLORS, fmt, groupBy } from "../data/constants";

export default function ProcedureDetail({ mart }) {
  // Latest year data
  const latestYear = useMemo(() => {
    if (!mart.length) return [];
    const maxY = Math.max(...mart.map(r => Number(r.year)));
    return mart.filter(r => Number(r.year) === maxY);
  }, [mart]);

  // Outlier procedures
  const outliers = useMemo(
    () => latestYear.filter(r => r.is_payment_outlier === "true")
      .sort((a, b) => Math.abs(Number(b.payment_vs_specialty_pct)) - Math.abs(Number(a.payment_vs_specialty_pct))),
    [latestYear]
  );

  // Payment vs benchmark bar (latest year, all procedures)
  const benchmarkBar = useMemo(() =>
    latestYear.slice(0, 12).map(r => ({
      name: r.hcpcs_code,
      desc: r.hcpcs_description,
      payment: Number(r.avg_medicare_payment),
      benchmark: Number(r.specialty_avg_payment),
      diff: Number(r.payment_vs_specialty_pct),
    })),
    [latestYear]
  );

  // Facility mix area chart by specialty (latest year)
  const facilityData = useMemo(() => {
    const bySpec = groupBy(latestYear, "provider_specialty");
    return Object.entries(bySpec).map(([spec, rows]) => {
      const avgFac = rows.reduce((s, r) => s + Number(r.pct_facility_services), 0) / rows.length;
      return { specialty: spec, facility: avgFac, office: 1 - avgFac };
    });
  }, [latestYear]);

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

  const specialties = useMemo(() => [...new Set(mart.map(r => r.provider_specialty))], [mart]);
  const colorCycle = [CHART_COLORS.tealXlt, CHART_COLORS.gold, CHART_COLORS.blue, CHART_COLORS.purple, CHART_COLORS.green];

  const outlierColumns = [
    { key: "hcpcs_code", label: "HCPCS" },
    { key: "hcpcs_description", label: "Description" },
    { key: "provider_specialty", label: "Specialty" },
    { key: "avg_medicare_payment", label: "Avg Payment", render: (v) => fmt.usd(v) },
    { key: "specialty_avg_payment", label: "Specialty Avg", render: (v) => fmt.usd(v) },
    { key: "payment_vs_specialty_pct", label: "vs Benchmark", render: (v) => {
      const n = Number(v);
      const color = n > 0 ? CHART_COLORS.green : CHART_COLORS.red;
      return <span style={{ color, fontFamily: "var(--font-mono)", fontSize: 11 }}>{fmt.pct(v)}</span>;
    }},
    { key: "total_services", label: "Services", render: (v) => fmt.num(v) },
  ];

  return (
    <div className="page-grid">
      {/* Outlier Table */}
      <ChartPanel title="Payment outlier procedures" subtitle={`${outliers.length} flagged`} className="span-full">
        <DataTable columns={outlierColumns} data={outliers} defaultSort="payment_vs_specialty_pct" />
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
      <ChartPanel title="Facility vs office mix" subtitle="By specialty, latest year">
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
      <ChartPanel title="Payment-to-charge ratio trend" subtitle="By specialty across years" className="span-full">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={ptcrTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis dataKey="year" stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => fmt.pct(v)} domain={["auto", "auto"]} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt.pct(v)} contentStyle={{ background: "#0D2137", border: "1px solid rgba(10,126,140,0.3)", borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {specialties.map((s, i) => (
              <Line key={s} type="monotone" dataKey={s} stroke={colorCycle[i % colorCycle.length]} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}
