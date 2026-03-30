import React, { useState, useEffect, useCallback } from "react";

// ── DOMO.JS BRIDGE ────────────────────────────────────────────────────────────
// When running inside Domo, domo.js is injected as a global.
// When running locally via `npm start`, we use mock data instead.
// This bridge handles both environments cleanly.

const isDomo = typeof window !== "undefined" && typeof window.domo !== "undefined";

// ── AI PROXY ─────────────────────────────────────────────────────────────────
// The Anthropic API requires an x-api-key header. Calling it directly from the
// browser would expose the key in the client bundle. Instead:
//   - In Domo: use Domo's server-side proxy (/domo/proxy/v1/messages)
//   - Local dev: use webpack devServer proxy (see webpack.config.js)
// Both forward the request server-side where the key is kept secret.
const AI_API_URL = isDomo
  ? "/domo/proxy/v1/messages"
  : "/api/anthropic/v1/messages";

const domoFetch = (alias) => {
  if (isDomo) {
    return window.domo.get(`/data/v1/${alias}?limit=1000`);
  }
  // Local dev — return mock data matching the DataSet schema
  return Promise.resolve(MOCK_DATA[alias] || []);
};

// ── MOCK DATA (local dev only) ────────────────────────────────────────────────
const MOCK_DATA = {
  pdp_config: [
    { email: "kristen.martino@company.com",   role: "finance_admin",     filter_dimension: "ALL_ROWS",          filter_values: "",                          notes: "Finance team" },
    { email: "ceo@company.com",               role: "executive",         filter_dimension: "ALL_ROWS",          filter_values: "",                          notes: "C-suite" },
    { email: "vp.sales@company.com",          role: "executive",         filter_dimension: "ALL_ROWS",          filter_values: "",                          notes: "VP Sales" },
    { email: "analyst.derm@company.com",      role: "specialty_analyst", filter_dimension: "provider_specialty", filter_values: "Dermatology",               notes: "Derm product" },
    { email: "analyst.ortho@company.com",     role: "specialty_analyst", filter_dimension: "provider_specialty", filter_values: "Orthopedic Surgery",        notes: "Ortho product" },
    { email: "analyst.cardio@company.com",    role: "specialty_analyst", filter_dimension: "provider_specialty", filter_values: "Cardiology",                notes: "Cardiology product" },
    { email: "analyst.gastro@company.com",    role: "specialty_analyst", filter_dimension: "provider_specialty", filter_values: "Gastroenterology",          notes: "GI product" },
    { email: "analyst.neuro@company.com",     role: "specialty_analyst", filter_dimension: "provider_specialty", filter_values: "Neurology",                 notes: "Neuro product" },
    { email: "sales.northeast@company.com",   role: "regional_sales",    filter_dimension: "provider_state",    filter_values: "CT,ME,MA,NH,NJ,NY,PA,RI,VT", notes: "Northeast" },
    { email: "sales.southeast@company.com",   role: "regional_sales",    filter_dimension: "provider_state",    filter_values: "AL,AR,FL,GA,KY,LA,MS,NC,SC,TN,VA,WV", notes: "Southeast" },
    { email: "sales.midwest@company.com",     role: "regional_sales",    filter_dimension: "provider_state",    filter_values: "IL,IN,IA,KS,MI,MN,MO,NE,ND,OH,SD,WI", notes: "Midwest" },
    { email: "sales.southwest@company.com",   role: "regional_sales",    filter_dimension: "provider_state",    filter_values: "AZ,NM,OK,TX",              notes: "Southwest" },
    { email: "sales.west@company.com",        role: "regional_sales",    filter_dimension: "provider_state",    filter_values: "AK,CA,CO,HI,ID,MT,NV,OR,UT,WA,WY", notes: "West" },
  ],
  pdp_verify_results: [
    { check_name: "Output DataSet has PDP",           passed: "true",  message: "Output DataSet has 8 PDP policies",                      run_at: new Date().toISOString() },
    { check_name: "Input DataSet has NO PDP",         passed: "true",  message: "Input DataSet has no PDP — correct",                     run_at: new Date().toISOString() },
    { check_name: "Filter columns exist in schema",   passed: "true",  message: "provider_specialty, provider_state exist in schema",     run_at: new Date().toISOString() },
    { check_name: "All config users in policies",     passed: "true",  message: "All 13 config users appear in policies",                 run_at: new Date().toISOString() },
    { check_name: "No conflicting policy assignments", passed: "true", message: "No users in conflicting policies",                       run_at: new Date().toISOString() },
    { check_name: "All Rows policies present",        passed: "true",  message: "Found 2 All Rows (open) policies",                       run_at: new Date().toISOString() },
  ],
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
const ROLE_META = {
  finance_admin:     { label: "Finance Admin",      icon: "◈", color: "gold",   desc: "Full access — all specialties, all states" },
  executive:         { label: "Executive",          icon: "◆", color: "gold",   desc: "Full access — C-suite visibility" },
  specialty_analyst: { label: "Specialty Analyst",  icon: "◎", color: "teal",   desc: "Own specialty only" },
  regional_sales:    { label: "Regional Sales",     icon: "◉", color: "blue",   desc: "Assigned region states only" },
};

const formatRunAt = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  } catch { return iso; }
};

