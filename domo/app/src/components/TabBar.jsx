import React from "react";

const TABS = [
  { id: "market",    label: "Market Intelligence" },
  { id: "procedure", label: "Procedure Detail" },
  { id: "pipeline",  label: "Pipeline Intelligence" },
  { id: "adoption",  label: "Adoption Tracking" },
  { id: "pdp",       label: "PDP Governance" },
];

export default function TabBar({ active, onChange }) {
  return (
    <nav className="tab-bar">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`tab-btn ${active === tab.id ? "active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
