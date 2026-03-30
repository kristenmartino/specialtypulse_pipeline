import React from "react";
import { PRESSURE_COLORS } from "../data/constants";

export default function PressureBadge({ tier }) {
  const bg = PRESSURE_COLORS[tier] || "#3A5568";
  return (
    <span
      className="pressure-badge"
      style={{ background: `${bg}25`, color: bg, borderColor: `${bg}50` }}
    >
      {tier}
    </span>
  );
}
