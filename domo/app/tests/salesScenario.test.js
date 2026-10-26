const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { resolve } = require('node:path');
const { validateSalesScenario } = require('../src/data/salesScenario');
const source = require('../src/data/sourceData.json');

test('all 500 source rows satisfy the March scenario and its exact fixture hash', () => {
  assert.equal(source.salesScenario.scenario_date, '2026-03-31');
  assert.equal(source.salesScenario.synthetic, true);
  assert.equal(source.sfdc.length, 500);
  validateSalesScenario(source.sfdc, source.salesScenario);
  const csv = readFileSync(resolve(__dirname, '../../../data/sample_sfdc_pipeline.csv'));
  assert.equal(createHash('sha256').update(csv).digest('hex'), source.salesScenario.fixture_sha256);
  assert.equal(source.salesScenario.adjustments.filter(row => row.before.close_date !== row.after.close_date).length, 12);
  assert.equal(source.salesScenario.historical_ai_study.scenario_date, '2026-08-31');
  assert.equal(source.salesScenario.historical_ai_study.source_revision, 'd628a13592a5d0f5cc0ca93f6cce5f0c265258ca');
});

test('scenario guard rejects future creation, future closure, impossible stage ages and duplicate IDs', () => {
  const scenario = { scenario_date: '2026-03-31', synthetic: true };
  const base = { opportunity_id: 'A', stage: 'Discovery', created_date: '2026-03-01', close_date: '2026-04-10', days_in_stage: 10 };
  validateSalesScenario([base], scenario); // upcoming expected close dates are valid
  validateSalesScenario([{ ...base, close_date: '2026-03-15' }], scenario); // overdue open dates stay open
  assert.throws(() => validateSalesScenario([{ ...base, created_date: '2026-04-01' }], scenario), /created date/);
  assert.throws(() => validateSalesScenario([{ ...base, stage: 'Closed Won' }], scenario), /future actual close/);
  assert.throws(() => validateSalesScenario([{ ...base, close_date: '2026-02-28' }], scenario), /before creation/);
  assert.throws(() => validateSalesScenario([{ ...base, days_in_stage: 31 }], scenario), /stage age/);
  assert.throws(() => validateSalesScenario([{ ...base, stage: 'Closed Lost', close_date: '2026-03-20', days_in_stage: 10 }], scenario), /closed-stage age/);
  validateSalesScenario([{ ...base, stage: 'Closed Lost', close_date: '2026-03-20', days_in_stage: 11 }], scenario);
  assert.throws(() => validateSalesScenario([base, base], scenario), /duplicate opportunity/);
  assert.throws(() => validateSalesScenario([base], { ...scenario, scenario_date: '2026-02-30' }), /dated synthetic/);
});
