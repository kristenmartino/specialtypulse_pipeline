const test = require('node:test');
const assert = require('node:assert/strict');
const { salesReviewCsv, salesReviewAppendix } = require('../src/data/salesPacket');
const { buildPipelineReview } = require('../src/data/pipelineReview');
const { buildReviewHandoff, reviewHandoffText } = require('../src/data/reviewFacts');
const { aggregateMart, enrichBenchmarks, buildPipelineIntelligence } = require('../src/data/pressureIndex');
const source = require('../src/data/sourceData.json');
const snapshot = '2026-08-31';
const parse = csv => csv.trim().split('\r\n').map(line => Array.from(line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g), match => match[1].replace(/""/g, '"')));

test('recipient packets reconcile every overdue opportunity and owner across supplied specialties', () => {
  const benchmarks = enrichBenchmarks(aggregateMart(source.mart));
  const pipeline = buildPipelineIntelligence(source.sfdc, benchmarks);
  for (const specialty of [...new Set(source.sfdc.map(row => row.account_specialty))]) {
    const review = buildReviewHandoff(benchmarks, pipeline, specialty);
    const [headers, ...data] = parse(salesReviewCsv(review.salesReview, 'fixed-revision'));
    const records = data.map(row => Object.fromEntries(headers.map((key, i) => [key, row[i]])));
    const open = source.sfdc.filter(row => row.account_specialty === specialty && !['Closed Won', 'Closed Lost'].includes(row.stage));
    const expected = open.filter(row => row.close_date < snapshot);
    assert.equal(records.length, expected.length);
    assert.equal(new Set(records.map(row => row.opportunity_id)).size, expected.length);
    assert.equal(records.reduce((total, row) => total + Math.round(Number(row.assumed_acv_usd) * 100), 0), expected.reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0));
    const brief = reviewHandoffText(review);
    for (const row of records) {
      const raw = expected.find(record => record.opportunity_id === row.opportunity_id);
      assert.ok(raw);
      for (const key of ['account_name', 'account_specialty', 'owner', 'region', 'stage', 'close_date']) assert.equal(row[key], raw[key]);
      assert.equal(Number(row.assumed_acv_usd), Number(raw.amount));
      assert.equal(Number(row.days_overdue), (Date.parse(snapshot) - Date.parse(raw.close_date)) / 86400000);
      assert.equal(row.source_revision, 'fixed-revision');
      assert.equal(row.scenario_snapshot_date, snapshot);
      assert.equal(row.data_status, 'synthetic');
      assert.ok(brief.includes(row.opportunity_id));
    }
    for (const owner of review.salesReview.owners.filter(row => row.deals)) {
      const owned = open.filter(row => row.owner === owner.owner);
      assert.equal(owner.deals, owned.length);
      assert.equal(Math.round(owner.totalAmount * 100), owned.reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0));
      assert.ok(brief.includes(`| ${owner.owner} | ${owner.region} | ${owner.deals} |`));
    }
  }
});

test('CSV excludes closed, future, same-day, invalid and other-specialty rows and escapes cells', () => {
  const base = { account_specialty: 'A', opportunity_id: '006001', account_name: 'Practice, "A"', owner: 'Owner', region: 'East', stage: 'Discovery', amount: 12.34, close_date: '2026-08-30' };
  const rows = [base, { ...base, opportunity_id: 'closed', stage: 'Closed Won' }, { ...base, opportunity_id: 'future', close_date: '2026-09-01' },
    { ...base, opportunity_id: 'today', close_date: snapshot }, { ...base, opportunity_id: 'invalid', close_date: '2026-02-30' }, { ...base, opportunity_id: 'other', account_specialty: 'B' }];
  const review = buildPipelineReview(rows, 'A', snapshot);
  const output = salesReviewCsv(review);
  const [headers, record] = parse(output);
  assert.equal(parse(output).length, 2);
  assert.equal(record[headers.indexOf('opportunity_id')], '006001');
  assert.equal(record[headers.indexOf('account_name')], base.account_name);
  assert.equal(record[headers.indexOf('assumed_acv_usd')], '12.34');
  assert.equal(record[headers.indexOf('days_overdue')], '1');
});

test('packets preserve unavailable coverage separately from supplied zero overdue records', () => {
  const absent = buildPipelineReview([], 'A', snapshot);
  assert.equal(salesReviewCsv(absent), '');
  const absentText = salesReviewAppendix({ ...absent, specialty: 'A' }).join('\n');
  assert.match(absentText, /Sales amounts, deal counts and pipeline share are unavailable/);
  assert.ok(!absentText.includes('No overdue open opportunities'));
  const closed = buildPipelineReview([{ account_specialty: 'A', stage: 'Closed Won', amount: 20, owner: 'Owner' }], 'A', snapshot);
  assert.equal(parse(salesReviewCsv(closed)).length, 1);
  assert.match(salesReviewAppendix({ ...closed, specialty: 'A' }).join('\n'), /No overdue open opportunities in the supplied specialty records/);
});
