const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBriefFacts, topProcedures, largestDeviation, verificationState } = require('../src/data/reportingFacts');
const { aggregateMart, enrichBenchmarks, buildPipelineIntelligence } = require('../src/data/pressureIndex');
const source = require('../src/data/sourceData.json');
const benchmarks = enrichBenchmarks(aggregateMart(source.mart));
const pipeline = buildPipelineIntelligence(source.sfdc, benchmarks);
const facts = buildBriefFacts(benchmarks, source.mart, pipeline);

test('Dashboard summary reconciles active pipeline by specialty', () => {
  const derm = facts.specialties.find(r => r.name === 'Dermatology');
  assert.equal(derm.amount, 4579800);
  assert.ok(derm.deals > 0 && derm.share > 0);
  assert.equal(facts.total, facts.specialties.reduce((s, r) => s + r.amount, 0));
  assert.ok(Math.abs(facts.specialties.reduce((s,r) => s + r.share,0) - 1) < 1e-10);
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

test('review links lead to the specialty behind each observation', () => {
  const cutLink = facts.focuses.find(f => f.id === 'review-payment');
  assert.equal(cutLink.target, 'procedure');
  assert.equal(cutLink.specialty, facts.cut.provider_specialty);
  const outlierLink = facts.focuses.find(f => f.id === 'review-deviation');
  assert.equal(outlierLink.target, 'procedure');
  assert.equal(outlierLink.specialty, 'General Surgery');
});

test('procedure ranking uses service volume, latest year and selected specialty', () => {
  const rows = [
    { year: 2022, provider_specialty: 'Dermatology', hcpcs_code: 'old', total_services: 9999 },
    { year: 2023, provider_specialty: 'Dermatology', hcpcs_code: 'b', total_services: 50 },
    { year: 2023, provider_specialty: 'Dermatology', hcpcs_code: 'a', total_services: 50 },
    { year: 2023, provider_specialty: 'Dermatology', hcpcs_code: 'c', total_services: 100 },
    { year: 2023, provider_specialty: 'Urology', hcpcs_code: 'other', total_services: 1000 },
    { year: 2023, provider_specialty: 'Dermatology', hcpcs_code: 'invalid', total_services: null },
  ];
  const before = JSON.stringify(rows);
  assert.deepEqual(topProcedures(rows, 'Dermatology', 2).map(r => r.hcpcs_code), ['c', 'a']);
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(topProcedures(rows, 'missing'), []);
  assert.deepEqual(topProcedures([], 'Dermatology'), []);
  assert.deepEqual(topProcedures(rows, 'Dermatology', 0), []);
  const derm = topProcedures(source.mart, 'Dermatology');
  assert.equal(derm[0].hcpcs_code, '11300');
  assert.equal(derm[0].total_services, 5767);
  const reconciled = derm.find(row => row.hcpcs_code === '99213');
  assert.equal(reconciled.avg_medicare_payment, 104.91);
  assert.equal(reconciled.total_services, 3777);
  assert.ok(derm.every(r => r.provider_specialty === 'Dermatology' && r.year === 2023));
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

test('policy totals follow config groups, including shared executive assignments', () => {
  const { policyGroupCount } = require('../src/data/reportingFacts');
  const fs = require('fs');
  const vm = require('vm');
  const code = fs.readFileSync(require.resolve('../src/data/mockData.js'), 'utf8').replace('export const MOCK_DATA', 'const MOCK_DATA');
  const sandbox = {};
  vm.runInNewContext(code + '\nthis.data = MOCK_DATA;', sandbox);
  const config = sandbox.data.pdp_config;
  assert.equal(config.length, 13);
  assert.equal(policyGroupCount(config), 12);
  assert.equal(policyGroupCount(config.filter(row => row.filter_dimension !== 'provider_state')), 7);
  assert.equal(policyGroupCount([...config, { ...config[1], email: 'another-executive@example.com' }]), 12);
  assert.equal(policyGroupCount([...config, { ...config[3], filter_values: 'Urology' }]), 13);
  assert.equal(policyGroupCount([]), 0);
});
