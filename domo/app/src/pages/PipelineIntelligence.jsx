import React, { useMemo } from "react";
import {
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import ChartPanel from "../components/ChartPanel";
import KpiCard from "../components/KpiCard";
import DataTable from "../components/DataTable";
import { activePipeline } from "../data/reportingFacts";
import { amountBasis, salesDateScope, salesScenarioDate, missingSalesText } from "../data/salesContext";
import { pipelineHygieneText, firstSalesCheck } from "../data/pipelineHygiene";
import { buildPipelineReview } from "../data/pipelineReview";
import { salesReviewCsv } from "../data/salesPacket";
import { CHART_COLORS, TOOLTIP_PROPS, CHART_ANIM, fmt, groupBy } from "../data/constants";

export default function PipelineIntelligence({ pipeline, isSample = false, selectedSpecialty, specialties, onSelectSpecialty, onOpenBrief }) {
  const review = useMemo(() => buildPipelineReview(pipeline, selectedSpecialty, salesScenarioDate), [pipeline, selectedSpecialty]);
  const hasSales = review.coverage.hasRecords;
  const hygiene = isSample && hasSales ? review.hygiene : null;
  // Open-stage pipeline comparisons remain independent of experimental scores.
  const specData = useMemo(() => {
    const bySpec = groupBy(activePipeline(pipeline), "account_specialty");
    return Object.entries(bySpec).map(([spec, rows]) => ({
      specialty: spec,
      totalAmount: rows.reduce((s, r) => s + Number(r.amount), 0),
      count: rows.length,
    })).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [pipeline]);

  // Active and won amounts.
  const kpis = { totalPipe: review.hygiene.openAmount, wonTotal: review.wonAmount, activeCount: review.open.length, wonCount: review.won.length };

  const ownerColumns = [
    { key: "owner", label: "Owner" },
    { key: "region", label: "Region" },
    { key: "deals", label: isSample ? "Open deals" : "Active Deals" },
    { key: "totalAmount", label: isSample ? "Open-stage ACV" : "Pipeline", render: (v) => fmt.usd0(v) },
    { key: "oldestDaysOverdue", label: "Oldest overdue · days", render: v => v == null ? '—' : fmt.num(v) },
    { key: "medianDaysOverdue", label: "Median overdue · days", render: v => v == null ? '—' : String(v) },
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
          <div className="procedure-controls pipeline-scope-control">
            <label htmlFor="pipeline-specialty">Pipeline specialty</label>
            <select id="pipeline-specialty" value={selectedSpecialty} onChange={event => onSelectSpecialty(event.target.value)}>
              {specialties.map(specialty => <option key={specialty} value={specialty}>{specialty}</option>)}
            </select>
          </div>
        </div>
        <button type="button" className="review-start-button" onClick={onOpenBrief}>Return to {selectedSpecialty} brief →</button>
      </section>
      {!hasSales && <section className="span-full pipeline-hygiene" aria-label="Sales coverage">
        <h2>Sales coverage unavailable</h2>
        <p>{missingSalesText(selectedSpecialty)}</p>
        <p>The sales fixture contains {review.coverage.specialtyCount} specialties; reimbursement reporting contains {specialties.length}. Procedure comparisons remain available.</p>
      </section>}
      {hygiene && <section className="span-full pipeline-hygiene" aria-label="Overdue pipeline review">
        <h2>Pipeline data check</h2>
        <p className="pipeline-hygiene-metrics"><strong>{hygiene.overdueCount} of {hygiene.openCount} open deals overdue</strong><span>{fmt.usd0(hygiene.overdueAmount)} assumed USD ACV</span>{hygiene.overdueCount > 0 && <span>{hygiene.minDaysOverdue}–{hygiene.maxDaysOverdue} days overdue</span>}</p>
        <p>{firstSalesCheck}</p>
        <p>Invented snapshot: {salesScenarioDate}. This check applies to pipeline planning; discovery questions can be prepared separately.</p>
      </section>}
      {/* KPI Row */}
      <div className="kpi-row pipeline-kpis span-full">
        <KpiCard label={isSample ? "Open-stage pipeline · ACV" : "Active Pipeline"} value={fmt.usdCompact(hasSales ? kpis.totalPipe : null)} sub={hasSales ? fmt.plural(kpis.activeCount, "deal") : 'No sales records supplied'} color="teal" />
        <KpiCard label={isSample ? "Closed won · ACV" : "Closed Won"} value={fmt.usdCompact(hasSales ? kpis.wonTotal : null)} sub={hasSales ? fmt.plural(kpis.wonCount, "deal") : 'No sales records supplied'} color="green" />
        {isSample && <KpiCard label="Overdue open ACV" value={fmt.usdCompact(hygiene?.overdueAmount)} sub={hasSales ? `${hygiene.overdueCount} overdue open deals` : 'No sales records supplied'} color="gold" />}
      </div>

      {isSample && <details className="span-full review-evaluation">
        <summary>Sales amount and date scope</summary>
        <p>{amountBasis}</p>
        <p>{salesDateScope}</p>
        {hygiene && <p>{pipelineHygieneText(hygiene)}</p>}
        <p>Reviewing these records does not update a CRM or confirm any changes. Oldest and median ages use open deals with valid close dates before the snapshot; an em dash means no eligible dates.</p>
      </details>}

      <ChartPanel title={`Pipeline by owner · ${selectedSpecialty}`} subtitle="Open deals · overdue ages in days" className="span-full">
        {review.owners.length ? <DataTable columns={ownerColumns} data={review.owners} defaultSort="totalAmount" />
          : <p>No supplied sales opportunities for {selectedSpecialty}.</p>}
      </ChartPanel>

      <ChartPanel title={`Overdue opportunities · ${selectedSpecialty}`} subtitle={`Scenario snapshot ${salesScenarioDate}`} className="span-full">
        <p className="review-status">Synthetic records for stage and date review; this list does not update a CRM.</p>
        {hasSales && <p className="review-status"><a className="exec-brief-link" download={`specialtypulse-${selectedSpecialty.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-overdue-opportunities.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(salesReviewCsv(review))}`}>Download overdue opportunities CSV ({review.overdue.length})</a></p>}
        {review.overdue.length ? <DataTable key={selectedSpecialty} columns={overdueColumns} data={review.overdue} defaultSort="days_overdue" className="overdue-table" pageSize={10} />
          : <p>{hasSales ? `No overdue open opportunities in the supplied records for ${selectedSpecialty}.` : missingSalesText(selectedSpecialty)}</p>}
      </ChartPanel>

      {/* Compare only the supplied open-stage amounts across specialties. */}
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


    </div>
  );
}
