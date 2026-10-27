const test = require('node:test');
const assert = require('node:assert/strict');
const { marketPresentation, paymentChangeLabel } = require('../src/data/marketPresentation');
const { defaultReviewSpecialty, buildBriefFacts } = require('../src/data/reportingFacts');
const { buildReviewHandoff, reviewHandoffText } = require('../src/data/reviewFacts');
const rows = [
  { provider_specialty: 'Urology', year: 2023, pressure_index: 99, total_services: 300, total_providers: 30, avg_ptcr: 0.6, avg_yoy_payment_change: 0.02 },
  { provider_specialty: 'Dermatology', year: 2023, pressure_index: 1, total_services: 200, total_providers: 20, avg_ptcr: 0.5, avg_yoy_payment_change: -0.03 },
  { provider_specialty: 'Anesthesiology', year: 2023, pressure_index: 50, total_services: 100, total_providers: 10, avg_ptcr: 0.4, avg_yoy_payment_change: 0.01 },
  { provider_specialty: 'Urology', year: 2022, pressure_index: 100, total_services: 400, total_providers: 40, avg_ptcr: 0.7 },
];

test('small payment changes retain their direction instead of appearing as negative zero', () => {
  assert.equal(paymentChangeLabel(-0.0001), '<0.1% decrease');
  assert.equal(paymentChangeLabel(0.0001), '<0.1% increase');
  assert.equal(paymentChangeLabel(0), '0.0%');
  assert.equal(paymentChangeLabel(null), '—');
  assert.equal(paymentChangeLabel(-0.029), '-2.9%');
});

test('changing experimental scores cannot alter defaults, ordinary chart data, summary suggestions or exported briefs', () => {
  const changed = rows.map(row => ({ ...row, pressure_index: 100 - row.pressure_index, pressure_tier: 'High pressure' })).reverse();
  const a = marketPresentation(rows);
  const b = marketPresentation(changed);
  assert.equal(defaultReviewSpecialty(rows), 'Dermatology');
  assert.equal(defaultReviewSpecialty(changed), 'Dermatology');
  assert.equal(a.selected.provider_specialty, b.selected.provider_specialty);
  assert.deepEqual(a.rows.map(row => row.provider_specialty), ['Anesthesiology', 'Dermatology', 'Urology']);
  assert.deepEqual(a.scatter, b.scatter);
  assert.deepEqual(a.trendSpecialties, b.trendSpecialties);
  assert.deepEqual(buildBriefFacts(rows, [], []).evidence, buildBriefFacts(changed, [], []).evidence);
  assert.deepEqual(buildBriefFacts(rows, [], []).focuses, buildBriefFacts(changed, [], []).focuses);
  assert.equal(reviewHandoffText(buildReviewHandoff(rows, [])), reviewHandoffText(buildReviewHandoff(changed, [])));
});

test('selected specialty drives descriptive cards and trend; fallback is latest-year alphabetical without the worked example', () => {
  const selected = marketPresentation(rows, 'Urology');
  assert.equal(selected.selected.total_services, 300);
  assert.equal(selected.selected.total_providers, 30);
  assert.deepEqual(selected.trendSpecialties, ['Urology']);
  assert.equal(defaultReviewSpecialty(rows.filter(row => row.provider_specialty !== 'Dermatology')), 'Anesthesiology');
  assert.equal(marketPresentation([], 'Dermatology').selected, null);
  assert.deepEqual(marketPresentation([]).scatter, []);
});
