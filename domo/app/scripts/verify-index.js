/**
 * verify-index.js — sanity-check the DataFlow port against the bundled mart,
 * without a browser. Run: node scripts/verify-index.js
 */
const path = require("path");
const { aggregateMart, enrichBenchmarks, buildPipelineIntelligence } = require(path.resolve(__dirname, "../src/data/pressureIndex.js"));
const source = require(path.resolve(__dirname, "../src/data/sourceData.json"));

const base = aggregateMart(source.mart);
const bench = enrichBenchmarks(base);
const pipe = buildPipelineIntelligence(source.sfdc, bench);

const years = [...new Set(bench.map((r) => r.year))].sort();
const specialties = new Set(bench.map((r) => r.provider_specialty));
console.log(`benchmark rows: ${bench.length} | specialties: ${specialties.size} | years: ${years.join(", ")}`);

const maxY = Math.max(...bench.map((r) => r.year));
const latest = bench.filter((r) => r.year === maxY).sort((a, b) => b.pressure_index - a.pressure_index);
console.log(`\nPressure Index ranking (CY${maxY}):`);
for (const r of latest) {
  console.log(`  ${String(r.pressure_index.toFixed(1)).padStart(5)}  ${r.pressure_tier.padEnd(22)} ${r.provider_specialty}  (ptcr ${r.avg_ptcr}, driver ${r.compression_driver})`);
}

const bad = bench.filter((r) => r.pressure_index == null || Number.isNaN(r.pressure_index) || r.pressure_index < 0 || r.pressure_index > 100);
const tierCounts = {};
latest.forEach((r) => { tierCounts[r.pressure_tier] = (tierCounts[r.pressure_tier] || 0) + 1; });
console.log(`\nindex out-of-range/NaN rows: ${bad.length}`);
console.log("tier distribution (CY" + maxY + "):", tierCounts);

const withMV = pipe.filter((r) => r.market_validated_amount != null);
console.log(`\npipeline rows: ${pipe.length} | joined to a benchmark: ${withMV.length}`);
const s = withMV[0];
if (s) console.log(`sample join: ${s.account_specialty} pi=${s.pressure_index} amount=${s.amount} validated=${s.market_validated_amount}`);
