const test = require('node:test');
const assert = require('node:assert/strict');
const { salesEvidenceText } = require('../src/data/salesContext');
const { buildReviewHandoff, reviewHandoffText } = require('../src/data/reviewFacts');
const { aggregateMart, enrichBenchmarks, buildPipelineIntelligence } = require('../src/data/pressureIndex');
const source = require('../src/data/sourceData.json');

test('sales evidence pins the CSV and definitions and states the actual reproduction filters', () => {
  const revision = '1234567890abcdef1234567890abcdef12345678';
  const output = salesEvidenceText('Hematology/Oncology', revision).join('\n');
  assert.ok(output.includes(`/blob/${revision}/data/sample_sfdc_pipeline.csv`));
  assert.ok(output.includes(`/blob/${revision}/docs/METRIC_CERTIFICATION_LOG.md`));
  assert.ok(!output.includes('/blob/main/'));
  assert.ok(output.includes('account_specialty = "Hematology/Oncology"'));
  assert.ok(output.includes('exclude stage = "Closed Won" and "Closed Lost"'));
  assert.ok(output.includes('valid close_date strictly before 2026-08-31'));
  assert.ok(output.includes('missing or invalid close dates are excluded'));
  assert.ok(output.includes('share denominator is the open-stage amount across all specialties'));
  assert.ok(output.includes('No created-date or close-date reporting-period filter'));
});

test('every specialty export includes its sales source independently of procedure selection', () => {
  const benchmarks = enrichBenchmarks(aggregateMart(source.mart));
  const pipeline = buildPipelineIntelligence(source.sfdc, benchmarks);
  const blank = { evidence: [], observation: '', question: '', reviewer: '', nextCheck: '' };
  for (const specialty of ['Dermatology', 'Orthopedic Surgery']) {
    const review = buildReviewHandoff(benchmarks, pipeline, specialty);
    for (const draft of [undefined, blank]) {
      const output = reviewHandoffText(review, draft);
      assert.ok(output.includes(salesEvidenceText(specialty).join('\n')));
      assert.equal((output.match(/\[Synthetic sales CSV snapshot\]/g) || []).length, 1);
      assert.ok(output.includes(`account_specialty = "${specialty}"`));
      assert.ok(output.includes('source and account validation pending'));
    }
  }
});
