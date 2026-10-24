import React from "react";
import trace from "../../../../data/payment_verification.json";
import { fmt } from "../data/constants";

export default function CalculationCheck({ demoMart }) {
  const row = trace.verification_mart_row;
  const demoRow = demoMart.find(item => item.provider_specialty === row.provider_specialty && item.hcpcs_code === row.hcpcs_code && Number(item.year) === row.year);
  return (
    <details className="calculation-check span-full" id="calculation-check">
      <summary>Verify one calculation · Dermatology, HCPCS 99213</summary>
      <div className="calculation-check-body">
        <p>This separate check starts with the synthetic raw CSV, not the bundled dashboard mart.</p>
        <ol>
          <li><strong>Source:</strong> {trace.source_row_count} Dermatology rows for HCPCS 99213 in the 2023 raw fixture, with at least 11 services per row.</li>
          <li><strong>Calculation:</strong> sum of payment × services = {fmt.usd(trace.payment_service_cents / 100)}; total services = {fmt.num(row.total_services)}.</li>
          <li><strong>Verification output:</strong> {fmt.usd(trace.payment_service_cents / 100)} ÷ {fmt.num(row.total_services)} = <strong>{fmt.usd(row.avg_medicare_payment)}</strong> average payment per service.</li>
        </ol>
        <p>The procedure list uses an independently generated demo mart. {demoRow && <>Its {fmt.usd(demoRow.avg_medicare_payment)} value is not derived from this raw fixture. </>} This check verifies local arithmetic, not a Databricks or Domo run.</p>
        <a href="https://github.com/kristenmartino/specialtypulse_pipeline/blob/main/data/payment_verification.json" target="_blank" rel="noreferrer">Inspect source row numbers, inputs and output ↗</a>
      </div>
    </details>
  );
}
