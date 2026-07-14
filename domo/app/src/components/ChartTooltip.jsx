import React from "react";

/**
 * ChartTooltip — shared branded tooltip for every Recharts chart.
 * The default tooltip colors item text with the series fill, which goes black
 * when the fill lives on per-Cell overrides (and unreadable for dark fills).
 * Here the series color lives in a swatch dot and the text stays legible.
 * Recharts passes through `formatter`/`labelFormatter` from the Tooltip element.
 */
export default function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload || !payload.length) return null;

  let shownLabel = label;
  if (labelFormatter) {
    try { shownLabel = labelFormatter(label, payload); } catch { shownLabel = label; }
  }

  return (
    <div className="chart-tip">
      {shownLabel != null && shownLabel !== "" && (
        <div className="chart-tip-label">{shownLabel}</div>
      )}
      {payload.map((entry, i) => {
        let name = entry.name;
        let value = entry.value;
        if (formatter) {
          const res = formatter(entry.value, entry.name, entry, i, payload);
          if (Array.isArray(res)) {
            value = res[0];
            if (res.length > 1 && res[1] != null) name = res[1];
          } else if (res != null) {
            value = res;
          }
        }
        return (
          <div key={i} className="chart-tip-item">
            <span
              className="chart-tip-dot"
              style={{ background: entry.color || "var(--teal-xlt)" }}
            />
            <span className="chart-tip-name">{name}</span>
            <span className="chart-tip-value">{value}</span>
          </div>
        );
      })}
    </div>
  );
}
