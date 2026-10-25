const test = require('node:test');
const assert = require('node:assert/strict');
const { pipelineHygiene, pipelineHygieneText, firstSalesCheck } = require('../src/data/pipelineHygiene');
const { salesScenarioDate } = require('../src/data/salesContext');
const { buildReviewHandoff, reviewHandoffText } = require('../src/data/reviewFacts');
const { aggregateMart, enrichBenchmarks, buildPipelineIntelligence } = require('../src/data/pressureIndex');
const source = require('../src/data/sourceData.json');

test('fixture overdue totals reconcile to the full open-stage balance at the scenario date', () => {
  const original = JSON.stringify(source.sfdc);
  const result = pipelineHygiene(source.sfdc, salesScenarioDate);
  assert.equal(result.openCount, 472);
  assert.equal(result.overdueCount, 472);
  assert.equal(result.openAmount, 40178200);
  assert.equal(result.overdueAmount, result.openAmount);
  assert.equal(result.overdueShare, 1);
  assert.equal(result.minDaysOverdue, 17);
  assert.equal(result.maxDaysOverdue, 324);
  assert.equal(result.unknownCloseDateCount, 0);
  assert.match(pipelineHygieneText(result), /\$40,178,200\.00/);
  assert.match(pipelineHygieneText(result), /100\.0% of open deals/);
  assert.equal(JSON.stringify(source.sfdc), original);
});

test('overdue means strictly before snapshot, excludes closed stages and separates invalid dates', () => {
  const rows = [
    { stage: 'Discovery', close_date: '2026-08-30', amount: '0.10' },
    { stage: 'Proposal Sent', close_date: '2026-08-30', amount: '0.20' },
    { stage: 'Discovery', close_date: '2026-08-31', amount: 20 },
    { stage: 'Discovery', close_date: '2026-09-01', amount: 30 },
    { stage: 'Closed Won', close_date: '2026-01-01', amount: 900 },
    { stage: 'Closed Lost', close_date: '2026-01-01', amount: 800 },
    { stage: 'Discovery', close_date: '', amount: 40 },
    { stage: 'Discovery', close_date: '2026-02-30', amount: 50 },
    { stage: 'Discovery', close_date: 'bad', amount: 60 },
  ];
  const result = pipelineHygiene(rows, '2026-08-31');
  assert.equal(result.openCount, 7);
  assert.equal(result.openAmount, 200.3);
  assert.equal(result.overdueCount, 2);
  assert.equal(result.overdueAmount, .3);
  assert.equal(result.unknownCloseDateCount, 3);
  assert.equal(result.minDaysOverdue, 1);
  assert.match(pipelineHygieneText(result), /3 open deals have missing or invalid close dates/);
  assert.equal(pipelineHygiene(rows, '2026-08-30').overdueCount, 0);
  assert.equal(pipelineHygiene([{ stage: 'Discovery', close_date: '2026-03-08', amount: 1 }], '2026-03-09').minDaysOverdue, 1);
  assert.throws(() => pipelineHygiene(rows, '2026-02-30'), /valid scenario snapshot/);
});

test('empty, zero and missing amounts preserve availability rather than inventing ACV', () => {
  const empty = pipelineHygiene([], salesScenarioDate);
  assert.equal(empty.overdueShare, null);
  assert.equal(empty.overdueAmount, 0);
  assert.equal(empty.minDaysOverdue, null);
  const row = { stage: 'Discovery', close_date: '2026-08-30', amount: 0 };
  assert.equal(pipelineHygiene([row], salesScenarioDate).overdueAmount, 0);
  const invalid = pipelineHygiene([{ ...row, amount: null }], salesScenarioDate);
  assert.equal(invalid.overdueCount, 1);
  assert.equal(invalid.overdueAmount, null);
  assert.match(pipelineHygieneText(invalid), /ACV unavailable/);
});

test('specialty brief carries its own overdue exposure and prioritizes stage and date review', () => {
  const benchmarks = enrichBenchmarks(aggregateMart(source.mart));
  const pipeline = buildPipelineIntelligence(source.sfdc, benchmarks);
  const review = buildReviewHandoff(benchmarks, pipeline, 'Dermatology');
  assert.equal(review.hygiene.overdueCount, 53);
  assert.equal(review.hygiene.overdueAmount, 4579800);
  assert.equal(review.questions[0].owner, 'Sales operations lead');
  assert.equal(review.questions[0].next, firstSalesCheck);
  const output = reviewHandoffText(review, { evidence: [], observation: '', question: '', reviewer: '', nextCheck: '' });
  assert.match(output, /53 of 53 open deals/);
  assert.match(output, /\$4,579,800\.00/);
  assert.ok(output.includes(firstSalesCheck));
  assert.ok(output.indexOf('First sales follow-up') < output.indexOf('## Analyst draft')); 
});
