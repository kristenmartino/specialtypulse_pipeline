import React from "react";

/**
 * InsightStrip — a row of computed "so what" callouts above the charts.
 * Each item: { tone: "alert"|"trend"|"info", label, value, detail }.
 * Turns descriptive panels into a surfaced read of what changed and where to look.
 */
export default function InsightStrip({ items }) {
  if (!items || !items.length) return null;
  return (
    <div className="insight-strip span-full">
      {items.map((it, i) => (
        <div key={i} className={`insight-card tone-${it.tone || "info"}`}>
          <div className="insight-label">{it.label}</div>
          <div className="insight-value">{it.value}</div>
          {it.detail && <div className="insight-detail">{it.detail}</div>}
        </div>
      ))}
    </div>
  );
}
