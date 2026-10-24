import React, { useMemo } from "react";
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import ChartPanel from "../components/ChartPanel";
import KpiCard from "../components/KpiCard";
import DataTable from "../components/DataTable";
import PressureBadge from "../components/PressureBadge";
import { activePipeline } from "../data/reportingFacts";
import { CHART_COLORS, TOOLTIP_PROPS, CHART_ANIM, fmt, groupBy } from "../data/constants";

export default function PipelineIntelligence({ pipeline }) {
  // Active pipeline totals and independent specialty scores.
  const specData = useMemo(() => {
    const bySpec = groupBy(activePipeline(pipeline), "account_specialty");
    return Object.entries(bySpec).map(([spec, rows]) => ({
      specialty: spec,
      totalAmount: rows.reduce((s, r) => s + Number(r.amount), 0),
      pressureIndex: Number(rows[0]?.pressure_index || 0),
      count: rows.length,
    })).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [pipeline]);

  // Active and won amounts.
  const kpis = useMemo(() => {
    const active = pipeline.filter(r => r.stage !== "Closed Won" && r.stage !== "Closed Lost");
    const totalPipe = active.reduce((s, r) => s + Number(r.amount), 0);
    const won = pipeline.filter(r => r.stage === "Closed Won");
    const wonTotal = won.reduce((s, r) => s + Number(r.amount), 0);
    return { totalPipe, wonTotal, activeCount: active.length, wonCount: won.length };
  }, [pipeline]);

  // Territory/owner table
  const ownerData = useMemo(() => {
    const byOwner = groupBy(pipeline, "owner");
    return Object.entries(byOwner).map(([owner, rows]) => {
      const active = rows.filter(r => r.stage !== "Closed Won" && r.stage !== "Closed Lost");
      return {
        owner,
        region: rows[0]?.region || "",
        deals: active.length,
        totalAmount: active.reduce((s, r) => s + Number(r.amount), 0),
        avgPressure: active.length ? active.reduce((s, r) => s + Number(r.pressure_index || 0), 0) / active.length : 0,
        topTier: active.sort((a, b) => Number(b.pressure_index) - Number(a.pressure_index))[0]?.pressure_tier || "N/A",
      };
    }).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [pipeline]);

  const ownerColumns = [
    { key: "owner", label: "Owner" },
    { key: "region", label: "Region" },
    { key: "deals", label: "Active Deals" },
    { key: "totalAmount", label: "Pipeline", render: (v) => fmt.usd0(v) },
    { key: "avgPressure", label: "Avg Pressure", render: (v) => fmt.score(v) },
    { key: "topTier", label: "Top Tier", render: (v) => <PressureBadge tier={v} /> },
  ];

  return (
    <div className="page-grid">
      {/* KPI Row */}
      <div className="kpi-row span-full">
        <KpiCard label="Active Pipeline" value={fmt.usdCompact(kpis.totalPipe)} sub={fmt.plural(kpis.activeCount, "deal")} color="teal" />
        <KpiCard label="Closed Won" value={fmt.usdCompact(kpis.wonTotal)} sub={fmt.plural(kpis.wonCount, "deal")} color="green" />
      </div>

      {/* Pipeline amounts are shown separately from specialty pressure scores. */}
      <ChartPanel title="Pipeline by specialty" subtitle="Active deals" className="span-full">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={specData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis dataKey="specialty" stroke={CHART_COLORS.muted} tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={v => fmt.usdCompact(v)} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={v => fmt.usd0(v)}
              {...TOOLTIP_PROPS}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="totalAmount" name="Active pipeline" fill={CHART_COLORS.tealXlt} radius={[4, 4, 0, 0]} {...CHART_ANIM} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Specialty pressure scores" subtitle="Project-defined scale · 0–100" className="span-full">
        <DataTable columns={[
          { key: "specialty", label: "Specialty" },
          { key: "pressureIndex", label: "Pressure score", render: v => fmt.score(v) },
          { key: "count", label: "Active deals" },
        ]} data={specData} defaultSort="pressureIndex" />
      </ChartPanel>

      {/* Owner totals */}
      <ChartPanel title="Pipeline by owner" className="span-full">
        <DataTable columns={ownerColumns} data={ownerData} defaultSort="totalAmount" />
      </ChartPanel>
    </div>
  );
}
