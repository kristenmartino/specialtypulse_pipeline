import React, { useRef } from "react";

const TABS = [
  { id: "market",    label: "Market Intelligence" },
  { id: "procedure", label: "Procedure Detail" },
  { id: "pipeline",  label: "Pipeline Intelligence" },
  { id: "adoption",  label: "Adoption Tracking" },
  { id: "pdp",       label: "PDP Governance" },
];

export default function TabBar({ active, onChange }) {
  const refs = useRef({});

  // Roving tabindex: arrows move focus + selection, Home/End jump.
  const onKeyDown = (e) => {
    const idx = TABS.findIndex(t => t.id === active);
    let next = null;
    if (e.key === "ArrowRight") next = (idx + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next == null) return;
    e.preventDefault();
    const tab = TABS[next];
    onChange(tab.id);
    refs.current[tab.id]?.focus();
  };

  return (
    <nav className="tab-bar" role="tablist" aria-label="Dashboard pages" onKeyDown={onKeyDown}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          ref={el => { refs.current[tab.id] = el; }}
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`panel-${tab.id}`}
          tabIndex={active === tab.id ? 0 : -1}
          className={`tab-btn ${active === tab.id ? "active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
