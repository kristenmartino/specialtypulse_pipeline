import React, { useMemo } from "react";
import { fmt } from "../data/constants";
import { buildBriefFacts } from "../data/reportingFacts";
import { salesScenarioDate } from "../data/salesContext";
import { pipelineHygiene, pipelineHygieneText, firstSalesCheck } from "../data/pipelineHygiene";

export default function DashboardSummary({ benchmarks, mart, pipeline, onNavigate, isSample = false }) {
  const facts = useMemo(() => buildBriefFacts(benchmarks, mart, pipeline), [benchmarks, mart, pipeline]);
  const hygiene = useMemo(() => isSample ? pipelineHygiene(pipeline, salesScenarioDate) : null, [pipeline, isSample]);
  return (
    <details className="exec-brief">
      <summary className="exec-brief-title">Dashboard summary</summary>
      <div className="exec-brief-body">
        {hygiene && <div className="pipeline-hygiene"><p>{pipelineHygieneText(hygiene)}</p><p>{firstSalesCheck}</p></div>}
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
              <thead><tr><th>Specialty</th><th>Pressure score</th><th>{isSample ? 'Open-stage ACV' : 'Active pipeline'}</th><th>Share</th></tr></thead>
              <tbody>{facts.specialties.map(r => <tr key={r.name}><td>{r.name}</td><td>{fmt.score(r.pressure)}</td><td>{fmt.usd0(r.amount)}</td><td>{fmt.pct(r.share)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </div>
    </details>
  );
}
