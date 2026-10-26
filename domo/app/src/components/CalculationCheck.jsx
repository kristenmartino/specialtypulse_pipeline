import React from "react";
import trace from "../../../../data/payment_verification.json";
import { fmt } from "../data/constants";

const revision = typeof __SP_SOURCE_REVISION__ === "string" ? __SP_SOURCE_REVISION__ : "main";
const blob = path => `https://github.com/kristenmartino/specialtypulse_pipeline/blob/${revision}/${path}`;

export default function CalculationCheck({ demoMart }) {
  const row = trace.verification_mart_row;
  const demoRow = demoMart.find(item => item.provider_specialty === row.provider_specialty && item.hcpcs_code === row.hcpcs_code && Number(item.year) === row.year);
  return (
    <details className="calculation-check span-full" id="calculation-check">
      <summary>Verify one calculation · Dermatology, HCPCS 99213</summary>
      <div className="calculation-check-body">
        <p>This value follows the synthetic raw CSV through the shared Spark ingestion, staging and mart transformations into the procedure list.</p>
        <ol>
          <li><strong>Source:</strong> {trace.source_row_count} Dermatology rows for HCPCS 99213 in the 2023 raw fixture, with at least 11 services per row.</li>
          <li><strong>Calculation:</strong> sum of payment × services = {fmt.usd(trace.payment_service_cents / 100)}; total services = {fmt.num(row.total_services)}.</li>
          <li><strong>Displayed mart output:</strong> {fmt.usd(trace.payment_service_cents / 100)} ÷ {fmt.num(row.total_services)} = <strong>{fmt.usd(row.avg_medicare_payment)}</strong> average payment per service.</li>
        </ol>
        <p>The procedure list reads this same mart row: <strong>{fmt.usd(demoRow?.avg_medicare_payment)}</strong> across {fmt.num(demoRow?.total_services)} services. The selected {trace.engine} run produced {fmt.num(trace.mart_rows)} mart rows.</p>
        <a href={blob("data/payment_verification.json")} target="_blank" rel="noreferrer">Inspect source row numbers, inputs and output ↗</a>
        <a className="pipeline-receipt-link" href={blob(trace.pipeline_receipt_path || "data/pipeline_run.json")} target="_blank" rel="noreferrer">Inspect the selected run receipt ↗</a>
      </div>
    </details>
  );
}
