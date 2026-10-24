const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReviewHandoff, reviewHandoffText } = require('../src/data/reviewFacts');
const { aggregateMart, enrichBenchmarks, buildPipelineIntelligence } = require('../src/data/pressureIndex');
const source = require('../src/data/sourceData.json');

test('sample handoff reconciles the selected scenario and active exposure', () => {
  const benchmarks = enrichBenchmarks(aggregateMart(source.mart));
  const pipeline = buildPipelineIntelligence(source.sfdc, benchmarks);
  const review = buildReviewHandoff(benchmarks, pipeline);
  assert.equal(review.specialty, 'Orthopedic Surgery');
  assert.equal(review.score, 70.1);
  assert.equal(review.amount, 6272200);
  assert.equal(review.deals, 47);
  assert.equal((review.share * 100).toFixed(1), '15.6');
  assert.equal((review.paymentChange * 100).toFixed(1), '-3.9');
  const text = reviewHandoffText(review);
  assert.ok(text.includes('$6,272,200 across 47 deals'));
  assert.ok(text.includes('source and account validation pending'));
  assert.ok(text.includes('No stakeholder review, account validation, approved shortlist or business outcome is recorded.'));
});

test('changing the handoff specialty changes its evidence without mixing closed deals', () => {
  const benchmarks = [
    { provider_specialty:'A', year:2022, pressure_index:90 },
    { provider_specialty:'A', year:2023, pressure_index:40, avg_yoy_payment_change:null },
    { provider_specialty:'B', year:2023, pressure_index:70, avg_yoy_payment_change:0.02 },
  ];
  const pipeline = [
    { account_specialty:'A', stage:'Discovery', amount:100 },
    { account_specialty:'A', stage:'Closed Won', amount:900 },
    { account_specialty:'B', stage:'Closed Lost', amount:500 },
  ];
  const before = JSON.stringify({benchmarks,pipeline});
  const review = buildReviewHandoff(benchmarks, pipeline, 'A');
  assert.equal(review.specialty,'A');
  assert.equal(review.year,2023);
  assert.equal(review.score,40);
  assert.equal(review.amount,100);
  assert.equal(review.deals,1);
  assert.equal(review.share,1);
  assert.equal(review.paymentChange,null);
  assert.ok(reviewHandoffText(review).includes('payment change: Unavailable'));
  assert.equal(buildReviewHandoff(benchmarks,pipeline).specialty,'B');
  assert.equal(JSON.stringify({benchmarks,pipeline}),before);
  assert.equal(buildReviewHandoff(benchmarks,pipeline,'missing'),null);
  assert.equal(buildReviewHandoff([],pipeline),null);
  assert.equal(reviewHandoffText(null),'');
});