// ── COMPONENTS ────────────────────────────────────────────────────────────────

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
            const meta = ROLE_META[role] || { label: role, icon: "○", color: "teal", desc: "" };
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
          <span className="empty-icon">◌</span>
          No verify results found. Run pdp_verify.py to populate.
        </div>
      ) : (
        <div className="check-list">
          {checks.map((check, i) => {
            const pass = check.passed === "true";
            return (
              <div key={i} className={`check-item ${pass ? "pass" : "fail"}`}>
                <span className={`check-icon ${pass ? "pass" : "fail"}`}>
                  {pass ? "✓" : "✗"}
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
              Last run: {formatRunAt(checks[0].run_at)}
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
          <span className="empty-icon">◌</span>
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
                      {row.filter_dimension === "ALL_ROWS" ? "—" : row.filter_dimension}
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
      // Route through server-side proxy to keep API key off the client.
      // The proxy injects the x-api-key header server-side.
      const response = await fetch(AI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model:      "claude-sonnet-4-20250514",
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
      setError(err.message || "Failed to generate explanation.");
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
        <button
          className="ai-trigger-btn"
          onClick={explain}
          disabled={loading || config.length === 0}
        >
          <span className="ai-icon">◈</span>
          {loading ? "Generating..." : "Explain current policy state"}
        </button>

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
                <div className="ai-model-tag">Generated by Claude · claude-sonnet-4</div>
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
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [config,  setConfig]  = useState([]);
  const [checks,  setChecks]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [configData, checksData] = await Promise.all([
        domoFetch("pdp_config"),
        domoFetch("pdp_verify_results"),
      ]);
      setConfig(configData || []);
      setChecks(checksData || []);
      setLastFetch(new Date());
    } catch (err) {
      console.error("Failed to fetch Domo DataSets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-fetch when Domo DataSets update (live updates inside Domo)
  useEffect(() => {
    if (isDomo && window.domo?.onDataUpdate) {
      window.domo.onDataUpdate(() => fetchData());
    }
  }, [fetchData]);

  const allChecksPass = !loading && checks.length > 0 && checks.every(c => c.passed === "true");

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-logo">SP</div>
          <div>
            <div className="header-title">SpecialtyPulse · PDP Governance</div>
            <div className="header-subtitle">Row-level security · {config.length} users · {checks.length} checks</div>
          </div>
        </div>
        <div className="header-right">
          <div className="header-meta">
            <span>Last fetched</span>
            <span className="val">{lastFetch ? formatRunAt(lastFetch.toISOString()) : "—"}</span>
          </div>
          <OverallStatusBadge checks={checks} loading={loading} />
        </div>
      </header>

      <main className="main-grid">
        <RoleSummaryPanel config={config} loading={loading} />
        <VerifyStatusPanel checks={checks} loading={loading} />
        <PolicyMatrixPanel config={config} loading={loading} />
        <AIExplainPanel config={config} checks={checks} />
      </main>
    </div>
  );
}
