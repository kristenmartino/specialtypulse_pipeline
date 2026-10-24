import React, { useState, useEffect, useMemo, useRef } from "react";
import { fmt } from "../data/constants";
import { AI_API_URL, isDomo } from "../data/domoFetch";
import { buildBriefFacts, buildFocusPrompt, validateFocusSelection } from "../data/reportingFacts";

export default function ExecutiveBrief({ benchmarks, mart, pipeline }) {
  const facts = useMemo(() => buildBriefFacts(benchmarks, mart, pipeline), [benchmarks, mart, pipeline]);
  const requestRef = useRef(null);
  const [selection, setSelection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(isDomo ? true : null);

  useEffect(() => {
    if (isDomo) return;
    let cancelled = false;
    fetch("/api/anthropic/health")
      .then(r => r.ok ? r.json() : { configured: false })
      .then(j => { if (!cancelled) setAvailable(Boolean(j.configured)); })
      .catch(() => { if (!cancelled) setAvailable(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    requestRef.current?.abort();
    setSelection(null); setError(""); setLoading(false);
    return () => requestRef.current?.abort();
  }, [facts]);

  const generate = async () => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setLoading(true);
    setSelection(null);
    setError("");
    try {
      const response = await fetch(AI_API_URL, {
        method: "POST",
        signal: request.signal,
        headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 200, stream: false,
          messages: [{ role: "user", content: buildFocusPrompt(facts, !isDomo) }] }),
      });
      if (!response.ok) throw new Error("The optional AI selection is unavailable. The computed summary is available below.");
      const result = await response.json();
      if (result.stop_reason !== "end_turn") throw new Error("The AI response was incomplete. Use the computed summary below.");
      const text = (result.content || []).filter(block => block.type === "text").map(block => block.text).join("");
      if (!request.signal.aborted) setSelection(validateFocusSelection(text, facts));
    } catch (err) {
      if (!request.signal.aborted) setError(err.message || "The optional AI selection is unavailable.");
    } finally { if (!request.signal.aborted) setLoading(false); }
  };

  return (
    <details className="exec-brief">
      <summary className="exec-brief-title">Dashboard summary</summary>
      <div className="exec-brief-body">
        <p className="data-note">Computed from the displayed datasets{facts.year ? ` · market CY${facts.year}` : ""}. {!isDomo && "Sample reimbursement data and synthetic sales pipeline."}</p>
        {!facts.evidence.length ? <p>No observations available.</p> : (
          <ul className="brief-evidence">
            {facts.evidence.map(item => <li key={item.id}><strong>{item.id === "pressure" ? "Reimbursement" : item.id === "pipeline" ? "Pipeline" : item.id === "payment" ? "Payment change" : "Procedure"}:</strong> {item.text}</li>)}
          </ul>
        )}
        <details className="brief-evidence">
          <summary>Pipeline comparison by specialty</summary>
          <div className="matrix-scroll">
            <table className="matrix-table">
              <thead><tr><th>Specialty</th><th>Pressure score</th><th>Active pipeline</th><th>Share</th></tr></thead>
              <tbody>{facts.specialties.map(r => <tr key={r.name}><td>{r.name}</td><td>{fmt.score(r.pressure)}</td><td>{fmt.usd0(r.amount)}</td><td>{fmt.pct(r.share)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
        <div className="exec-brief-actions">
          {available === false ? <p className="data-note">Optional AI focus selection is unavailable on this deployment.</p> : (
            <button className="exec-brief-btn" onClick={generate} disabled={loading || available === null || !facts.focuses.length}>
              {loading ? "Selecting…" : available === null ? "Checking availability…" : "Suggest a review focus"}
            </button>
          )}
        </div>
        {error && <p className="ai-error" role="status">{error}</p>}
        {selection && <div className="brief-evidence" role="status">
          <h3>{selection.title}</h3><p>{selection.text}</p>
          <p className="data-note">AI selected this review task from the supported options. Supporting observations:</p>
          <ul>{selection.evidenceIds.map(id => <li key={id}>{facts.evidence.find(e => e.id === id)?.text}</li>)}</ul>
        </div>}
      </div>
    </details>
  );
}
