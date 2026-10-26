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
import { amountBasis, salesDateScope, salesScenarioDate } from "../data/salesContext";
import { pipelineHygieneText, firstSalesCheck } from "../data/pipelineHygiene";
import { buildPipelineReview } from "../data/pipelineReview";
import { CHART_COLORS, TOOLTIP_PROPS, CHART_ANIM, fmt, groupBy } from "../data/constants";

export default function PipelineIntelligence({ pipeline, isSample = false, selectedSpecialty, specialties, onSelectSpecialty, onOpenBrief }) {
  const review = useMemo(() => buildPipelineReview(pipeline, selectedSpecialty, salesScenarioDate), [pipeline, selectedSpecialty]);
  const hygiene = isSample ? review.hygiene : null;
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
  const kpis = { totalPipe: review.hygiene.openAmount, wonTotal: review.wonAmount, activeCount: review.open.length, wonCount: review.won.length };

  // Territory/owner table
  const ownerData = useMemo(() => {
    const byOwner = groupBy(review.rows, "owner");
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
  }, [review]);

  const ownerColumns = [
    { key: "owner", label: "Owner" },
    { key: "region", label: "Region" },
    { key: "deals", label: isSample ? "Open deals" : "Active Deals" },
    { key: "totalAmount", label: isSample ? "Open-stage ACV" : "Pipeline", render: (v) => fmt.usd0(v) },
    { key: "avgPressure", label: "Avg Pressure", render: (v) => fmt.score(v) },
    { key: "topTier", label: "Highest pressure tier", render: (v) => <PressureBadge tier={v} /> },
  ];

  const overdueColumns = [
    { key: "opportunity_id", label: "Opportunity ID" },
    { key: "account_name", label: "Account" },
    { key: "owner", label: "Owner" },
    { key: "stage", label: "Stage" },
    { key: "amount", label: "Assumed ACV · USD", render: v => fmt.usd0(v) },
    { key: "close_date", label: "Close date" },
    { key: "days_overdue", label: "Days overdue" },
  ];

  return (
    <div className="page-grid">
      <section className="span-full review-start" aria-label="Pipeline review scope">
        <div>
          <h2>Pipeline review: {selectedSpecialty}</h2>
          <p>Totals, owner amounts and overdue opportunities below use this specialty.</p>
          <div className="procedure-controls pipeline-scope-control">
            <label htmlFor="pipeline-specialty">Pipeline specialty</label>
            <select id="pipeline-specialty" value={selectedSpecialty} onChange={event => onSelectSpecialty(event.target.value)}>
              {specialties.map(specialty => <option key={specialty} value={specialty}>{specialty}</option>)}
            </select>
          </div>
        </div>
        <button type="button" className="review-start-button" onClick={onOpenBrief}>Return to {selectedSpecialty} brief →</button>
      </section>
      {hygiene && <section className="span-full pipeline-hygiene" aria-label="Overdue pipeline review">
        <h2>Review overdue pipeline first</h2>
        <p>{pipelineHygieneText(hygiene)}</p>
        <p>{firstSalesCheck}</p>
      </section>}
      {/* KPI Row */}
      <div className="kpi-row span-full">
        <KpiCard label={isSample ? "Open-stage pipeline · ACV" : "Active Pipeline"} value={fmt.usdCompact(kpis.totalPipe)} sub={fmt.plural(kpis.activeCount, "deal")} color="teal" />
        <KpiCard label={isSample ? "Closed won · ACV" : "Closed Won"} value={fmt.usdCompact(kpis.wonTotal)} sub={fmt.plural(kpis.wonCount, "deal")} color="green" />
        {hygiene && <KpiCard label="Overdue open ACV" value={fmt.usdCompact(hygiene.overdueAmount)} sub={`${hygiene.overdueCount} overdue open deals`} color="gold" />}
      </div>

      {isSample && <details className="span-full review-evaluation">
        <summary>Sales amount and date scope</summary>
        <p>{amountBasis}</p>
        <p>{salesDateScope}</p>
      </details>}

      <ChartPanel title={`Overdue opportunities · ${selectedSpecialty}`} subtitle={`${review.overdue.length} open deals · invented snapshot ${salesScenarioDate}`} className="span-full">
        <p className="review-status">Synthetic opportunity records for stage and close-date review. Days overdue are measured at the scenario snapshot. Reviewing this list does not update a CRM or confirm any changes.</p>
        {review.overdue.length ? <DataTable columns={overdueColumns} data={review.overdue} defaultSort="days_overdue" className="overdue-table" />
          : <p>No overdue open opportunities in the supplied records for {selectedSpecialty}.</p>}
      </ChartPanel>

      <ChartPanel title={`Pipeline by owner · ${selectedSpecialty}`} className="span-full">
        {ownerData.length ? <DataTable columns={ownerColumns} data={ownerData} defaultSort="totalAmount" />
          : <p>No supplied sales opportunities for {selectedSpecialty}.</p>}
      </ChartPanel>

      {/* Pipeline amounts are shown separately from specialty pressure scores. */}
      <ChartPanel title="Compare pipeline across specialties" subtitle="All specialties in the sales fixture · open deals, including overdue" className="span-full">
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
            <Bar dataKey="totalAmount" name={isSample ? "Open-stage ACV" : "Active pipeline"} fill={CHART_COLORS.tealXlt} radius={[4, 4, 0, 0]} {...CHART_ANIM} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Specialty pressure scores" subtitle="All specialties with open deals · select a row to change review scope · project-defined scale 0–100" className="span-full">
        <DataTable columns={[
          { key: "specialty", label: "Specialty" },
          { key: "pressureIndex", label: "Pressure score", render: v => fmt.score(v) },
          { key: "count", label: isSample ? "Open deals" : "Active deals" },
        ]} data={specData} defaultSort="pressureIndex" onRowClick={row => onSelectSpecialty(row.specialty)} />
      </ChartPanel>
    </div>
  );
}
