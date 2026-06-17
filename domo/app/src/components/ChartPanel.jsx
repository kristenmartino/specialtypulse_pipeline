import React from "react";
import InfoTip from "./InfoTip";

export default function ChartPanel({ title, subtitle, info, children, className = "" }) {
  return (
    <div className={`chart-panel ${className}`}>
      <div className="chart-panel-header">
        <span className="panel-title">{title}</span>
        <span className="panel-header-right">
          {subtitle && <span className="panel-count">{subtitle}</span>}
          {info && <InfoTip text={info} />}
        </span>
      </div>
      <div className="chart-panel-body">
        {children}
      </div>
    </div>
  );
}
