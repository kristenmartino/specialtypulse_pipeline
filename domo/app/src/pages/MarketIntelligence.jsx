import React, { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import ChartPanel from "../components/ChartPanel";
import DataTable from "../components/DataTable";
import PressureBadge from "../components/PressureBadge";
import { CHART_COLORS, PRESSURE_COLORS, COMPRESSION_COLORS, fmt } from "../data/constants";

export default function MarketIntelligence({ benchmarks }) {
  // Most recent year data for the pressure table
  const latestYear = useMemo(() => {
    if (!benchmarks.length) return [];
    const maxY = Math.max(...benchmarks.map(r => Number(r.year)));
    return benchmarks
      .filter(r => Number(r.year) === maxY)
      .sort((a, b) => Number(b.pressure_index) - Number(a.pressure_index));
  }, [benchmarks]);

  // Compression trend: avg_ptcr per specialty per year
  const trendData = useMemo(() => {
    const years = [...new Set(benchmarks.map(r => r.year))].sort();
    return years.map(y => {
      const row = { year: y };
      benchmarks.filter(r => r.year === y).forEach(r => {
        row[r.provider_specialty] = Number(r.avg_ptcr);
      });
      return row;
    });
  }, [benchmarks]);

  const specialties = useMemo(
    () => [...new Set(benchmarks.map(r => r.provider_specialty))],
    [benchmarks]
  );

  // Compression driver distribution for latest year
  const driverData = useMemo(() => {
    const counts = {};
    latestYear.forEach(r => {
      const d = r.compression_driver || "Unknown";
      counts[d] = (counts[d] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [latestYear]);

  // Scatter: volume vs compression
  const scatterData = useMemo(() =>
    latestYear.map(r => ({
      name: r.provider_specialty,
      services: Number(r.total_services),
      ptcr: Number(r.avg_ptcr),
      pressure: Number(r.pressure_index),
      tier: r.pressure_tier,
    })),
    [latestYear]
  );

  const colorCycle = [CHART_COLORS.tealXlt, CHART_COLORS.gold, CHART_COLORS.blue, CHART_COLORS.purple, CHART_COLORS.green];

  const pressureColumns = [
    { key: "provider_specialty", label: "Specialty" },
    { key: "pressure_index", label: "Pressure Index", render: (v) => <strong>{fmt.score(v)}</strong> },
    { key: "pressure_tier", label: "Tier", render: (v) => <PressureBadge tier={v} /> },
    { key: "avg_ptcr", label: "Avg PTCR", render: (v) => fmt.pct(v) },
    { key: "compression_driver", label: "Driver" },
    { key: "total_services", label: "Services", render: (v) => fmt.num(v) },
    { key: "total_providers", label: "Providers", render: (v) => fmt.num(v) },
    { key: "outlier_procedure_count", label: "Outliers" },
  ];

  return (
    <div className="page-grid">
      {/* Pressure Index Table */}
      <ChartPanel title="Pressure Index by specialty" subtitle={`${latestYear.length} specialties`} className="span-full">
        <DataTable columns={pressureColumns} data={latestYear} defaultSort="pressure_index" />
      </ChartPanel>

      {/* Compression Trend */}
      <ChartPanel title="Reimbursement compression trend" subtitle="Payment-to-Charge Ratio by year">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis dataKey="year" stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis domain={["auto", "auto"]} tickFormatter={v => fmt.pct(v)} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt.pct(v)} contentStyle={{ background: "#0D2137", border: "1px solid rgba(10,126,140,0.3)", borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {specialties.map((s, i) => (
              <Line key={s} type="monotone" dataKey={s} stroke={colorCycle[i % colorCycle.length]} strokeWidth={2} dot={{ r: 3 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Compression Drivers */}
      <ChartPanel title="Compression drivers" subtitle="Latest year distribution">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={driverData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis type="number" stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis dataKey="name" type="category" width={120} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#0D2137", border: "1px solid rgba(10,126,140,0.3)", borderRadius: 6 }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {driverData.map((d, i) => (
                <Cell key={i} fill={COMPRESSION_COLORS[d.name] || CHART_COLORS.muted} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Volume vs Compression Scatter */}
      <ChartPanel title="Volume vs compression" subtitle="Bubble = pressure index" className="span-full">
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis dataKey="services" name="Services" tickFormatter={v => `${(v / 1e6).toFixed(1)}M`} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis dataKey="ptcr" name="PTCR" tickFormatter={v => fmt.pct(v)} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v, name) => name === "PTCR" ? fmt.pct(v) : name === "Services" ? fmt.num(v) : v}
              contentStyle={{ background: "#0D2137", border: "1px solid rgba(10,126,140,0.3)", borderRadius: 6 }}
            />
            <Scatter data={scatterData}>
              {scatterData.map((d, i) => (
                <Cell key={i} fill={PRESSURE_COLORS[d.tier] || CHART_COLORS.muted} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </ChartPanel>
    </div>
  );
}
