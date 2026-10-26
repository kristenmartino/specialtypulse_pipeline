const test = require('node:test');
const assert = require('node:assert/strict');
const { fixtureDateScope, amountBasis, salesDateScope } = require('../src/data/salesContext');
const { buildReviewHandoff, reviewHandoffText } = require('../src/data/reviewFacts');
const { aggregateMart, enrichBenchmarks, buildPipelineIntelligence } = require('../src/data/pressureIndex');
const source = require('../src/data/sourceData.json');

test('sales date scope covers the full fixture, including closed stages, with a clearly identified invented scenario date', () => {
  assert.match(salesDateScope, /500 opportunities/);
  assert.match(salesDateScope, /2025-09-02–2026-02-24/);
  assert.match(salesDateScope, /2025-10-11–2026-08-14/);
  assert.match(salesDateScope, /Scenario snapshot: 2026-03-31, an invented demo assumption/);
  assert.match(salesDateScope, /not captured or reconstructed CRM history/);
  assert.match(fixtureDateScope([]), /0 opportunities; created dates not recorded; close dates not recorded/);
  assert.match(amountBasis, /Demo assumption.*annual contract value.*USD/);
  const benchmarks = enrichBenchmarks(aggregateMart(source.mart));
  const pipeline = buildPipelineIntelligence(source.sfdc, benchmarks);
  const output = reviewHandoffText(buildReviewHandoff(benchmarks, pipeline));
  assert.ok(output.includes(amountBasis));
  assert.ok(output.includes(salesDateScope));
  assert.match(output, /healthcare-software sales team/);
});
