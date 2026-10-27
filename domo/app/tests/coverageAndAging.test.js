const test = require('node:test');
const assert = require('node:assert/strict');
const { salesCoverage, salesScenarioDate } = require('../src/data/salesContext');
const { buildPipelineReview } = require('../src/data/pipelineReview');
const { buildBriefFacts } = require('../src/data/reportingFacts');
const { buildReviewHandoff, reviewHandoffText } = require('../src/data/reviewFacts');
const { aggregateMart, enrichBenchmarks, buildPipelineIntelligence } = require('../src/data/pressureIndex');
const source = require('../src/data/sourceData.json');
const benchmarks = enrichBenchmarks(aggregateMart(source.mart));
const pipeline = buildPipelineIntelligence(source.sfdc, benchmarks);

test('absent Cardiology coverage stays unavailable in summary and brief, with its evidence links retained', () => {
  assert.deepEqual(salesCoverage(pipeline, 'Cardiology'), { recordCount: 0, hasRecords: false, specialtyCount: 9 });
  const row = buildBriefFacts(benchmarks, [], pipeline).specialties.find(r => r.name === 'Cardiology');
  assert.equal(row.amount, null);
  assert.equal(row.deals, null);
  assert.equal(row.share, null);
  const review = buildReviewHandoff(benchmarks, pipeline, 'Cardiology');
  const brief = reviewHandoffText(review);
  assert.match(brief, /No sales records supplied for Cardiology/);
  assert.match(brief, /Sales amounts, deal counts and pipeline share are unavailable/);
  assert.match(brief, /Confirm source coverage/);
  assert.match(brief, /\[Synthetic sales CSV snapshot\]/);
  assert.ok(!brief.includes('Synthetic open-stage pipeline: $0'));
  assert.ok(!brief.includes('0 of 0 open deals'));
  assert.equal(review.questions[0].owner, 'Specialty analyst');
  assert.match(brief.split('## Sales review appendix')[1], /No sales records supplied for Cardiology/);
});

test('supplied records with no open deals remain a known zero rather than missing coverage', () => {
  const benchmark = [{ provider_specialty: 'A', year: 2023, pressure_index: 40 }];
  const rows = [{ account_specialty: 'A', stage: 'Closed Won', amount: 1200, close_date: '2026-08-01', owner: 'Owner' }];
  const review = buildReviewHandoff(benchmark, rows, 'A');
  assert.equal(review.coverage.hasRecords, true);
  assert.equal(review.amount, 0);
  assert.equal(review.deals, 0);
  assert.match(reviewHandoffText(review), /Synthetic open-stage pipeline: \$0 across 0 deals/);
  const pipelineReview = buildPipelineReview(rows, 'A', salesScenarioDate);
  assert.equal(pipelineReview.wonAmount, 1200);
  assert.equal(pipelineReview.owners[0].oldestDaysOverdue, null);
  assert.equal(pipelineReview.owners[0].medianDaysOverdue, null);
});

test('owner ages use the selected specialty and eligible open dates, including even-cohort medians', () => {
  const base = { account_specialty: 'A', owner: 'Owner', stage: 'Discovery', amount: 10 };
  const rows = [
    { ...base, close_date: '2026-03-01' }, // eight days
    { ...base, close_date: '2026-03-08' }, // one day, across daylight-saving boundary
    { ...base, close_date: '2026-03-09' }, // same day
    { ...base, close_date: '2026-03-10' }, // future
    { ...base, close_date: '2026-02-30' }, // invalid
    { ...base, close_date: '', owner: 'Missing date' },
    { ...base, close_date: '2026-01-01', stage: 'Closed Won' },
    { ...base, close_date: '2026-01-01', stage: 'Closed Lost' },
    { ...base, close_date: '2026-01-01', account_specialty: 'B' },
  ];
  const before = JSON.stringify(rows);
  const review = buildPipelineReview(rows, 'A', '2026-03-09');
  const owner = review.owners.find(row => row.owner === 'Owner');
  assert.equal(owner.deals, 5);
  assert.equal(owner.totalAmount, 50);
  assert.equal(owner.oldestDaysOverdue, 8);
  assert.equal(owner.medianDaysOverdue, 4.5);
  assert.equal(review.owners.find(row => row.owner === 'Missing date').oldestDaysOverdue, null);
  assert.equal(review.owners.find(row => row.owner === 'Missing date').medianDaysOverdue, null);
  assert.equal(JSON.stringify(rows), before);
});

test('all five Dermatology owner cohorts reconcile to their opportunity dates and amounts', () => {
  const review = buildPipelineReview(pipeline, 'Dermatology', salesScenarioDate);
  assert.equal(review.owners.length, 5);
  assert.equal(review.owners.reduce((sum, row) => sum + row.deals, 0), 53);
  assert.equal(review.owners.reduce((sum, row) => sum + row.totalAmount, 0), 4579800);
  const expectedOldest = { 'Alex Morrison': 106, 'David Kim': 135, 'Jennifer Ruiz': 97, 'Marcus Williams': 138, 'Sarah Chen': 111 };
  for (const owner of review.owners) assert.equal(owner.oldestDaysOverdue, expectedOldest[owner.owner]);
  assert.equal(review.owners.find(row => row.owner === 'Alex Morrison').medianDaysOverdue, 79.5);
  assert.equal(review.owners.find(row => row.owner === 'David Kim').medianDaysOverdue, 30.5);
});
