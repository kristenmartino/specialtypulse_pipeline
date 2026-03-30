import React from "react";

export default function ChartPanel({ title, subtitle, children, className = "" }) {
  return (
    <div className={`chart-panel ${className}`}>
      <div className="chart-panel-header">
        <span className="panel-title">{title}</span>
        {subtitle && <span className="panel-count">{subtitle}</span>}
      </div>
      <div className="chart-panel-body">
        {children}
      </div>
    </div>
  );
}
