/**
 * generate-source-data.mjs
 * ---------------------------------------------------------------------------
 * Parses the pipeline's bundled CSV outputs (repo-root `data/`) into a JSON
 * module the dashboard imports. The standalone build then computes the
 * Reimbursement Pressure Index in the browser from this mart via the DataFlow
 * port in src/data/pressureIndex.js — i.e. the Index is computed by the real
 * scoring formula, not hard-coded.
 *
 * Airflow selects verified cloud exports with data/dashboard_release.json.
 * The build rejects exports that differ from the pinned synthetic business values.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
  "year", "total_services", "total_beneficiaries", "total_providers", "specialty_total_providers",
  "pct_facility_services", "avg_medicare_payment", "avg_submitted_charge",
  "avg_medicare_standardized_amount", "payment_to_charge_ratio",
  "prior_year_services", "yoy_volume_change_pct", "prior_year_avg_payment",
  "yoy_payment_change_pct", "specialty_avg_payment", "specialty_avg_ptcr",
  "payment_vs_specialty_pct",
];
const SFDC_NUM = ["account_providers", "win_probability", "amount", "days_in_stage"];

const baselineCsv = readFileSync(resolve(dataDir, "sample_mart_reimbursement_trends.csv"), "utf8");
const releasePath = resolve(dataDir, "dashboard_release.json");
const release = existsSync(releasePath) ? JSON.parse(readFileSync(releasePath, "utf8")) : null;
const safeDataPath = relative => {
  const path = resolve(dataDir, relative);
  if (!path.startsWith(dataDir + "/")) throw new Error("Export path leaves the data directory");
  return path;
};
const selectedCsv = release ? readFileSync(safeDataPath(release.mart), "utf8") : baselineCsv;
const mart = coerce(parseCsv(selectedCsv), MART_NUM);
const selectedReceipt = release ? JSON.parse(readFileSync(safeDataPath(release.receipt), "utf8")) : null;
if (release) {
  const sha = createHash("sha256").update(selectedCsv).digest("hex");
  if (selectedReceipt.status !== "verified" || sha !== release.export_sha256 || sha !== selectedReceipt.export_sha256 ||
      String(selectedReceipt.run_key) !== String(release.run_id) || selectedReceipt.source_revision !== release.source_revision ||
      mart.length !== release.rows || mart.length !== selectedReceipt.mart_rows) throw new Error("Invalid Databricks export receipt");
  const baseline = coerce(parseCsv(baselineCsv), MART_NUM);
  const canonical = rows => rows.map(row => {
    const copy = { ...row }; delete copy.mart_built_at;
    copy.is_payment_outlier = String(copy.is_payment_outlier).toLowerCase();
    return copy;
  }).sort((a,b) => a.surrogate_key.localeCompare(b.surrogate_key));
  if (JSON.stringify(canonical(mart)) !== JSON.stringify(canonical(baseline))) throw new Error("Cloud export differs from reconciled business values");
}
const sfdc = coerce(parseCsv(readFileSync(resolve(dataDir, "sample_sfdc_pipeline.csv"), "utf8")), SFDC_NUM);

const pipeline = release ? {
  engine: release.engine, executedAt: release.executed_at, martPath: 'data/' + release.mart,
  receiptPath: 'data/' + release.receipt, martSha256: release.export_sha256, runId: release.run_id,
} : null;
writeFileSync(outFile, JSON.stringify({ mart, sfdc, pipeline }) + "\n");
console.log(`sourceData.json written: ${mart.length} mart rows, ${sfdc.length} pipeline rows`);

// Build only from the mart exported by the recorded shared Spark execution.
const receipt = JSON.parse(readFileSync(resolve(dataDir, "pipeline_run.json"), "utf8"));
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const repoDir = resolve(dataDir, "..");
for (const [path, expected] of Object.entries({ ...receipt.source_sha256, ...receipt.code_sha256 })) {
  if (sha256(resolve(repoDir, path)) !== expected) throw new Error(`Pipeline input/code changed: ${path}. Re-run the Spark pipeline.`);
}
if (sha256(resolve(dataDir, "sample_mart_reimbursement_trends.csv")) !== receipt.mart_csv_sha256) throw new Error("Mart differs from recorded Spark output");
const rawFile = resolve(dataDir, "sample_2023_puf_10k.csv");
const inputs = parseCsv(readFileSync(rawFile, "utf8")).map((row, index) => ({ row, csv_row: index + 2 }))
  .filter(({ row }) => row.provider_type === "Dermatology" && row.hcpcs_cd === "99213" && Number(row.tot_srvcs) >= 11)
  .map(({ row, csv_row }) => ({ csv_row, total_services: Number(row.tot_srvcs), avg_medicare_payment_cents: Math.round(Number(row.avg_mdcr_pymt_amt) * 100) }));
const totalServices = inputs.reduce((sum, row) => sum + row.total_services, 0);
const paymentServiceCents = inputs.reduce((sum, row) => sum + row.avg_medicare_payment_cents * row.total_services, 0);
const displayed = mart.find(row => row.provider_specialty === "Dermatology" && row.hcpcs_code === "99213" && row.year === 2023);
if (!displayed || displayed.total_services !== totalServices || Math.round(paymentServiceCents / totalServices) !== Math.round(displayed.avg_medicare_payment * 100)) throw new Error("Displayed payment does not reconcile to raw records");
const trace = {
  source: "data/sample_2023_puf_10k.csv", source_sha256: sha256(rawFile),
  provenance: "Synthetic CMS-schema records. 2021/2022 are generated scenarios, not historical CMS releases.",
  scope: "Raw CSV through shared local Spark ingestion, staging and mart transformations to the procedure list; Databricks and Airflow service execution is recorded separately when a cloud release is selected.",
  filter: { provider_specialty: "Dermatology", hcpcs_code: "99213", year: 2023, minimum_services: 11 },
  source_row_count: inputs.length, payment_service_cents: paymentServiceCents,
  verification_mart_row: { provider_specialty: displayed.provider_specialty, hcpcs_code: displayed.hcpcs_code, year: displayed.year, total_services: displayed.total_services, avg_medicare_payment: displayed.avg_medicare_payment },
  pipeline_executed_at: pipeline?.executedAt || receipt.executed_at, engine: pipeline?.engine || receipt.runtime.engine,
  pipeline_receipt_path: pipeline?.receiptPath || "data/pipeline_run.json", mart_rows: mart.length, inputs,
};
writeFileSync(resolve(dataDir, "payment_verification.json"), JSON.stringify(trace, null, 2) + "\n");
console.log(`Reconciled displayed payment: ${inputs.length} raw rows → ${totalServices} services → $${displayed.avg_medicare_payment.toFixed(2)}`);
