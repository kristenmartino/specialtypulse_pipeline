import React from "react";
import { PRESSURE_COLORS, DEFINITIONS } from "../data/constants";

export default function PressureBadge({ tier }) {
  const label = ({ "Immediate Opportunity": "High pressure", Emerging: "Elevated pressure", Monitor: "Moderate pressure", "Low Priority": "Low pressure" })[tier] || tier;
  const bg = PRESSURE_COLORS[label] || "#3A5568";
  return (
    <span
      className="pressure-badge"
      style={{ background: `${bg}25`, color: bg, borderColor: `${bg}50` }}
      title={DEFINITIONS.pressureTier}
    >
      {label}
    </span>
  );
}
