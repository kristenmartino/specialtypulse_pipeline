import React, { useState, useEffect, useCallback } from "react";
import { fmt, groupBy } from "../data/constants";
import { AI_API_URL, isDomo } from "../data/domoFetch";

/**
 * ExecutiveBrief — a cross-page AI synthesis (the AskGTM idea from NorthStar).
 * Reads Market + Procedure + Pipeline and returns a 3–4 sentence VP brief.
 * Distinct from the per-page insight strips (deterministic, single-view) and
 * the PDP governance summary (security-specific) — this is the only feature
 * that reasons across the whole dashboard.
 */
export default function ExecutiveBrief({ benchmarks, mart, pipeline }) {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(isDomo ? true : null);

  useEffect(() => {
    if (isDomo) return;
    let cancelled = false;
    fetch("/api/anthropic/health")
      .then(r => (r.ok ? r.json() : { configured: false }))
      .then(j => { if (!cancelled) setAvailable(Boolean(j.configured)); })
      .catch(() => { if (!cancelled) setAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  const buildPrompt = useCallback(() => {
    // Market — latest year
    const maxY = benchmarks.length ? Math.max(...benchmarks.map(r => Number(r.year))) : null;
    const latest = benchmarks.filter(r => Number(r.year) === maxY);
    const ranked = [...latest].sort((a, b) => Number(b.pressure_index) - Number(a.pressure_index));
    const top = ranked[0];
    const cut = [...latest]
      .filter(r => r.avg_yoy_payment_change != null)
      .sort((a, b) => Number(a.avg_yoy_payment_change) - Number(b.avg_yoy_payment_change))[0];

    // Procedures — latest year
    const mMaxY = mart.length ? Math.max(...mart.map(r => Number(r.year))) : null;
    const mLatest = mart.filter(r => Number(r.year) === mMaxY);
    const outliers = mLatest.filter(r => r.is_payment_outlier === "true");
    const over = [...outliers].sort((a, b) => Number(b.payment_vs_specialty_pct) - Number(a.payment_vs_specialty_pct))[0];

    // Pipeline — active deals
    const active = pipeline.filter(r => r.stage !== "Closed Won" && r.stage !== "Closed Lost");
    const totalPipe = active.reduce((s, r) => s + Number(r.amount), 0);
    const validated = active.reduce((s, r) => s + Number(r.market_validated_amount || 0), 0);
    const bySpec = groupBy(active, "account_specialty");
    const specTop = Object.entries(bySpec)
      .map(([s, rows]) => ({ s, amt: rows.reduce((a, r) => a + Number(r.amount), 0) }))
      .sort((a, b) => b.amt - a.amt)[0];
    const byOwner = groupBy(active, "owner");
    const ownerTop = Object.entries(byOwner)
      .map(([o, rows]) => ({ o, region: rows[0]?.region, amt: rows.reduce((a, r) => a + Number(r.market_validated_amount || 0), 0) }))
      .sort((a, b) => b.amt - a.amt)[0];

    return `You are a GTM strategy analyst briefing a VP of Sales at a specialty-healthcare company. Synthesize the dashboard data below into a tight 3–4 sentence executive brief. Cover, in order: (1) where the biggest reimbursement-pressure opportunity is, (2) the sharpest procedure- or payment-level signal, and (3) whether the active sales pipeline is concentrated where the pressure is — call out any misalignment. End with one clear recommended focus. Be specific, name specialties, and write plain prose — no preamble, no headings, no bullet points.

MARKET (CY${maxY}):
- Highest Reimbursement Pressure Index: ${top?.provider_specialty} at ${fmt.score(top?.pressure_index)} (${top?.pressure_tier})
- Full ranking: ${ranked.map(r => `${r.provider_specialty} ${fmt.score(r.pressure_index)}`).join(", ")}
- Sharpest YoY avg-payment change: ${cut ? `${cut.provider_specialty} ${fmt.pct(cut.avg_yoy_payment_change)} (driver: ${cut.compression_driver})` : "n/a"}

PROCEDURES (CY${mMaxY}):
- ${outliers.length} flagged payment-outlier procedures
- Largest over-benchmark: ${over ? `${over.hcpcs_description} in ${over.provider_specialty}, ${fmt.pct(over.payment_vs_specialty_pct)} vs the specialty average` : "none"}

PIPELINE (active deals):
- Active pipeline ${fmt.usdCompact(totalPipe)}; market-validated ${fmt.usdCompact(validated)}
- Specialty with most pipeline: ${specTop ? `${specTop.s} (${fmt.usdCompact(specTop.amt)})` : "n/a"}
- Top territory by market-validated value: ${ownerTop ? `${ownerTop.o} / ${ownerTop.region}` : "n/a"}`;
  }, [benchmarks, mart, pipeline]);

  const generate = async () => {
    setLoading(true);
    setStreaming(false);
    setError("");
    setOutput("");
    try {
      const response = await fetch(AI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model:      "claude-sonnet-4-6",
          max_tokens: 400,
          stream:     true,
          messages:   [{ role: "user", content: buildPrompt() }],
        }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      setStreaming(true);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              setOutput(prev => prev + parsed.delta.text);
            }
          } catch {}
        }
      }
    } catch (err) {
      const notConfigured =
        /API error: (404|405|500|501|503)/.test(err.message || "") || err.name === "TypeError";
      setError(
        notConfigured
          ? "Executive brief isn't configured on this deployment — it runs in the Domo-hosted build, or here once an API key is set on the host."
          : err.message || "Failed to generate the brief.",
      );
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  return (
    <div className="exec-brief">
      <div className="exec-brief-bar">
        <div className="exec-brief-heading">
          <span className="exec-brief-title">{"◈"} Executive Brief</span>
          <span className="exec-brief-sub">AI synthesis across Market, Procedure &amp; Pipeline</span>
        </div>
        {available === false ? (
          <span className="exec-brief-unavail">
            Runs in the Domo-hosted build (set ANTHROPIC_API_KEY to enable here).
          </span>
        ) : (
          <button
            className="exec-brief-btn"
            onClick={generate}
            disabled={loading || available === null}
          >
            {loading ? "Generating…" : available === null ? "Checking…" : output ? "Regenerate" : "Brief me"}
          </button>
        )}
      </div>
      {(output || error) && (
        <div className="exec-brief-body">
          {error ? (
            <div className="ai-error">{error}</div>
          ) : (
            <>
              <p className={`exec-brief-text ${streaming ? "streaming" : ""}`}>{output}</p>
              {!streaming && output && (
                <div className="ai-model-tag">Generated by Claude · synthesized from the live dashboard data</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
