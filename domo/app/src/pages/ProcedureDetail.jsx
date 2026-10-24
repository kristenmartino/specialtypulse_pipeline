import React, { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import ChartPanel from "../components/ChartPanel";
import DataTable from "../components/DataTable";
import CalculationCheck from "../components/CalculationCheck";
import { isDomo } from "../data/domoFetch";
import InsightStrip from "../components/InsightStrip";
import { largestDeviation, topProcedures } from "../data/reportingFacts";
import { CHART_COLORS, TOOLTIP_PROPS, CHART_ANIM, fmt, DEFINITIONS } from "../data/constants";

export default function ProcedureDetail({ mart, focusSpecialty, onSelectSpecialty }) {
  const latestYear = useMemo(() => mart.length ? Math.max(...mart.map(r => Number(r.year))) : null, [mart]);
  const latestRows = useMemo(() => mart.filter(r => Number(r.year) === latestYear), [mart, latestYear]);
  const specialties = useMemo(() => [...new Set(latestRows.map(r => r.provider_specialty))].sort(), [latestRows]);
  const selectedSpecialty = specialties.includes(focusSpecialty)
    ? focusSpecialty
    : specialties.includes("Dermatology") ? "Dermatology" : specialties[0] || "";
  const view = useMemo(() => latestRows.filter(r => r.provider_specialty === selectedSpecialty), [latestRows, selectedSpecialty]);
  const procedures = useMemo(() => topProcedures(latestRows, selectedSpecialty, 10), [latestRows, selectedSpecialty]);
  const maxServices = procedures.reduce((max, r) => Math.max(max, Number(r.total_services) || 0), 0);
  const outliers = useMemo(() => view.filter(r => String(r.is_payment_outlier) === "true")
    .sort((a, b) => Math.abs(Number(b.payment_vs_specialty_pct)) - Math.abs(Number(a.payment_vs_specialty_pct))), [view]);

  const insights = useMemo(() => {
    const items = [];
    const deviation = largestDeviation(view);
    if (deviation) items.push({
      tone: "alert",
      label: "Largest flagged payment difference",
      value: `${deviation.row.hcpcs_description} · ${fmt.pct(deviation.magnitude)} ${deviation.direction}`,
      detail: "Compared with the specialty average.",
    });
    const cut = [...view].filter(r => r.yoy_payment_change_pct != null && Number(r.yoy_payment_change_pct) < 0)
      .sort((a, b) => Number(a.yoy_payment_change_pct) - Number(b.yoy_payment_change_pct))[0];
    if (cut) items.push({
      tone: "trend",
      label: "Largest payment decline",
      value: `${cut.hcpcs_description} ${fmt.pct(cut.yoy_payment_change_pct)}`,
      detail: `Average payment, CY${latestYear - 1}–${latestYear}.`,
    });
    return items;
  }, [view, latestYear]);

  const facilityData = useMemo(() => {
    if (!view.length) return [];
    const facility = view.reduce((sum, r) => sum + Number(r.pct_facility_services), 0) / view.length;
    return [{ specialty: selectedSpecialty, facility, office: 1 - facility }];
  }, [view, selectedSpecialty]);

  const ratioTrend = useMemo(() => {
    const rows = mart.filter(r => r.provider_specialty === selectedSpecialty);
    return [...new Set(rows.map(r => Number(r.year)))].sort((a, b) => a - b).map(year => {
      const current = rows.filter(r => Number(r.year) === year);
      return { year, ratio: current.reduce((sum, r) => sum + Number(r.payment_to_charge_ratio), 0) / current.length };
    });
  }, [mart, selectedSpecialty]);

  const outlierColumns = [
    { key: "hcpcs_code", label: "HCPCS" },
    { key: "hcpcs_description", label: "Procedure" },
    { key: "avg_medicare_payment", label: "Avg payment", render: v => fmt.usd(v) },
    { key: "specialty_avg_payment", label: "Specialty avg", render: v => fmt.usd(v) },
    { key: "payment_vs_specialty_pct", label: "Difference", render: v => {
      const n = Number(v);
      return <span style={{ color: CHART_COLORS.gold }}>{fmt.pct(Math.abs(n))} {n < 0 ? "below" : n > 0 ? "above" : "at"}</span>;
    } },
    { key: "total_services", label: "Services", render: v => fmt.num(v) },
  ];

  return (
    <div className="page-grid">
      <div className="procedure-controls span-full">
        <label htmlFor="procedure-specialty">Specialty</label>
        <select id="procedure-specialty" value={selectedSpecialty} onChange={event => onSelectSpecialty?.(event.target.value)} disabled={!specialties.length}>
          {!specialties.length && <option value="">No specialties available</option>}
          {specialties.map(specialty => <option key={specialty} value={specialty}>{specialty}</option>)}
        </select>
      </div>

      {!isDomo && <CalculationCheck demoMart={mart} />}

      {insights.length > 0 && <InsightStrip items={insights} />}

      <ChartPanel title="Most-used procedures" subtitle={`Top 10 by service count · ${latestYear ? `CY${latestYear}` : "No data"}${selectedSpecialty ? ` · ${selectedSpecialty}` : ""}`} className="span-full">
        {procedures.length ? (
          <ol className="procedure-ranking" aria-label={`Procedures in ${selectedSpecialty}, ranked by service count`}>
            {procedures.map((procedure, index) => {
              const services = Number(procedure.total_services) || 0;
              return <li className="procedure-ranking-row" key={`${procedure.provider_specialty}-${procedure.hcpcs_code}`}>
                <div className="procedure-identity">
                  <span className="procedure-rank" aria-hidden="true">{index + 1}</span>
                  <div><span className="procedure-name">{procedure.hcpcs_description}</span><span className="procedure-code">HCPCS {procedure.hcpcs_code}</span></div>
                </div>
                <div className="procedure-volume">
                  <span className="procedure-measure">{fmt.num(services)} services</span>
                  <div className="procedure-bar-track" aria-hidden="true"><div className="procedure-bar" style={{ width: `${maxServices ? (services / maxServices) * 100 : 0}%` }} /></div>
                </div>
                <div className="procedure-payment"><span className="procedure-measure">{fmt.usd(procedure.avg_medicare_payment)}</span><span className="procedure-measure-label">Avg payment</span></div>
              </li>;
            })}
          </ol>
        ) : <p className="empty-state">No procedure data available for this specialty.</p>}
      </ChartPanel>

      <ChartPanel title="Flagged procedures" subtitle={`${outliers.length} flagged · ${selectedSpecialty || "No specialty"}`} info={DEFINITIONS.paymentOutlier} className="span-full">
        {outliers.length ? <DataTable columns={outlierColumns} data={outliers} defaultSort="payment_vs_specialty_pct" /> : <p className="empty-state">No flagged procedures for {selectedSpecialty || "this specialty"}.</p>}
      </ChartPanel>

      <ChartPanel title="Payment-to-charge ratio" subtitle={selectedSpecialty} info={DEFINITIONS.ptcr}>
        {ratioTrend.length ? <ResponsiveContainer width="100%" height={240}>
          <LineChart data={ratioTrend} margin={{ left: 4, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis dataKey="year" stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => fmt.pct(v)} domain={["auto", "auto"]} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => fmt.pct(v)} {...TOOLTIP_PROPS} />
            <Line type="monotone" dataKey="ratio" name="Payment-to-charge ratio" stroke={CHART_COLORS.tealXlt} strokeWidth={2} dot={{ r: 3 }} {...CHART_ANIM} />
          </LineChart>
        </ResponsiveContainer> : <p className="empty-state">No trend data available.</p>}
      </ChartPanel>

      <ChartPanel title="Facility vs office mix" subtitle={`${selectedSpecialty || "No specialty"}${latestYear ? ` · CY${latestYear}` : ""}`} info={DEFINITIONS.facilityMix}>
        {facilityData.length ? <ResponsiveContainer width="100%" height={160}>
          <BarChart data={facilityData} layout="vertical" margin={{ left: 4, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,126,140,0.15)" />
            <XAxis type="number" tickFormatter={v => fmt.pct0(v)} domain={[0, 1]} stroke={CHART_COLORS.muted} tick={{ fontSize: 11 }} />
            <YAxis dataKey="specialty" type="category" hide />
            <Tooltip formatter={v => fmt.pct(v)} {...TOOLTIP_PROPS} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="facility" name="Facility" stackId="a" fill={CHART_COLORS.tealXlt} {...CHART_ANIM} />
            <Bar dataKey="office" name="Office" stackId="a" fill={CHART_COLORS.slate} {...CHART_ANIM} />
          </BarChart>
        </ResponsiveContainer> : <p className="empty-state">No facility data available.</p>}
      </ChartPanel>
    </div>
  );
}
