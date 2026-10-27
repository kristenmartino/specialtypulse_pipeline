const { latestRows, defaultReviewSpecialty } = require('./reportingFacts');

function paymentChangeLabel(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const change = Number(value);
  if (change !== 0 && Math.abs(change) < 0.0005) return `<0.1% ${change < 0 ? 'decrease' : 'increase'}`;
  return `${(change * 100).toFixed(1)}%`;
}

// Only descriptive measures drive the ordinary market view. Experimental
// pressure scores remain on the source benchmarks for the opt-in model panel.
function marketPresentation(benchmarks, specialty) {
  const latest = latestRows(benchmarks);
  const rows = [...latest.rows].sort((a, b) => a.provider_specialty.localeCompare(b.provider_specialty));
  const selected = rows.find(row => row.provider_specialty === specialty)
    || rows.find(row => row.provider_specialty === defaultReviewSpecialty(benchmarks)) || null;
  return {
    year: latest.year, rows, selected,
    trendSpecialties: selected ? [selected.provider_specialty] : [],
    scatter: rows.map(row => ({ name: row.provider_specialty, services: row.total_services, ptcr: row.avg_ptcr })),
  };
}

module.exports = { marketPresentation, paymentChangeLabel };
