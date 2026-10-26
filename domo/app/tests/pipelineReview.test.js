const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPipelineReview } = require('../src/data/pipelineReview');
const { salesScenarioDate } = require('../src/data/salesContext');
const source = require('../src/data/sourceData.json');

test('Dermatology review list and totals reconcile to its brief rather than all specialties', () => {
  const original = JSON.stringify(source.sfdc);
  const review = buildPipelineReview(source.sfdc, 'Dermatology', salesScenarioDate);
  assert.equal(review.open.length, 53);
  assert.equal(review.hygiene.openAmount, 4579800);
  assert.equal(review.overdue.length, 25);
  assert.equal(review.overdue.reduce((sum, row) => sum + row.amount, 0), 2121500);
  assert.ok(review.overdue.every(row => row.account_specialty === 'Dermatology'));
  assert.equal(Math.min(...review.overdue.map(row => row.days_overdue)), 5);
  assert.equal(Math.max(...review.overdue.map(row => row.days_overdue)), 138);
  const ownerCounts = new Map();
  review.open.forEach(row => ownerCounts.set(row.owner, (ownerCounts.get(row.owner) || 0) + 1));
  assert.equal([...ownerCounts.values()].reduce((a, b) => a + b, 0), 53);
  assert.equal(JSON.stringify(source.sfdc), original);
});

test('changing specialty replaces the scope, and absent sales records remain empty', () => {
  const derm = buildPipelineReview(source.sfdc, 'Dermatology', salesScenarioDate);
  const ortho = buildPipelineReview(source.sfdc, 'Orthopedic Surgery', salesScenarioDate);
  assert.equal(ortho.open.length, 47);
  assert.ok(ortho.overdue.every(row => row.account_specialty === 'Orthopedic Surgery'));
  assert.ok(!ortho.overdue.some(row => derm.overdue.some(item => item.opportunity_id === row.opportunity_id)));
  const empty = buildPipelineReview(source.sfdc, 'Cardiology', salesScenarioDate);
  assert.equal(empty.open.length, 0);
  assert.equal(empty.hygiene.openAmount, 0);
  assert.equal(empty.overdue.length, 0);
});

test('review excludes closed, future, same-day and invalid-date rows without changing their source stages', () => {
  const base = { account_specialty: 'A', amount: '10.20', owner: 'Owner' };
  const rows = [
    { ...base, opportunity_id: 'overdue', stage: 'Discovery', close_date: '2026-03-08' },
    { ...base, opportunity_id: 'today', stage: 'Discovery', close_date: '2026-03-09' },
    { ...base, opportunity_id: 'future', stage: 'Discovery', close_date: '2026-03-10' },
    { ...base, opportunity_id: 'bad', stage: 'Discovery', close_date: '2026-02-30' },
    { ...base, opportunity_id: 'won', stage: 'Closed Won', close_date: '2026-01-01' },
    { ...base, opportunity_id: 'lost', stage: 'Closed Lost', close_date: '2026-01-01' },
    { ...base, opportunity_id: 'other', account_specialty: 'B', stage: 'Discovery', close_date: '2026-01-01' },
  ];
  const review = buildPipelineReview(rows, 'A', '2026-03-09');
  assert.deepEqual(review.overdue.map(row => [row.opportunity_id, row.days_overdue]), [['overdue', 1]]);
  assert.equal(review.hygiene.openAmount, 40.8);
  assert.equal(review.hygiene.overdueAmount, 10.2);
  assert.equal(review.wonAmount, 10.2);
  assert.equal(review.hygiene.unknownCloseDateCount, 1);
  assert.equal(rows[0].stage, 'Discovery');
});
