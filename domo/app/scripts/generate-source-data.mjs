/**
 * generate-source-data.mjs
 * ---------------------------------------------------------------------------
 * Parses the pipeline's bundled CSV outputs (repo-root `data/`) into a JSON
 * module the dashboard imports. The standalone build then computes the
 * Reimbursement Pressure Index in the browser from this mart via the DataFlow
 * port in src/data/pressureIndex.js — i.e. the Index is computed by the real
 * scoring formula, not hard-coded.
 *
 * To refresh from a different mart export (e.g. a real multi-year CMS run),
 * drop the new CSV over data/sample_mart_reimbursement_trends.csv and run:
 *     npm run generate:data
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../../../data");
const outFile = resolve(here, "../src/data/sourceData.json");

// Minimal CSV parser: handles quoted fields containing commas and escaped
// quotes (""). Fields with embedded newlines are not expected in this data.
function splitLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else { cur += c; }
    } else if (c === '"') { inQ = true; }
    else if (c === ",") { out.push(cur); cur = ""; }
    else { cur += c; }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.length);
  const header = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] === undefined ? "" : cells[i]; });
    return row;
  });
}

const asNum = (v) => (v === "" || v == null ? null : Number(v));
function coerce(rows, numericCols) {
  return rows.map((r) => {
    const o = { ...r };
    for (const c of numericCols) if (c in o) o[c] = asNum(o[c]);
    return o;
  });
}

const MART_NUM = [
  "year", "total_services", "total_beneficiaries", "total_providers",
  "pct_facility_services", "avg_medicare_payment", "avg_submitted_charge",
  "avg_medicare_standardized_amount", "payment_to_charge_ratio",
  "prior_year_services", "yoy_volume_change_pct", "prior_year_avg_payment",
  "yoy_payment_change_pct", "specialty_avg_payment", "specialty_avg_ptcr",
  "payment_vs_specialty_pct",
];
const SFDC_NUM = ["account_providers", "win_probability", "amount", "days_in_stage"];

const mart = coerce(parseCsv(readFileSync(resolve(dataDir, "sample_mart_reimbursement_trends.csv"), "utf8")), MART_NUM);
const sfdc = coerce(parseCsv(readFileSync(resolve(dataDir, "sample_sfdc_pipeline.csv"), "utf8")), SFDC_NUM);

writeFileSync(outFile, JSON.stringify({ mart, sfdc }) + "\n");
console.log(`sourceData.json written: ${mart.length} mart rows, ${sfdc.length} pipeline rows`);
