import React from "react";

export default function KpiCard({ label, value, sub, color = "teal" }) {
  return (
    <div className={`kpi-card kpi-${color}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
