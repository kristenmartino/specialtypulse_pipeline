import React from "react";
import InfoTip from "./InfoTip";
import useCountUp from "../hooks/useCountUp";

export default function KpiCard({ label, value, sub, info, color = "teal" }) {
  const display = useCountUp(value);
  return (
    <div className={`kpi-card kpi-${color}`}>
      <div className="kpi-label">{label}{info && <InfoTip text={info} />}</div>
      <div className="kpi-value">{display}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
