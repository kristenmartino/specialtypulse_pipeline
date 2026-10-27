const test = require('node:test');
const assert = require('node:assert/strict');
const { readReviewLocation, reviewSearch } = require('../src/data/reviewLocation');

test('account examples round-trip as an open market workspace without selecting a fictional account', () => {
  const location = readReviewLocation('?view=market&specialty=Dermatology&section=accounts');
  assert.deepEqual(location, { tab: 'market', specialty: 'Dermatology', code: '', year: null, section: 'accounts' });
  assert.deepEqual(readReviewLocation(reviewSearch(location)), location);
  assert.ok(!reviewSearch(location).includes('practice-a'));
});

test('account section does not follow procedure navigation or unknown section values', () => {
  assert.equal(readReviewLocation('?view=procedure&specialty=Dermatology&section=accounts').section, undefined);
  assert.ok(!reviewSearch({ tab: 'procedure', specialty: 'Dermatology', section: 'accounts' }).includes('section='));
  assert.equal(readReviewLocation('?view=market&section=unknown').section, undefined);
  assert.ok(!reviewSearch({ tab: 'market', specialty: 'Dermatology' }).includes('section='));
});
