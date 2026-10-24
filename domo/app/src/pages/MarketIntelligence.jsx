import React, { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import ChartPanel from "../components/ChartPanel";
import DataTable from "../components/DataTable";
import PressureBadge from "../components/PressureBadge";
import InsightStrip from "../components/InsightStrip";
import { CHART_COLORS, CHART_SERIES, PRESSURE_COLORS, COMPRESSION_COLORS, TOOLTIP_PROPS, CHART_ANIM, fmt, DEFINITIONS, CHANGE_LABELS } from "../data/constants";

export default function MarketIntelligence({ benchmarks, onDrill }) {
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

  // Compression driver distribution for latest year
  const driverData = useMemo(() => {
    const counts = {};
    latestYear.forEach(r => {
      const d = r.compression_driver || "Unknown";
      counts[d] = (counts[d] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name: CHANGE_LABELS[name] || name, category: name, count }));
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

  const colorCycle = CHART_SERIES;
  const maxYear = latestYear[0]?.year ?? "";
  // With 19 specialties, cap the trend lines to the highest-pressure 8 for legibility.
  const trendSpecialties = latestYear.slice(0, 8).map(r => r.provider_specialty);

  // Surfaced "so what" — the read leadership wants before the charts.
  const insights = useMemo(() => {
    if (!benchmarks.length) return [];
    const maxY = Math.max(...benchmarks.map(r => Number(r.year)));
    const prevY = maxY - 1;
    const latest = benchmarks.filter(r => Number(r.year) === maxY);
    const prev = Object.fromEntries(
      benchmarks.filter(r => Number(r.year) === prevY).map(r => [r.provider_specialty, r])
    );
    const items = [];

    const top = [...latest].sort((a, b) => Number(b.pressure_index) - Number(a.pressure_index))[0];
    if (top) items.push({
      tone: "alert",
      label: "Highest pressure",
      value: `${top.provider_specialty} · ${fmt.score(top.pressure_index)}`,
      detail: `CY${maxY} · highest of ${latest.length} specialties.`,
    });

    let mover = null, moverDelta = -Infinity;
    latest.forEach(r => {
      const p = prev[r.provider_specialty];
      if (p) {
        const d = Number(r.pressure_index) - Number(p.pressure_index);
        if (d > moverDelta) { moverDelta = d; mover = r; }
      }
    });
    if (mover && moverDelta > 0) items.push({
      tone: "trend",
      label: "Biggest mover",
      value: `${mover.provider_specialty} +${moverDelta.toFixed(1)} pts`,
      detail: `Pressure index rose fastest CY${prevY}→CY${maxY}.`,
    });

    const comp = [...latest]
      .filter(r => r.avg_yoy_payment_change != null && Number(r.avg_yoy_payment_change) < 0)
      .sort((a, b) => Number(a.avg_yoy_payment_change) - Number(b.avg_yoy_payment_change))[0];
    if (comp) items.push({
      tone: "trend",
      label: "Lowest average payment change",
      value: `${comp.provider_specialty} ${fmt.pct(comp.avg_yoy_payment_change)}`,
      detail: `Average change across procedures, CY${prevY}–${maxY}.`,
    });

    return items;
  }, [benchmarks]);

  const pressureColumns = [
    { key: "provider_specialty", label: "Specialty" },
    { key: "pressure_index", label: "Pressure Index", render: (v) => <strong>{fmt.score(v)}</strong> },
    { key: "pressure_tier", label: "Tier", render: (v) => <PressureBadge tier={v} /> },
    { key: "avg_ptcr", label: "Payment-to-charge ratio", render: (v) => fmt.pct(v) },
    { key: "compression_driver", label: "Change pattern", render: v => CHANGE_LABELS[v] || v },
    { key: "total_services", label: "Services", render: (v) => fmt.num(v) },
    { key: "total_providers", label: "Providers", render: (v) => fmt.num(v) },
    { key: "outlier_procedure_count", label: "Outliers" },
  ];

  return (
    <div className="page-grid">
      <InsightStrip items={insights} />

      {/* Pressure Index Table */}
      <ChartPanel
        title="Pressure Index by specialty"
        subtitle={`${latestYear.length} specialties · CY${maxYear} · click a row to drill in →`}
        info={DEFINITIONS.pressureIndex}
        className="span-full"
      >
        <DataTable
          columns={pressureColumns}
          data={latestYear}
          defaultSort="pressure_index"
          onRowClick={onDrill ? (row) => onDrill(row.provider_specialty) : undefined}
        />
      </ChartPanel>

      {/* Compression Trend */}
      <ChartPanel title="Payment-to-charge ratio trend" subtitle="Payment-to-Charge Ratio by year · top 8 by pressure" info={DEFINITIONS.ptcr}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis dataKey="year" stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis domain={["auto", "auto"]} tickFormatter={v => fmt.pct(v)} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt.pct(v)} {...TOOLTIP_PROPS} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {trendSpecialties.map((s, i) => (
              <Line key={s} type="monotone" dataKey={s} stroke={colorCycle[i % colorCycle.length]} strokeWidth={2} dot={{ r: 3 }} {...CHART_ANIM} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Compression Drivers */}
      <ChartPanel title="Payment and charge changes" subtitle={`CY${maxYear} distribution`} info={DEFINITIONS.compressionDriver}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={driverData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis dataKey="name" type="category" width={180} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip {...TOOLTIP_PROPS} />
            <Bar dataKey="count" name="Specialties" radius={[0, 4, 4, 0]} {...CHART_ANIM}>
              {driverData.map((d, i) => (
                <Cell key={i} fill={COMPRESSION_COLORS[d.category] || CHART_COLORS.muted} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Volume vs Compression Scatter */}
      <ChartPanel title="Service volume and payment-to-charge ratio" subtitle="One bubble per specialty · size = pressure score" className="span-full">
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 12, right: 24, bottom: 16, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis type="number" dataKey="services" name="Services" domain={["auto", "auto"]} tickFormatter={v => `${(v / 1e3).toFixed(0)}K`} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} height={46} label={{ value: "Services", position: "insideBottom", offset: 0, fill: CHART_COLORS.muted, fontSize: 11 }} />
            <YAxis type="number" dataKey="ptcr" name="Payment-to-charge ratio" domain={["auto", "auto"]} tickFormatter={v => fmt.pct(v)} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} width={74} label={{ value: "Payment-to-charge ratio", angle: -90, position: "insideLeft", offset: 0, fill: CHART_COLORS.muted, fontSize: 11 }} />
            <ZAxis type="number" dataKey="pressure" name="Pressure Index" range={[120, 900]} />
            <Tooltip
              formatter={(v, name) => name === "Payment-to-charge ratio" ? fmt.pct(v) : name === "Services" ? fmt.num(v) : name === "Pressure Index" ? fmt.score(v) : v}
              labelFormatter={(_, entries) => entries?.[0]?.payload?.name || "Specialty"}
              {...TOOLTIP_PROPS}
            />
            <Scatter data={scatterData} fillOpacity={0.8} {...CHART_ANIM}>
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
