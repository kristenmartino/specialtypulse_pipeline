import React from 'react';
import { fmt } from '../data/constants';

const signed = (value, format) => value == null ? 'Unavailable' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;
const change = (delta, ratio, format) => delta == null ? 'Unavailable' : `${signed(delta, format)} (${ratio == null ? 'percentage unavailable' : signed(ratio, fmt.pct)})`;
const scenario = year => year <= 2022 ? 'Generated comparison scenario' : 'Synthetic base records';

export default function ProcedureEvidence({ evidence, references = true }) {
  const ref = evidence.references;
  return <div className="procedure-evidence">
    <div className="comparison-table-wrap">
      <table className="comparison-table" aria-label={`${evidence.specialty} HCPCS ${evidence.code} year comparison`}>
        <thead><tr><th scope="col">Year and input</th><th scope="col">Avg payment per service</th><th scope="col">Services</th></tr></thead>
        <tbody>
          <tr><th scope="row">CY{evidence.priorYear}<span>{evidence.priorAvailable ? scenario(evidence.priorYear) : 'No unique matching prior-year row'}</span></th><td>{fmt.usd(evidence.priorPayment)}</td><td>{fmt.num(evidence.priorServices)}</td></tr>
          <tr><th scope="row">CY{evidence.year}<span>{scenario(evidence.year)}</span></th><td>{fmt.usd(evidence.payment)}</td><td>{fmt.num(evidence.services)}</td></tr>
        </tbody>
      </table>
    </div>
    <p><strong>Payment change:</strong> {change(evidence.paymentDelta, evidence.paymentChange, fmt.usd)}. <strong>Service change:</strong> {change(evidence.serviceDelta, evidence.volumeChange, fmt.num)}.</p>
    <p className="review-status">Changes use this procedure in this specialty: (CY{evidence.year} − CY{evidence.priorYear}) ÷ CY{evidence.priorYear}. Payment differences use the displayed mart values rounded to cents. Missing inputs or a zero prior value make the percentage unavailable. These are constructed scenarios, not historical CMS comparisons.</p>
    {references && ref && <details className="review-evaluation">
      <summary>Evidence and verification links</summary>
      <p><a href={ref.reopen} target="_blank" rel="noreferrer">Reopen {evidence.specialty} / HCPCS {evidence.code} / CY{evidence.year} ↗</a></p>
      <p><a href={ref.mart} target="_blank" rel="noreferrer">Reporting mart snapshot ↗</a> · <a href={ref.receipt} target="_blank" rel="noreferrer">Local Spark run receipt ↗</a></p>
      <p className="review-status">Match provider_specialty = {evidence.specialty}, hcpcs_code = {evidence.code}, year = {evidence.priorYear} or {evidence.year}. Recorded local run: {ref.executedAt}. Mart SHA-256: <code>{ref.martSha256}</code></p>
      <ul>{ref.sources.map(source => <li key={source.year}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">CY{source.year} synthetic raw inputs ↗</a> : `CY${source.year} raw inputs unavailable`}</li>)}</ul>
      <p className="review-status">Raw input filters: provider_type = {evidence.specialty}, hcpcs_cd = {evidence.code}, tot_srvcs ≥ 11. Payment is weighted by services. <a href={ref.method} target="_blank" rel="noreferrer">Reproduction method ↗</a></p>
      {ref.calculation && <p><a href={ref.calculation} target="_blank" rel="noreferrer">CY2023 Dermatology / 99213 raw-to-mart calculation ↗</a></p>}
    </details>}
  </div>;
}
