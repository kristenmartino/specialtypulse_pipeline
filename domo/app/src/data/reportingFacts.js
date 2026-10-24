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
    evidence.push({ id: "pressure", text: `${top.name} has the highest pressure score (${top.pressure.toFixed(1)}/100).` });
    evidence.push({ id: "pipeline", text: `${top.name} has $${top.amount.toLocaleString("en-US")} in active pipeline across ${top.deals} deals${top.share == null ? "" : ` (${(top.share * 100).toFixed(1)}% of the active total)`}.` });
    focuses.push({ id: "compare-coverage", title: "Compare pipeline by specialty",
      text: "Compare pipeline amounts and pressure scores by specialty.", target: "pipeline", specialty: top.name, evidenceIds: ["pressure", "pipeline"] });
  }
  if (cut) {
    evidence.push({ id: "payment", text: `${cut.provider_specialty} has the lowest average procedure-level payment change (${(Number(cut.avg_yoy_payment_change) * 100).toFixed(1)}% year over year).` });
    focuses.push({ id: "review-payment", title: `Review ${cut.provider_specialty} payment changes`,
      text: "Open the specialty’s procedure payments and year-over-year changes.", target: "procedure", specialty: cut.provider_specialty, evidenceIds: ["payment"] });
  }
  if (deviation) {
    evidence.push({ id: "deviation", text: `${deviation.row.hcpcs_description} (${deviation.row.provider_specialty}) is ${(deviation.magnitude * 100).toFixed(1)}% ${deviation.direction} its specialty's blended payment average.` });
    focuses.push({ id: "review-deviation", title: `Inspect ${deviation.row.provider_specialty} outliers`,
      text: "Open the flagged procedure and its payment comparison.", target: "procedure", specialty: deviation.row.provider_specialty, evidenceIds: ["deviation"] });
  }
  return { year: market.year, procedureYear: procedures.year, total, specialties, top, cut, deviation, evidence, focuses };
}

function topProcedures(rows, specialty, limit = 10) {
  const count = Number.isInteger(limit) && limit >= 0 ? limit : 10;
  return latestRows(rows).rows
    .filter(r => r.provider_specialty === specialty && numeric(r.total_services) && Number(r.total_services) >= 0)
    .sort((a, b) => Number(b.total_services) - Number(a.total_services) || String(a.hcpcs_code).localeCompare(String(b.hcpcs_code)))
    .slice(0, count);
}

function verificationState(checks, sample) {
  if (sample || checks.some(c => c.is_sample === true || c.is_sample === "true")) return "sample";
  if (!checks.length) return "unknown";
  return checks.every(c => c.passed === true || c.passed === "true") ? "pass" : "fail";
}

module.exports = { activePipeline, latestRows, largestDeviation, buildBriefFacts, topProcedures, verificationState };
