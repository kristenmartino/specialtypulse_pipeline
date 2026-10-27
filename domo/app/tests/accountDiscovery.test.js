const test = require('node:test');
const assert = require('node:assert/strict');
const { discovery, discoveryText } = require('../src/data/accountDiscovery');
const { salesScenarioDate } = require('../src/data/salesContext');
const { reviewReducer, initialReviewState, getReviewDraft, draftCompleteness } = require('../src/data/reviewDraft');
const { buildReviewHandoff, reviewHandoffText } = require('../src/data/reviewFacts');

const benchmarks = ['Dermatology', 'Orthopedic Surgery'].map(provider_specialty => ({ provider_specialty, year: 2023, pressure_index: 66.6, avg_yoy_payment_change: -0.029 }));
const edit = (state, specialty, value) => reviewReducer(state, { type: 'edit', field: 'accountDiscoveryId', specialty, value });

test('discovery records share the sales snapshot and contain only prior, separately identified fictional sources', () => {
  assert.equal(discovery.scenarioDate, salesScenarioDate);
  assert.equal(discovery.examples.length, 2);
  const sourceIds = new Set();
  for (const example of discovery.examples) {
    assert.equal(example.specialty, 'Dermatology');
    assert.ok(example.discoveryDate <= salesScenarioDate);
    for (const source of example.sources) {
      assert.ok(source.date <= example.discoveryDate);
      assert.ok(!sourceIds.has(source.id));
      sourceIds.add(source.id);
    }
  }
});

test('including an account example preserves analyst notes and does not complete unfilled analyst work', () => {
  let state = reviewReducer(initialReviewState, { type: 'edit', specialty: 'Dermatology', field: 'observation', value: 'My independent observation' });
  const before = draftCompleteness(getReviewDraft(state, 'Dermatology')).count;
  state = edit(state, 'Dermatology', discovery.examples[0].id);
  assert.equal(getReviewDraft(state, 'Dermatology').observation, 'My independent observation');
  assert.equal(draftCompleteness(getReviewDraft(state, 'Dermatology')).count, before);
  state = reviewReducer(state, { type: 'select', specialty: 'Orthopedic Surgery' });
  assert.equal(getReviewDraft(state, 'Orthopedic Surgery').accountDiscoveryId, undefined);
  const unchanged = edit(state, 'Orthopedic Surgery', discovery.examples[0].id);
  assert.equal(unchanged, state);
  assert.equal(edit(state, 'Dermatology', 'unknown-example'), state);
});

test('downloads carry only the selected account, invented sources, decision limits and provenance', () => {
  let state = edit(initialReviewState, 'Dermatology', discovery.examples[0].id);
  const review = buildReviewHandoff(benchmarks, [], 'Dermatology');
  const a = reviewHandoffText(review, getReviewDraft(state, 'Dermatology'));
  for (const text of ['Practice A · Dermatology', 'A-NOTES-0324', 'A-LOG-0320', 'software fit remains pending', 'not customer research', 'not linked to the 500 sales opportunities', '300 staff minutes', '2026-03-31', '/domo/app/src/data/accountDiscovery.json']) assert.ok(a.includes(text), text);
  assert.ok(!a.includes('B-NOTES-0326'));
  state = edit(state, 'Dermatology', discovery.examples[1].id);
  const b = reviewHandoffText(review, getReviewDraft(state, 'Dermatology'));
  for (const text of ['Practice B · Dermatology', 'B-NOTES-0326', '45 staff minutes', 'no software recommendation', 'not an improvement over Practice A']) assert.ok(b.includes(text), text);
  assert.ok(!b.includes('A-NOTES-0324'));
  state = edit(state, 'Dermatology', '');
  assert.ok(!reviewHandoffText(review, getReviewDraft(state, 'Dermatology')).includes('## Selected fictional account-discovery example'));
});

test('export rejects account context for a different specialty even when a draft is malformed', () => {
  assert.deepEqual(discoveryText('Orthopedic Surgery', discovery.examples[0].id), []);
  const draft = { ...getReviewDraft(initialReviewState, 'Orthopedic Surgery'), accountDiscoveryId: discovery.examples[0].id };
  assert.ok(!reviewHandoffText(buildReviewHandoff(benchmarks, [], 'Orthopedic Surgery'), draft).includes('A-NOTES-0324'));
});
