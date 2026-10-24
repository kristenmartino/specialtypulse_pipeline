const receipt = require('../../../../data/pipeline_run.json');

const numeric = value => value != null && value !== '' && Number.isFinite(Number(value));
const numberOrNull = value => numeric(value) ? Number(value) : null;
const cents = value => numeric(value) ? Math.round(Number(value) * 100) : null;
const sourceRevision = typeof __SP_SOURCE_REVISION__ === 'string' ? __SP_SOURCE_REVISION__ : 'main';
const repository = 'https://github.com/kristenmartino/specialtypulse_pipeline';

function comparisonUrl(specialty, code, year) {
  const query = new URLSearchParams({ view: 'procedure', specialty, hcpcs: String(code), year: String(year) });
  return `https://specialtypulse.kristenmartino.ai/?${query}`;
}

function buildProcedureComparison(mart, specialty, code, year) {
  const matches = mart.filter(row => row.provider_specialty === specialty && String(row.hcpcs_code) === String(code));
  const targetYear = numeric(year) ? Number(year) : Math.max(...matches.filter(row => numeric(row.year)).map(row => Number(row.year)));
  const current = matches.filter(row => Number(row.year) === targetYear);
  // Ambiguous keys must not become apparently precise evidence.
  if (current.length !== 1) return null;
  const previous = matches.filter(row => Number(row.year) === targetYear - 1);
  const prior = previous.length === 1 ? previous[0] : null;
  const row = current[0];
  const currentCents = cents(row.avg_medicare_payment);
  const priorCents = cents(prior?.avg_medicare_payment);
  const services = numberOrNull(row.total_services);
  const priorServices = numberOrNull(prior?.total_services);
  const paymentDeltaCents = currentCents != null && priorCents != null ? currentCents - priorCents : null;
  const serviceDelta = services != null && priorServices != null ? services - priorServices : null;
  return {
    id: `${targetYear}-${code}`, specialty, code: String(code), description: row.hcpcs_description,
    year: targetYear, priorYear: targetYear - 1,
    payment: currentCents == null ? null : currentCents / 100, services,
    priorPayment: priorCents == null ? null : priorCents / 100, priorServices,
    paymentDelta: paymentDeltaCents == null ? null : paymentDeltaCents / 100,
    paymentChange: paymentDeltaCents != null && priorCents > 0 ? paymentDeltaCents / priorCents : null,
    serviceDelta, volumeChange: serviceDelta != null && priorServices > 0 ? serviceDelta / priorServices : null,
    priorAvailable: Boolean(prior),
  };
}

function evidenceReferences(comparison, revision = sourceRevision) {
  const blob = path => `${repository}/blob/${revision}/${path}`;
  const years = [...new Set([comparison.priorYear, comparison.year])];
  return {
    revision, executedAt: receipt.executed_at, martSha256: receipt.mart_csv_sha256,
    mart: blob('data/sample_mart_reimbursement_trends.csv'),
    receipt: blob('data/pipeline_run.json'),
    method: blob('docs/verification/payment-check.md'),
    reopen: comparisonUrl(comparison.specialty, comparison.code, comparison.year),
    sources: years.map(year => {
      const path = `data/sample_${year}_puf_10k.csv`;
      return { year, path, sha256: receipt.source_sha256[path] || null, url: receipt.source_sha256[path] ? blob(path) : null };
    }),
    calculation: comparison.specialty === 'Dermatology' && comparison.code === '99213' && years.includes(2023)
      ? blob('data/payment_verification.json') : null,
  };
}

const money = value => value == null ? 'unavailable' : `${value < 0 ? '−' : ''}$${Math.abs(value).toFixed(2)}`;
const count = value => value == null ? 'unavailable' : value.toLocaleString('en-US');
const pct = value => value == null ? 'unavailable' : `${(value * 100).toFixed(1)}%`;
const signed = (value, format) => value == null ? 'unavailable' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;
const change = (delta, ratio, format) => delta == null ? 'unavailable' : `${signed(delta, format)} (${ratio == null ? 'percentage unavailable' : signed(ratio, pct)})`;

function procedureEvidenceText(item) {
  const ref = item.references || evidenceReferences(item);
  return [
    `- ${item.specialty} / HCPCS ${item.code} / CY${item.year}: ${item.description}; average payment per service ${money(item.payment)}; ${count(item.services)} services. Source: synthetic reporting mart.`,
    `  Same-procedure comparison: CY${item.priorYear} ${money(item.priorPayment)} / ${count(item.priorServices)} services → CY${item.year} ${money(item.payment)} / ${count(item.services)} services.`,
    `  Payment change: ${change(item.paymentDelta, item.paymentChange, money)}. Service change: ${change(item.serviceDelta, item.volumeChange, count)}.`,
    `  Calculation: (CY${item.year} − CY${item.priorYear}) ÷ CY${item.priorYear}, for this specialty and HCPCS code. Payment differences use displayed mart values rounded to cents. Percentages are unavailable when inputs are missing or the prior value is zero.`,
    '  2021–2022 are generated comparison scenarios; 2023 is a synthetic base. These are not historical CMS comparisons.',
    `  [Reopen live comparison](${ref.reopen})`,
    `  [Reporting mart snapshot](${ref.mart}) — filter provider_specialty=${item.specialty}, hcpcs_code=${item.code}, years=${item.priorYear},${item.year}.`,
    `  Snapshot SHA-256: ${ref.martSha256}. Repository revision: ${ref.revision}.`,
    `  [Local Spark run receipt](${ref.receipt}) — recorded execution ${ref.executedAt}.`,
    ...ref.sources.map(source => source.url
      ? `  [CY${source.year} synthetic raw inputs](${source.url}) — SHA-256 ${source.sha256}. Filter provider_type=${item.specialty}, hcpcs_cd=${item.code}, tot_srvcs>=11; payment is weighted by services.`
      : `  CY${source.year} raw inputs unavailable.`),
    ...(ref.calculation ? [`  [CY2023 Dermatology / 99213 raw-to-mart calculation](${ref.calculation}) — this trace covers that specific year and procedure.`] : []),
    `  [Reproduction method](${ref.method}). The live link uses the current demo; pinned files preserve this evidence snapshot.`,
  ];
}

module.exports = { buildProcedureComparison, evidenceReferences, comparisonUrl, procedureEvidenceText };
