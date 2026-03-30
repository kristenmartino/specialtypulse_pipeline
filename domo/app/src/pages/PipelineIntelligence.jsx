import React, { useMemo } from "react";
import {
  BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import ChartPanel from "../components/ChartPanel";
import KpiCard from "../components/KpiCard";
import DataTable from "../components/DataTable";
import PressureBadge from "../components/PressureBadge";
import { CHART_COLORS, PRESSURE_COLORS, fmt, groupBy } from "../data/constants";

export default function PipelineIntelligence({ pipeline }) {
  // Pipeline by specialty with pressure overlay
  const specData = useMemo(() => {
    const bySpec = groupBy(pipeline, "account_specialty");
    return Object.entries(bySpec).map(([spec, rows]) => ({
      specialty: spec,
      totalAmount: rows.reduce((s, r) => s + Number(r.amount), 0),
      validatedAmount: rows.reduce((s, r) => s + Number(r.market_validated_amount || 0), 0),
      pressureIndex: Number(rows[0]?.pressure_index || 0),
      count: rows.length,
    })).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [pipeline]);

  // KPI: market-validated total
  const kpis = useMemo(() => {
    const active = pipeline.filter(r => r.stage !== "Closed Won" && r.stage !== "Closed Lost");
    const totalPipe = active.reduce((s, r) => s + Number(r.amount), 0);
    const validatedPipe = active.reduce((s, r) => s + Number(r.market_validated_amount || 0), 0);
    const won = pipeline.filter(r => r.stage === "Closed Won");
    const wonTotal = won.reduce((s, r) => s + Number(r.amount), 0);
    return { totalPipe, validatedPipe, wonTotal, activeCount: active.length, wonCount: won.length };
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
        validatedAmount: active.reduce((s, r) => s + Number(r.market_validated_amount || 0), 0),
        avgPressure: active.length ? active.reduce((s, r) => s + Number(r.pressure_index || 0), 0) / active.length : 0,
        topTier: active.sort((a, b) => Number(b.pressure_index) - Number(a.pressure_index))[0]?.pressure_tier || "N/A",
      };
    }).sort((a, b) => b.validatedAmount - a.validatedAmount);
  }, [pipeline]);

  const ownerColumns = [
    { key: "owner", label: "Owner" },
    { key: "region", label: "Region" },
    { key: "deals", label: "Active Deals" },
    { key: "totalAmount", label: "Pipeline", render: (v) => fmt.usd(v) },
    { key: "validatedAmount", label: "Market-Validated", render: (v) => fmt.usd(v) },
    { key: "avgPressure", label: "Avg Pressure", render: (v) => fmt.score(v) },
    { key: "topTier", label: "Top Tier", render: (v) => <PressureBadge tier={v} /> },
  ];

  return (
    <div className="page-grid">
      {/* KPI Row */}
      <div className="kpi-row span-full">
        <KpiCard label="Active Pipeline" value={fmt.usd(kpis.totalPipe)} sub={`${kpis.activeCount} deals`} color="teal" />
        <KpiCard label="Market-Validated" value={fmt.usd(kpis.validatedPipe)} sub="Adjusted by pressure index" color="gold" />
        <KpiCard label="Closed Won" value={fmt.usd(kpis.wonTotal)} sub={`${kpis.wonCount} deals`} color="green" />
      </div>

      {/* Pipeline x Pressure Combo */}
      <ChartPanel title="Pipeline amount vs pressure index" subtitle="By specialty" className="span-full">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={specData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis dataKey="specialty" stroke={CHART_COLORS.muted} tick={{ fontSize: 10 }} />
            <YAxis yAxisId="left" tickFormatter={v => `$${(v / 1e3).toFixed(0)}K`} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke={CHART_COLORS.gold} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v, name) => name === "Pressure Index" ? fmt.score(v) : fmt.usd(v)}
              contentStyle={{ background: "#0D2137", border: "1px solid rgba(10,126,140,0.3)", borderRadius: 6 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="totalAmount" name="Total Pipeline" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} opacity={0.6} />
            <Bar yAxisId="left" dataKey="validatedAmount" name="Market-Validated" fill={CHART_COLORS.tealXlt} radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="pressureIndex" name="Pressure Index" stroke={CHART_COLORS.gold} strokeWidth={2} dot={{ r: 4, fill: CHART_COLORS.gold }} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Territory Table */}
      <ChartPanel title="Territory alignment" subtitle="Pipeline by owner" className="span-full">
        <DataTable columns={ownerColumns} data={ownerData} defaultSort="validatedAmount" />
      </ChartPanel>
    </div>
  );
}
