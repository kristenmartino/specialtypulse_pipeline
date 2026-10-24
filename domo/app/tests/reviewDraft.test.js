const test = require('node:test');
const assert = require('node:assert/strict');
const { initialReviewState, reviewReducer, getReviewDraft, draftCompleteness } = require('../src/data/reviewDraft');
const { buildReviewHandoff, reviewHandoffText } = require('../src/data/reviewFacts');

const dermatology = { provider_specialty: 'Dermatology', year: 2023, hcpcs_code: '99213', hcpcs_description: 'Office visit, est patient', avg_medicare_payment: 104.91, total_services: 3777 };
const orthopedic = { ...dermatology, provider_specialty: 'Orthopedic Surgery', hcpcs_code: '27130', hcpcs_description: 'Total hip replacement', avg_medicare_payment: 213.47, total_services: 3117 };
const benchmarks = [
  { provider_specialty: 'Dermatology', year: 2023, pressure_index: 66.6, avg_yoy_payment_change: -0.029 },
  { provider_specialty: 'Orthopedic Surgery', year: 2023, pressure_index: 70.1, avg_yoy_payment_change: -0.039 },
];

test('changing investigation context keeps the brief on the same specialty without mixing drafts', () => {
  let state = reviewReducer(initialReviewState, { type: 'add-procedure', specialty: 'Orthopedic Surgery', procedure: orthopedic });
  state = reviewReducer(state, { type: 'edit', specialty: state.specialty, field: 'observation', value: 'Orthopedic observation' });
  state = reviewReducer(state, { type: 'select', specialty: 'Dermatology' });
  const review = buildReviewHandoff(benchmarks, [], state.specialty);
  assert.equal(review.specialty, 'Dermatology');
  assert.equal(getReviewDraft(state, state.specialty).observation, '');
  assert.deepEqual(getReviewDraft(state, state.specialty).evidence, []);
  state = reviewReducer(state, { type: 'add-procedure', specialty: 'Dermatology', procedure: dermatology });
  const exported = reviewHandoffText(review, getReviewDraft(state, state.specialty));
  assert.ok(exported.includes('Dermatology / HCPCS 99213 / CY2023'));
  assert.ok(!exported.includes('Orthopedic observation'));
  assert.ok(!exported.includes('27130'));
  state = reviewReducer(state, { type: 'select', specialty: 'Orthopedic Surgery' });
  assert.equal(getReviewDraft(state, state.specialty).observation, 'Orthopedic observation');
  assert.equal(getReviewDraft(state, state.specialty).evidence[0].code, '27130');
  assert.deepEqual(initialReviewState, { specialty: '', drafts: {} });
});

test('procedure evidence deduplicates, can be removed and rejects a different specialty', () => {
  let state = reviewReducer(initialReviewState, { type: 'add-procedure', specialty: 'Dermatology', procedure: dermatology });
  const before = JSON.stringify(state);
  state = reviewReducer(state, { type: 'add-procedure', specialty: 'Dermatology', procedure: { ...dermatology, avg_medicare_payment: 105 } });
  assert.equal(getReviewDraft(state, 'Dermatology').evidence.length, 1);
  assert.equal(getReviewDraft(state, 'Dermatology').evidence[0].payment, 105);
  assert.equal(JSON.parse(before).drafts.Dermatology.evidence[0].payment, 104.91);
  assert.equal(reviewReducer(state, { type: 'add-procedure', specialty: 'Dermatology', procedure: orthopedic }), state);
  state = reviewReducer(state, { type: 'remove-procedure', specialty: 'Dermatology', id: '2023-99213' });
  assert.equal(getReviewDraft(state, 'Dermatology').evidence.length, 0);
});

test('the download carries edited findings and evidence while retaining missing-field and validation disclosures', () => {
  let state = reviewReducer(initialReviewState, { type: 'add-procedure', specialty: 'Dermatology', procedure: dermatology });
  for (const [field, value] of Object.entries({ observation: 'Payment is weighted by services; this scenario cannot establish account need.', question: 'Does service mix explain the comparison?', reviewer: 'Specialty analyst', nextCheck: 'Trace HCPCS 99213 to its source records.' })) {
    state = reviewReducer(state, { type: 'edit', specialty: 'Dermatology', field, value });
  }
  const draft = getReviewDraft(state, 'Dermatology');
  assert.equal(draftCompleteness(draft).count, 4);
  const text = reviewHandoffText(buildReviewHandoff(benchmarks, [], state.specialty), draft);
  for (const value of ['$104.91', '3,777 services', draft.observation, draft.question, draft.reviewer, draft.nextCheck, 'Analyst draft — unverified', 'source and account validation pending', 'No stakeholder review, account validation, approved shortlist or business outcome is recorded.']) assert.ok(text.includes(value), value);
  const blank = reviewReducer(state, { type: 'edit', specialty: 'Dermatology', field: 'question', value: '  ' });
  assert.equal(draftCompleteness(getReviewDraft(blank, 'Dermatology')).count, 3);
  assert.ok(reviewHandoffText(buildReviewHandoff(benchmarks, [], 'Dermatology'), getReviewDraft(blank, 'Dermatology')).includes('Open question: Not entered.'));
});

test('a missing procedure payment stays unavailable rather than becoming zero', () => {
  const state = reviewReducer(initialReviewState, { type: 'add-procedure', specialty: 'Dermatology', procedure: { ...dermatology, avg_medicare_payment: null, total_services: '' } });
  const text = reviewHandoffText(buildReviewHandoff(benchmarks, [], 'Dermatology'), getReviewDraft(state, 'Dermatology'));
  assert.ok(text.includes('payment per service unavailable; unavailable services'));
  assert.ok(!text.includes('$0.00'));
});
