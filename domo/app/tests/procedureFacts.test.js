const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProcedureComparison, evidenceReferences, comparisonUrl } = require('../src/data/procedureFacts');
const { readReviewLocation, reviewSearch } = require('../src/data/reviewLocation');
const { initialReviewState, reviewReducer, getReviewDraft } = require('../src/data/reviewDraft');
const { buildReviewHandoff, reviewHandoffText } = require('../src/data/reviewFacts');
const { aggregateMart, enrichBenchmarks, buildPipelineIntelligence } = require('../src/data/pressureIndex');
const source = require('../src/data/sourceData.json');
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≠ ${expected}`);

test('Dermatology / 99213 compares the actual two mart rows, using cents for payment differences', () => {
  const comparison = buildProcedureComparison(source.mart, 'Dermatology', '99213', 2023);
  assert.equal(comparison.priorPayment, 108.05);
  assert.equal(comparison.payment, 104.91);
  assert.equal(comparison.priorServices, 3626);
  assert.equal(comparison.services, 3777);
  assert.equal(comparison.paymentDelta, -3.14);
  assert.equal(comparison.serviceDelta, 151);
  closeTo(comparison.paymentChange, -314 / 10805);
  closeTo(comparison.volumeChange, 151 / 3626);
});

test('comparison refuses unrelated rows, missing years, duplicate keys and zero denominators', () => {
  const current = { provider_specialty: 'A', hcpcs_code: 'X', year: 2023, avg_medicare_payment: 10, total_services: 20 };
  const wrongSpecialty = { ...current, provider_specialty: 'B', year: 2022, avg_medicare_payment: 1 };
  const wrongCode = { ...current, hcpcs_code: 'Y', year: 2022 };
  const missing = buildProcedureComparison([current, wrongSpecialty, wrongCode], 'A', 'X', 2023);
  assert.equal(missing.priorAvailable, false);
  assert.equal(missing.paymentChange, null);
  assert.equal(missing.volumeChange, null);
  assert.equal(buildProcedureComparison([current], 'A', 'X', 2022), null);
  assert.equal(buildProcedureComparison([current, current], 'A', 'X', 2023), null);
  const zero = buildProcedureComparison([current, { ...current, year: 2022, avg_medicare_payment: 0, total_services: 0 }], 'A', 'X', 2023);
  assert.equal(zero.paymentDelta, 10);
  assert.equal(zero.serviceDelta, 20);
  assert.equal(zero.paymentChange, null);
  assert.equal(zero.volumeChange, null);
  const absent = buildProcedureComparison([{ ...current, avg_medicare_payment: null }, { ...current, year: 2022 }], 'A', 'X', 2023);
  assert.equal(absent.paymentDelta, null);
  assert.equal(absent.paymentChange, null);
});

test('every public year comparison uses the immediately preceding matching procedure', () => {
  for (const row of source.mart) {
    const comparison = buildProcedureComparison(source.mart, row.provider_specialty, row.hcpcs_code, row.year);
    const previous = source.mart.find(item => item.provider_specialty === row.provider_specialty && item.hcpcs_code === row.hcpcs_code && item.year === row.year - 1);
    assert.equal(comparison.priorAvailable, Boolean(previous));
    if (previous) {
      assert.equal(comparison.priorPayment, previous.avg_medicare_payment);
      assert.equal(comparison.priorServices, previous.total_services);
      assert.ok(Math.abs(comparison.paymentChange - row.yoy_payment_change_pct) < 0.000051);
      assert.ok(Math.abs(comparison.volumeChange - row.yoy_volume_change_pct) < 0.000051);
    } else assert.equal(comparison.paymentChange, null);
  }
});

test('comparison URLs round-trip specialty, procedure and year, including reserved characters', () => {
  const url = new URL(comparisonUrl('A & B / C', 'G0008', 2022));
  const parsed = readReviewLocation(url.search);
  assert.deepEqual(parsed, { tab: 'procedure', specialty: 'A & B / C', code: 'G0008', year: 2022 });
  assert.deepEqual(readReviewLocation(reviewSearch(parsed)), parsed);
  assert.equal(readReviewLocation('?view=unknown&year=2023x').tab, 'market');
  assert.equal(readReviewLocation('?year=2023x').year, null);
});

test('download preserves both years, edits, immutable artifact links, hashes and the exact live route', () => {
  const comparison = buildProcedureComparison(source.mart, 'Dermatology', '99213', 2023);
  const revision = '1234567890abcdef1234567890abcdef12345678';
  const references = evidenceReferences(comparison, revision);
  assert.equal(references.engine, source.pipeline.engine);
  assert.equal(references.executedAt, source.pipeline.executedAt);
  assert.ok(references.receipt.endsWith(source.pipeline.receiptPath));
  assert.ok(references.mart.includes(`/blob/${revision}/${source.pipeline?.martPath || "data/sample_mart_reimbursement_trends.csv"}`));
  assert.equal(references.sources.length, 2);
  assert.ok(references.sources.every(item => item.sha256.length === 64));
  assert.ok(references.calculation.endsWith('/data/payment_verification.json'));
  assert.equal(evidenceReferences({ ...comparison, code: '99214' }, revision).calculation, null);
  const row = source.mart.find(item => item.provider_specialty === 'Dermatology' && item.hcpcs_code === '99213' && item.year === 2023);
  let state = reviewReducer(initialReviewState, { type: 'add-procedure', specialty: 'Dermatology', procedure: row, mart: source.mart });
  state = reviewReducer(state, { type: 'edit', specialty: 'Dermatology', field: 'observation', value: 'A constructed comparison; account validation remains pending.' });
  const draft = getReviewDraft(state, 'Dermatology');
  const benchmarks = enrichBenchmarks(aggregateMart(source.mart));
  const pipeline = buildPipelineIntelligence(source.sfdc, benchmarks);
  const text = reviewHandoffText(buildReviewHandoff(benchmarks, pipeline, 'Dermatology'), draft);
  for (const expected of ['CY2022 $108.05 / 3,626 services', 'CY2023 $104.91 / 3,777 services', 'Payment change: −$3.14 (−2.9%)', 'Service change: +151 (+4.2%)', 'generated comparison scenarios', 'Snapshot SHA-256:', 'run receipt', 'Reopen live comparison', draft.observation]) assert.ok(text.includes(expected), expected);
  const parsed = readReviewLocation(new URL(draft.evidence[0].references.reopen).search);
  assert.equal(parsed.specialty, 'Dermatology');
  assert.equal(parsed.code, '99213');
  assert.equal(parsed.year, 2023);
});
