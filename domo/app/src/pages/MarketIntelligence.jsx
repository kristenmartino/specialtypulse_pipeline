import React, { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import ChartPanel from "../components/ChartPanel";
import DataTable from "../components/DataTable";
import PressureBadge from "../components/PressureBadge";
import InsightStrip from "../components/InsightStrip";
import { marketPresentation, paymentChangeLabel } from "../data/marketPresentation";
import { CHART_COLORS, CHART_SERIES, COMPRESSION_COLORS, TOOLTIP_PROPS, CHART_ANIM, fmt, DEFINITIONS, CHANGE_LABELS } from "../data/constants";

const experimentRevision = typeof __SP_SOURCE_REVISION__ === 'string' ? __SP_SOURCE_REVISION__ : 'main';
const experimentSource = `https://github.com/kristenmartino/specialtypulse_pipeline/blob/${experimentRevision}/domo/app/src/data/pressureIndex.js`;

export default function MarketIntelligence({ benchmarks, selectedSpecialty, onDrill }) {
  const market = useMemo(() => marketPresentation(benchmarks, selectedSpecialty), [benchmarks, selectedSpecialty]);
  const { rows: latestYear, selected, year: maxYear, trendSpecialties, scatter: scatterData } = market;

  const trendData = useMemo(() => {
    const years = [...new Set(benchmarks.map(row => Number(row.year)))].sort((a, b) => a - b);
    return years.map(year => {
      const row = { year };
      benchmarks.filter(item => Number(item.year) === year).forEach(item => {
        row[item.provider_specialty] = item.avg_ptcr;
      });
      return row;
    });
  }, [benchmarks]);

  const driverData = useMemo(() => {
    const counts = {};
    latestYear.forEach(row => {
      const category = row.compression_driver || "Unknown";
      counts[category] = (counts[category] || 0) + 1;
    });
    return Object.entries(counts).map(([category, count]) => ({ name: CHANGE_LABELS[category] || category, category, count }));
  }, [latestYear]);

  const insights = selected ? [
    { label: "Avg. procedure payment change", value: paymentChangeLabel(selected.avg_yoy_payment_change), detail: `Average across procedures, CY${maxYear - 1}–${maxYear}.` },
    { label: "Services", value: fmt.num(selected.total_services), detail: `CY${maxYear} service count.` },
    { label: "Distinct providers", value: fmt.num(selected.total_providers), detail: `Counted once within specialty / CY${maxYear}.` },
  ] : [];

  const comparisonColumns = [
    { key: "provider_specialty", label: "Specialty" },
    { key: "avg_yoy_payment_change", label: "Avg. procedure payment change", render: value => paymentChangeLabel(value) },
    { key: "total_services", label: "Services", render: value => fmt.num(value) },
    { key: "total_providers", label: "Distinct providers", render: value => fmt.num(value) },
    { key: "avg_ptcr", label: "Payment-to-charge ratio", render: value => fmt.pct(value) },
    { key: "compression_driver", label: "Change pattern", render: value => CHANGE_LABELS[value] || value },
    { key: "outlier_procedure_count", label: "Flagged procedures" },
  ];
  const experimentColumns = [
    { key: "provider_specialty", label: "Specialty" },
    { key: "pressure_index", label: "Experimental score", render: value => fmt.score(value) },
    { key: "pressure_tier", label: "Experimental band", render: value => <PressureBadge tier={value} /> },
  ];

  return (
    <div className="page-grid">
      {selected && <p className="review-status span-full">Selected specialty: <strong>{selected.provider_specialty}</strong>{selected.provider_specialty === 'Dermatology' ? ' · Worked example' : ''}</p>}
      <InsightStrip items={insights} />

      <details className="span-full review-evaluation pressure-experiment">
        <summary>Experimental pressure index</summary>
        <p>A project-defined weighted score for exploring synthetic scenarios. Its weights have not been validated against account need or sales outcomes.</p>
        <p>{DEFINITIONS.pressureIndex.replace(' Project-defined weights; not validated against sales outcomes.', '')}</p>
        <p><a className="exec-brief-link" href={experimentSource} target="_blank" rel="noreferrer">Scoring formula and implementation ↗</a></p>
        <DataTable columns={experimentColumns} data={latestYear} defaultSort="provider_specialty" defaultSortDir="asc" />
      </details>

      <ChartPanel title="Specialty comparisons"
        subtitle={`${latestYear.length} specialties · CY${maxYear || '—'} · alphabetical by default · select a row to inspect procedures →`}
        info="Average procedure payment change is the mean of available procedure-level year-over-year changes. It can reflect changes in the underlying records and service mix; it does not identify an account need."
        className="span-full">
        <DataTable columns={comparisonColumns} data={latestYear} defaultSort="provider_specialty" defaultSortDir="asc"
          onRowClick={onDrill ? row => onDrill(row.provider_specialty) : undefined} />
      </ChartPanel>

      <ChartPanel title="Payment-to-charge ratio trend" subtitle={selected?.provider_specialty || 'No specialty selected'} info={DEFINITIONS.ptcr}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis dataKey="year" stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis domain={["auto", "auto"]} tickFormatter={value => fmt.pct(value)} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip formatter={value => fmt.pct(value)} {...TOOLTIP_PROPS} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {trendSpecialties.map((specialty, i) => <Line key={specialty} type="monotone" dataKey={specialty}
              stroke={CHART_SERIES[i % CHART_SERIES.length]} strokeWidth={2} dot={{ r: 3 }} {...CHART_ANIM} />)}
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Payment and charge changes" subtitle={`CY${maxYear || '—'} distribution · all specialties`} info={DEFINITIONS.compressionDriver}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={driverData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis type="number" allowDecimals={false} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis dataKey="name" type="category" width={180} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip {...TOOLTIP_PROPS} />
            <Bar dataKey="count" name="Specialties" radius={[0, 4, 4, 0]} {...CHART_ANIM}>
              {driverData.map((item, i) => <Cell key={i} fill={COMPRESSION_COLORS[item.category] || CHART_COLORS.muted} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Service volume and payment-to-charge ratio" subtitle="One point per specialty · equal-size markers" className="span-full">
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 12, right: 24, bottom: 16, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis type="number" dataKey="services" name="Services" domain={["auto", "auto"]} tickFormatter={value => `${(value / 1e3).toFixed(0)}K`} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} height={46} label={{ value: "Services", position: "insideBottom", offset: 0, fill: CHART_COLORS.muted, fontSize: 11 }} />
            <YAxis type="number" dataKey="ptcr" name="Payment-to-charge ratio" domain={["auto", "auto"]} tickFormatter={value => fmt.pct(value)} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} width={74} label={{ value: "Payment-to-charge ratio", angle: -90, position: "insideLeft", offset: 0, fill: CHART_COLORS.muted, fontSize: 11 }} />
            <Tooltip formatter={(value, name) => name === "Payment-to-charge ratio" ? fmt.pct(value) : name === "Services" ? fmt.num(value) : value}
              labelFormatter={(_, entries) => entries?.[0]?.payload?.name || "Specialty"} {...TOOLTIP_PROPS} />
            <Scatter data={scatterData} fill={CHART_COLORS.tealXlt} fillOpacity={0.8} {...CHART_ANIM} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartPanel>


    </div>
  );
}
