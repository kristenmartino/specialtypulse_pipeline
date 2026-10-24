const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateMart, enrichBenchmarks } = require('../src/data/pressureIndex');

test('specialty scoring uses upstream distinct providers, including overlapping procedures', () => {
  // Provider A bills X and Y; provider B bills only Y. Procedure counts are 1+2,
  // while the upstream specialty/year distinct count is 2, repeated on both rows.
  const rows = [
    { hcpcs_code: 'X', total_providers: 1 },
    { hcpcs_code: 'Y', total_providers: 2 },
  ].map(row => ({ ...row, provider_specialty: 'Example', year: 2023,
    specialty_total_providers: 2, total_services: 20,
    avg_medicare_payment: 100, avg_submitted_charge: 200, payment_to_charge_ratio: .5 }));
  rows.push({ ...rows[0], provider_specialty: 'Other', specialty_total_providers: 4, total_providers: 4 });
  const base = aggregateMart(rows);
  assert.equal(base.find(row => row.provider_specialty === 'Example').total_providers, 2);
  const scored = enrichBenchmarks(base).find(row => row.provider_specialty === 'Example');
  assert.equal(scored.market_size_score, 50);
  assert.throws(() => aggregateMart([{ ...rows[0], specialty_total_providers: undefined }]), /distinct provider count/);
  assert.throws(() => aggregateMart([rows[0], { ...rows[1], specialty_total_providers: 3 }]), /distinct provider count/);
});
