const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBriefFacts, buildFocusPrompt, validateFocusSelection, largestDeviation, verificationState } = require('../src/data/reportingFacts');
const { aggregateMart, enrichBenchmarks, buildPipelineIntelligence } = require('../src/data/pressureIndex');
const source = require('../src/data/sourceData.json');
const benchmarks = enrichBenchmarks(aggregateMart(source.mart));
const pipeline = buildPipelineIntelligence(source.sfdc, benchmarks);
const facts = buildBriefFacts(benchmarks, source.mart, pipeline);

test('Dermatology pipeline is preserved in facts and AI input, not inferred absent from another leader', () => {
  const derm = facts.specialties.find(r => r.name === 'Dermatology');
  assert.equal(derm.amount, 4579800);
  assert.ok(derm.deals > 0 && derm.share > 0);
  assert.equal(facts.total, facts.specialties.reduce((s, r) => s + r.amount, 0));
  assert.ok(Math.abs(facts.specialties.reduce((s,r) => s + r.share,0) - 1) < 1e-10);
  const prompt = buildFocusPrompt(facts, true);
  assert.ok(prompt.includes('4579800'));
  assert.ok(prompt.includes('pipeline is synthetic'));
  assert.equal(facts.specialties.length, new Set([...benchmarks.filter(r => r.year === facts.year).map(r => r.provider_specialty), ...pipeline.filter(r => !['Closed Won','Closed Lost'].includes(r.stage)).map(r => r.account_specialty)]).size);
});

test('negative flagged deviations are below benchmark; largest is chosen by magnitude', () => {
  const rows = [{ is_payment_outlier: 'true', payment_vs_specialty_pct: -0.207 }, { is_payment_outlier: true, payment_vs_specialty_pct: 0.1 }, { is_payment_outlier: 'false', payment_vs_specialty_pct: 2 }];
  const original = JSON.stringify(rows);
  assert.equal(largestDeviation(rows).direction, 'below');
  assert.equal(largestDeviation(rows).magnitude, 0.207);
  assert.equal(JSON.stringify(rows), original);
  assert.equal(largestDeviation([rows[1]]).direction, 'above');
  assert.equal(largestDeviation([]), null);
  assert.equal(largestDeviation([{ is_payment_outlier: 'true', payment_vs_specialty_pct: null }]), null);
  assert.equal(facts.deviation.direction, 'below');
});

test('empty and no-decline datasets do not manufacture observations', () => {
  const empty = buildBriefFacts([], [], []);
  assert.equal(empty.year, null);
  assert.deepEqual(empty.evidence, []);
  assert.deepEqual(empty.focuses, []);
  const positive = buildBriefFacts([{ year: 2023, provider_specialty:'Dermatology', pressure_index:20, avg_yoy_payment_change:0.02 }], [], []);
  assert.equal(positive.cut, null);
  assert.equal(positive.specialties[0].share, null);
});

test('AI output can select a supported task but cannot introduce prose or unsupported evidence', () => {
  for (const focus of facts.focuses) {
    assert.equal(validateFocusSelection(JSON.stringify({ focus_id: focus.id, evidence_ids: focus.evidenceIds }), facts), focus);
  }
  for (const text of [
    'Dermatology has no pipeline.', '{', 'null',
    JSON.stringify({ focus_id: 'invented', evidence_ids: [] }),
    JSON.stringify({ focus_id: 'compare-coverage', evidence_ids: ['competition'] }),
    JSON.stringify({ focus_id: 'compare-coverage', evidence_ids: ['pressure'] }),
    JSON.stringify({ focus_id: 'compare-coverage', evidence_ids: ['pressure','pipeline'], prose: 'Sales team is too comfortable.' }),
  ]) assert.throws(() => validateFocusSelection(text, facts));
});

test('sample, absent and recorded verification remain distinct', () => {
  assert.equal(verificationState([{ passed: 'true', is_sample:true }], false), 'sample');
  assert.equal(verificationState([{ passed: 'true' }], true), 'sample');
  assert.equal(verificationState([], false), 'unknown');
  assert.equal(verificationState([{ passed: true }], false), 'pass');
  assert.equal(verificationState([{ passed: 'true' }, { passed:'false' }], false), 'fail');
});

test('score bands describe pressure and remain bounded', () => {
  assert.ok(benchmarks.length > 0);
  for (const row of benchmarks) {
    assert.ok(row.pressure_index >= 0 && row.pressure_index <= 100);
    assert.ok(['High pressure','Elevated pressure','Moderate pressure','Low pressure'].includes(row.pressure_tier));
  }
});


test('standalone governance examples load without generating timestamps', () => {
  const fs = require('fs');
  const vm = require('vm');
  const code = fs.readFileSync(require.resolve('../src/data/mockData.js'), 'utf8').replace('export const MOCK_DATA', 'const MOCK_DATA');
  const sandbox = {};
  vm.runInNewContext(code + '\nthis.data = MOCK_DATA;', sandbox);
  assert.ok(sandbox.data.pdp_verify_results.length > 0);
  for (const check of sandbox.data.pdp_verify_results) {
    assert.equal(check.run_at, null);
    assert.equal(check.is_sample, true);
  }
});
