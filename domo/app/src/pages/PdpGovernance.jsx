import React from "react";
import { ROLE_META, fmt } from "../data/constants";
import { isDomo } from "../data/domoFetch";
import { policyGroupCount, verificationState } from "../data/reportingFacts";

const EXAMPLE_RULES = [
  ["Output access", "Use specialty and full-access policies on specialty benchmarks."],
  ["Input access", "Keep these output policies off the input DataSet."],
  ["Regional access (planned)", "Regional policies require a state-level output that retains provider_state."],
  ["User coverage", "Assign each specialty analyst to their specialty policy."],
  ["Conflicting assignments", "Check for assignments that grant unintended access."],
  ["Unrestricted roles", "Allow Finance admin and Executive roles to see all rows."],
];

// ── SUB-COMPONENTS ─────────────────────────────────────────────────────────────

function OverallStatusBadge({ checks, loading }) {
  const state = verificationState(checks, !isDomo);
  if (state === "sample") return null;
  const label = loading ? "Loading recorded results…" : state === "sample" ? "Sample verification results" : state === "unknown" ? "No verification results" : state === "pass" ? "Recorded checks passed" : "Recorded check failures";
  return <div className={`status-badge ${state === "sample" || state === "unknown" ? "loading" : state}`}>{label}</div>;
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
                  <span className="role-name">{meta.label}</span>

                </div>
                <div className="role-count">{roleCounts[role] || 0}</div>
                <div className="role-desc">{!isDomo && role === "regional_sales" ? "Planned: assigned region states" : meta.desc}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VerifyStatusPanel({ checks, loading }) {
  const sample = verificationState(checks, !isDomo) === "sample";
  if (sample) return (
    <div className="panel">
      <div className="panel-header"><span className="panel-title">Example policy rules</span><span className="panel-count">{EXAMPLE_RULES.length} rules</span></div>
      <dl className="check-list">
        {EXAMPLE_RULES.map(([name, expected]) => <div className="check-item" key={name}><div className="check-body"><dt className="check-name">{name}</dt><dd className="check-msg">{expected}</dd></div></div>)}
      </dl>
    </div>
  );
  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Recorded checks</span>
        {!loading && checks.length > 0 && (
          <span className="panel-count">
            {sample ? `${checks.length} rules` : `${checks.filter(c => c.passed === "true" || c.passed === true).length}/${checks.length} passed`}
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
          {checks.map((check, i) => {
            const pass = check.passed === "true" || check.passed === true;
            const sample = verificationState([check], !isDomo) === "sample";
            return (
              <div key={i} className={`check-item ${sample ? "sample" : pass ? "pass" : "fail"}`}>
                <span className={`check-icon ${sample ? "sample" : pass ? "pass" : "fail"}`}>
                  {sample ? "—" : pass ? "\u2713" : "\u2717"}
                </span>
                <div className="check-body">
                  <div className="check-name">{check.check_name}</div>
                  <div className={`check-msg ${pass ? "" : "fail"}`}>{check.message}</div>
                </div>
              </div>
            );
          })}
          {verificationState(checks, !isDomo) !== "sample" && checks[0]?.run_at && (
            <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
              Recorded run: {fmt.date(checks[0].run_at)}
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
        <span className="panel-count">{policyGroupCount(config)} groups · {config.length} assignments</span>
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
                  <td><span className="notes-cell">{!isDomo && row.filter_dimension === "provider_state" ? `Planned: ${row.notes}` : row.notes}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE COMPONENT ────────────────────────────────────────────────────────

export default function PdpGovernance({ config, checks, loading }) {

  return (
    <div>
      {isDomo && <div className="page-status-row"><OverallStatusBadge checks={checks} loading={loading} /></div>}
      <div className="main-grid">
        <RoleSummaryPanel config={config} loading={loading} />
        <VerifyStatusPanel checks={checks} loading={loading} />
        <PolicyMatrixPanel config={config} loading={loading} />
      </div>
    </div>
  );
}
