import React, { useState, useCallback, useEffect } from "react";
import { ROLE_META, fmt } from "../data/constants";
import { AI_API_URL, isDomo } from "../data/domoFetch";

// ── SUB-COMPONENTS ─────────────────────────────────────────────────────────────

function PulseDot({ passed, loading }) {
  if (loading) return <span className="pulse-dot gray" />;
  return <span className={`pulse-dot ${passed ? "green" : "red"}`} />;
}

function OverallStatusBadge({ checks, loading }) {
  if (loading) return (
    <div className="status-badge loading">
      <PulseDot loading />
      Checking...
    </div>
  );
  const allPass = checks.length > 0 && checks.every(c => c.passed === "true");
  return (
    <div className={`status-badge ${allPass ? "pass" : "fail"}`}>
      <PulseDot passed={allPass} />
      {allPass ? "All checks passing" : "Check failures detected"}
    </div>
  );
}

function RoleSummaryPanel({ config, loading }) {
  const roleCounts = React.useMemo(() => {
    const counts = {};
    config.forEach(r => { counts[r.role] = (counts[r.role] || 0) + 1; });
    return counts;
  }, [config]);

  const roles = ["finance_admin", "executive", "specialty_analyst", "regional_sales"];

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Role distribution</span>
        <span className="panel-count">{config.length} users</span>
      </div>
      {loading ? (
        <div className="role-grid">
          {roles.map(r => (
            <div key={r} className="role-card">
              <div className="skeleton" style={{ width: "60%", height: 10 }} />
              <div className="skeleton" style={{ width: "30%", height: 28, marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="role-grid">
          {roles.map(role => {
            const meta = ROLE_META[role] || { label: role, icon: "\u25CB", color: "teal", desc: "" };
            return (
              <div key={role} className="role-card">
                <div className="role-card-header">
                  <span className="role-name">{meta.label.toUpperCase()}</span>
                  <span className={`role-icon ${meta.color}`}>{meta.icon}</span>
                </div>
                <div className="role-count">{roleCounts[role] || 0}</div>
                <div className="role-desc">{meta.desc}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VerifyStatusPanel({ checks, loading }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Verify checks</span>
        {!loading && checks.length > 0 && (
          <span className="panel-count">
            {checks.filter(c => c.passed === "true").length}/{checks.length} passing
          </span>
        )}
      </div>
      {loading ? (
        <div className="check-list">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="check-item loading">
              <div className="skeleton" style={{ width: 14, height: 14, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ width: "70%" }} />
                <div className="skeleton" style={{ width: "90%", height: 10 }} />
              </div>
            </div>
          ))}
        </div>
      ) : checks.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">{"\u25CC"}</span>
          No verify results found. Run pdp_verify.py to populate.
        </div>
      ) : (
        <div className="check-list">
          <div className="pdp-note">
            <strong>Why two checks look redundant.</strong> In Domo, a PDP policy
            attached to a DataFlow <em>input</em> is silently dropped at run time, so
            the output then serves every row to every user while still looking
            governed. Policies must live on the <em>output</em>. These checks prove
            that's where they are (and that the input has none).
          </div>
          {checks.map((check, i) => {
            const pass = check.passed === "true";
            return (
              <div key={i} className={`check-item ${pass ? "pass" : "fail"}`}>
                <span className={`check-icon ${pass ? "pass" : "fail"}`}>
                  {pass ? "\u2713" : "\u2717"}
                </span>
                <div className="check-body">
                  <div className="check-name">{check.check_name}</div>
                  <div className={`check-msg ${pass ? "" : "fail"}`}>{check.message}</div>
                </div>
              </div>
            );
          })}
          {checks[0]?.run_at && (
            <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
              Last run: {fmt.date(checks[0].run_at)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PolicyMatrixPanel({ config, loading }) {
  return (
    <div className="panel panel-wide">
      <div className="panel-header">
        <span className="panel-title">Access policy matrix</span>
        <span className="panel-count">{config.length} assignments</span>
      </div>
      {loading ? (
        <div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton" style={{ marginBottom: 10, height: 32 }} />
          ))}
        </div>
      ) : config.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">{"\u25CC"}</span>
          No policy config found. Check DataSet connection.
        </div>
      ) : (
        <div className="matrix-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Filter</th>
                <th>Access scope</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {config.map((row, i) => (
                <tr key={i}>
                  <td><span className="user-email">{row.email}</span></td>
                  <td>
                    <span className={`role-pill ${row.role}`}>
                      {row.role.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>
                    <span className="access-cell" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                      {row.filter_dimension === "ALL_ROWS" ? "\u2014" : row.filter_dimension}
                    </span>
                  </td>
                  <td>
                    {row.filter_dimension === "ALL_ROWS" ? (
                      <span className="access-all">ALL ROWS</span>
                    ) : row.filter_dimension === "provider_specialty" ? (
                      <span className="access-filter">{row.filter_values}</span>
                    ) : (
                      <div className="access-states">
                        {row.filter_values.split(",").map(s => (
                          <span key={s} className="state-chip">{s.trim()}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td><span className="notes-cell">{row.notes}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AIExplainPanel({ config, checks }) {
  const [output,    setOutput]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [streaming, setStreaming] = useState(false);
  // In Domo the proxy is always present; standalone, probe whether a key is set.
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

  const buildPrompt = useCallback(() => {
    const roleCounts = {};
    config.forEach(r => { roleCounts[r.role] = (roleCounts[r.role] || 0) + 1; });

    const specialties = config
      .filter(r => r.filter_dimension === "provider_specialty")
      .map(r => r.filter_values);

    const regions = config
      .filter(r => r.filter_dimension === "provider_state")
      .map(r => r.notes);

    const failedChecks = checks.filter(c => c.passed !== "true");
    const allPass = failedChecks.length === 0 && checks.length > 0;

    return `You are a data governance analyst reviewing PDP (row-level security) policies for a healthcare analytics platform called SpecialtyPulse.

Here is the current policy configuration:
- Total users: ${config.length}
- Finance/Executive (full access): ${(roleCounts["finance_admin"] || 0) + (roleCounts["executive"] || 0)} users
- Specialty analysts (filtered by specialty): ${roleCounts["specialty_analyst"] || 0} users covering: ${specialties.join(", ")}
- Regional sales (filtered by state): ${roleCounts["regional_sales"] || 0} users covering: ${regions.join(", ")}

Verify check status: ${allPass ? "ALL PASSING" : `${failedChecks.length} FAILED: ${failedChecks.map(c => c.check_name).join(", ")}`}

Write a concise 3-4 sentence plain English summary of this security state for a VP of Data Engineering. Cover:
1. Who has full access vs restricted access and why
2. Whether the governance checks are healthy
3. One specific governance risk or strength worth noting

Be direct and specific. No preamble. No bullet points. Just clear sentences.`;
  }, [config, checks]);

  const explain = async () => {
    if (!config.length) return;
    setLoading(true);
    setStreaming(false);
    setError("");
    setOutput("");

    try {
      const response = await fetch(AI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model:      "claude-sonnet-4-6",
          max_tokens: 300,
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
      // 404/503 = no proxy or no key on this host (standalone build); network
      // failures surface as TypeError. Anything else is a real API error.
      const notConfigured =
        /API error: (404|405|500|501|503)/.test(err.message || "") || err.name === "TypeError";
      setError(
        notConfigured
          ? "AI summary isn't configured on this deployment — it runs in the Domo-hosted build, or here once an API key is set on the host."
          : err.message || "Failed to generate explanation.",
      );
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">AI governance summary</span>
        <span className="panel-count" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--teal-lt)" }}>
          claude-sonnet
        </span>
      </div>
      <div className="ai-panel">
        {available === false ? (
          <div className="ai-unavailable">
            <span className="ai-icon">{"\u25C8"}</span>
            <span>
              The AI summary runs in the Domo-hosted build. To enable it on this
              standalone deployment, set <code>ANTHROPIC_API_KEY</code> in the host
              environment. The key stays server-side behind the request proxy.
            </span>
          </div>
        ) : (
          <button
            className="ai-trigger-btn"
            onClick={explain}
            disabled={loading || config.length === 0 || available === null}
          >
            <span className="ai-icon">{"\u25C8"}</span>
            {loading ? "Generating..." : available === null ? "Checking availability\u2026" : "Explain current policy state"}
          </button>
        )}

        {available !== false && (
        <div className="ai-output">
          <div className="ai-output-label">Governance summary</div>
          {error ? (
            <div className="ai-error">{error}</div>
          ) : output ? (
            <>
              <div className={`ai-output-text ${streaming ? "streaming" : ""}`}>
                {output}
              </div>
              {!streaming && (
                <div className="ai-model-tag">Generated by Claude</div>
              )}
            </>
          ) : (
            <div className="ai-placeholder">
              Click the button above to generate a plain-English summary of the current
              PDP security state — who can see what, whether governance checks are healthy,
              and any risks worth flagging.
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN PAGE COMPONENT ────────────────────────────────────────────────────────

export default function PdpGovernance({ config, checks, loading }) {
  const allChecksPass = !loading && checks.length > 0 && checks.every(c => c.passed === "true");

  return (
    <div>
      <div className="page-status-row">
        <OverallStatusBadge checks={checks} loading={loading} />
      </div>
      <div className="main-grid">
        <RoleSummaryPanel config={config} loading={loading} />
        <VerifyStatusPanel checks={checks} loading={loading} />
        <PolicyMatrixPanel config={config} loading={loading} />
        <AIExplainPanel config={config} checks={checks} />
      </div>
    </div>
  );
}
