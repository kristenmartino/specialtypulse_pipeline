import React from "react";
import InfoTip from "./InfoTip";

export default function KpiCard({ label, value, sub, info, color = "teal" }) {
  return (
    <div className={`kpi-card kpi-${color}`}>
      <div className="kpi-label">{label}{info && <InfoTip text={info} />}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
