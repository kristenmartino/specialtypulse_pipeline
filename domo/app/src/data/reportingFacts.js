// Shared facts used by callouts, summaries and regression checks.
const numeric = (value) => value != null && value !== "" && Number.isFinite(Number(value));
const isFlagged = (row) => String(row.is_payment_outlier) === "true";
const activePipeline = (rows) => rows.filter(r => r.stage !== "Closed Won" && r.stage !== "Closed Lost");
const latestRows = (rows) => {
  const years = rows.map(r => r.year).filter(numeric).map(Number);
  const year = years.length ? Math.max(...years) : null;
  return { year, rows: year == null ? [] : rows.filter(r => Number(r.year) === year) };
};

function largestDeviation(rows) {
  const row = rows.filter(r => isFlagged(r) && numeric(r.payment_vs_specialty_pct))
    .sort((a, b) => Math.abs(Number(b.payment_vs_specialty_pct)) - Math.abs(Number(a.payment_vs_specialty_pct)))[0];
  if (!row) return null;
  const delta = Number(row.payment_vs_specialty_pct);
  return { row, delta, magnitude: Math.abs(delta), direction: delta > 0 ? "above" : delta < 0 ? "below" : "at" };
}

function buildBriefFacts(benchmarks, mart, pipeline) {
  const market = latestRows(benchmarks);
  const procedures = latestRows(mart);
  const active = activePipeline(pipeline);
  const total = active.reduce((s, r) => s + (numeric(r.amount) ? Number(r.amount) : 0), 0);
  const names = new Set([...market.rows.map(r => r.provider_specialty), ...active.map(r => r.account_specialty)]);
  const specialties = [...names].sort().map(name => {
    const benchmark = market.rows.find(r => r.provider_specialty === name);
    const deals = active.filter(r => r.account_specialty === name);
    const amount = deals.reduce((s, r) => s + (numeric(r.amount) ? Number(r.amount) : 0), 0);
    return { name, pressure: numeric(benchmark?.pressure_index) ? Number(benchmark.pressure_index) : null,
      amount, deals: deals.length, share: total > 0 ? amount / total : null };
  });
  const top = [...specialties].filter(r => r.pressure != null).sort((a, b) => b.pressure - a.pressure)[0] || null;
  const cut = [...market.rows].filter(r => numeric(r.avg_yoy_payment_change) && Number(r.avg_yoy_payment_change) < 0)
    .sort((a, b) => Number(a.avg_yoy_payment_change) - Number(b.avg_yoy_payment_change))[0] || null;
  const deviation = largestDeviation(procedures.rows);
  const evidence = [];
  const focuses = [];
  if (top) {
    evidence.push({ id: "pressure", text: `${top.name} has the highest displayed pressure score (${top.pressure.toFixed(1)}/100).` });
    evidence.push({ id: "pipeline", text: `${top.name} has $${top.amount.toLocaleString("en-US")} in active pipeline across ${top.deals} deals${top.share == null ? "" : ` (${(top.share * 100).toFixed(1)}% of the active total)`}.` });
    focuses.push({ id: "compare-coverage", title: `Compare ${top.name} pipeline coverage`,
      text: "Review the specialty's share of active pipeline alongside its reimbursement score. The score does not establish buying intent or a pipeline shortfall.", evidenceIds: ["pressure", "pipeline"] });
  }
  if (cut) {
    evidence.push({ id: "payment", text: `${cut.provider_specialty} has the largest decline in average procedure-level YoY payment change (${(Number(cut.avg_yoy_payment_change) * 100).toFixed(1)}%). This is not a same-procedure reimbursement-rate estimate.` });
    focuses.push({ id: "review-payment", title: `Review ${cut.provider_specialty} payment changes`,
      text: "Inspect procedure-level changes and service mix before attributing the specialty average to rate changes or practice costs.", evidenceIds: ["payment"] });
  }
  if (deviation) {
    evidence.push({ id: "deviation", text: `${deviation.row.hcpcs_description} (${deviation.row.provider_specialty}) is ${(deviation.magnitude * 100).toFixed(1)}% ${deviation.direction} its specialty's blended payment average.` });
    focuses.push({ id: "review-deviation", title: "Review the largest flagged benchmark deviation",
      text: "Compare the procedure with clinically comparable services. A specialty's blended average is a screening reference, not an expected payment for every procedure.", evidenceIds: ["deviation"] });
  }
  return { year: market.year, procedureYear: procedures.year, total, specialties, top, cut, deviation, evidence, focuses };
}

function buildFocusPrompt(facts, sample) {
  return `You are a GTM strategy analyst selecting one data-review task. ${sample ? "All figures are portfolio demo data; pipeline is synthetic." : "Use only the supplied dashboard observations."}
Choose exactly one available review focus. Do not write prose or infer competition, sales readiness, buying intent, practice costs or absent pipeline. The complete active-pipeline totals by specialty are included; not being the largest does not mean absence. Scores are a heuristic, not validated sales probabilities.
Return ONLY JSON: {"focus_id":"an available focus id","evidence_ids":["the exact evidence ids for that focus"]}.
DATA: ${JSON.stringify({ year: facts.year, totalActivePipeline: facts.total, specialties: facts.specialties, evidence: facts.evidence })}
AVAILABLE FOCUSES: ${JSON.stringify(facts.focuses)}`;
}

function validateFocusSelection(text, facts) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("The AI response could not be verified. Use the computed summary below."); }
  const focus = facts.focuses.find(f => f.id === parsed?.focus_id);
  if (!focus || !Array.isArray(parsed.evidence_ids) ||
      Object.keys(parsed).sort().join(",") !== "evidence_ids,focus_id" ||
      [...parsed.evidence_ids].sort().join(",") !== [...focus.evidenceIds].sort().join(",")) {
    throw new Error("The AI response did not match the supplied evidence. Use the computed summary below.");
  }
  // Never render model-authored prose. Only return a known, evidence-linked task.
  return focus;
}

function verificationState(checks, sample) {
  if (sample || checks.some(c => c.is_sample === true || c.is_sample === "true")) return "sample";
  if (!checks.length) return "unknown";
  return checks.every(c => c.passed === true || c.passed === "true") ? "pass" : "fail";
}

module.exports = { activePipeline, latestRows, largestDeviation, buildBriefFacts, buildFocusPrompt, validateFocusSelection, verificationState };
