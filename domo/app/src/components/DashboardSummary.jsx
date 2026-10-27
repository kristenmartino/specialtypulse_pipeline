import React, { useMemo } from "react";
import { fmt } from "../data/constants";
import { buildBriefFacts } from "../data/reportingFacts";

export default function DashboardSummary({ benchmarks, mart, pipeline, onNavigate, isSample = false }) {
  const facts = useMemo(() => buildBriefFacts(benchmarks, mart, pipeline), [benchmarks, mart, pipeline]);
  return (
    <details className="exec-brief">
      <summary className="exec-brief-title">Dashboard summary</summary>
      <div className="exec-brief-body">
        <ul className="brief-evidence">
          {facts.evidence.map(item => <li key={item.id}>{item.text}</li>)}
        </ul>
        {!facts.evidence.length && <p>No observations available.</p>}
        <nav className="review-links" aria-label="Explore these results">
          {facts.focuses.map(focus => <button key={focus.id} type="button" className="exec-brief-link" onClick={() => onNavigate(focus.target, focus.specialty)}>{focus.title} →</button>)}
        </nav>
        <details className="brief-evidence">
          <summary>Pipeline by specialty</summary>
          <div className="matrix-scroll">
            <table className="matrix-table">
              <thead><tr><th>Specialty</th><th>Sales coverage</th><th>{isSample ? 'Open-stage ACV' : 'Active pipeline'}</th><th>Share</th></tr></thead>
              <tbody>{facts.specialties.map(r => <tr key={r.name}><td>{r.name}</td><td>{r.coverage.hasRecords ? `${r.coverage.recordCount} supplied records` : 'No sales records supplied'}</td><td>{fmt.usd0(r.amount)}</td><td>{fmt.pct(r.share)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </div>
    </details>
  );
}
