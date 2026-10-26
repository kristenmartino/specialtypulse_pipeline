import React, { useMemo, useEffect, useRef, useState } from 'react';
import { buildReviewHandoff, reviewHandoffText } from '../data/reviewFacts';
import { draftCompleteness } from '../data/reviewDraft';
import { latestRows } from '../data/reportingFacts';
import { fmt } from '../data/constants';
import ProcedureEvidence, { ProcedureEvidenceSummary } from './ProcedureEvidence';
import { amountBasis, salesDateScope, missingSalesText } from '../data/salesContext';
import { pipelineHygieneText, firstSalesCheck } from '../data/pipelineHygiene';
import { salesReviewCsv } from '../data/salesPacket';

export default function ReviewHandoff({ benchmarks, pipeline, onNavigate, selected, onSelect, draft, onEdit, onRemove, open, onOpenChange, focusEditor }) {
  const specialties = useMemo(() => [...new Set(latestRows(benchmarks).rows.map(row => row.provider_specialty))].sort(), [benchmarks]);
  const review = useMemo(() => buildReviewHandoff(benchmarks, pipeline, selected), [benchmarks, pipeline, selected]);
  const editorRef = useRef(null);
  const specialtyRef = useRef(null);
  const handledEditorFocus = useRef(0);
  const [startRequest, setStartRequest] = useState(0);
  useEffect(() => {
    if (startRequest && open && specialtyRef.current) {
      specialtyRef.current.focus({ preventScroll: true });
      specialtyRef.current.scrollIntoView({ block: 'center' });
    }
  }, [startRequest, open]);
  useEffect(() => {
    if (focusEditor > handledEditorFocus.current && open && editorRef.current) {
      handledEditorFocus.current = focusEditor;
      editorRef.current.focus({ preventScroll: true });
      editorRef.current.scrollIntoView({ block: 'start' });
    }
  }, [focusEditor, open]);
  if (!review) return null;
  const completeness = draftCompleteness(draft);
  const filename = `specialtypulse-${review.specialty.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-review.md`;
  return (
    <section className="review-workspace">
    <div className="review-start" aria-labelledby="review-start-heading">
      <div>
        <h2 id="review-start-heading">Specialty review</h2>
        <p>Compare payments, check pipeline context, and prepare a brief.</p>
      </div>
      <button type="button" className={open ? "exec-brief-link" : "review-start-button"} aria-controls="review-handoff" aria-expanded={open} onClick={() => { onOpenChange(!open); if (!open) setStartRequest(value => value + 1); }}>{open ? "Close brief" : "Start review →"}</button>
    </div>
    <div id="review-handoff" className="review-handoff" hidden={!open}>
      <div className="review-handoff-body">
        <div className="procedure-controls">
          <label htmlFor="review-specialty">Specialty</label>
          <select id="review-specialty" ref={specialtyRef} value={review.specialty} onChange={event => onSelect(event.target.value)}>
            {specialties.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <p className="review-status">Source and account validation pending. Specialty scores are not account priorities.</p>
        {!review.coverage.hasRecords && <p className="review-status" role="status"><strong>{missingSalesText(review.specialty)}</strong></p>}
        {review.hygiene.overdueCount > 0 && <p className="review-status"><strong>Sales follow-up first:</strong> {review.hygiene.overdueCount} of {review.hygiene.openCount} open deals have overdue close dates. Verify stages and dates before planning.</p>}
        <div className="review-links">
          <button type="button" className="exec-brief-link" onClick={() => onNavigate('procedure', review.specialty)}>Inspect {review.specialty} procedures →</button>
          <button type="button" className="exec-brief-link" onClick={() => onNavigate('pipeline', review.specialty)}>Compare pipeline exposure →</button>
        </div>
        <details className="review-evaluation review-context">
          <summary>Specialty context · sample data</summary>
        <h3>Sample handoff: {review.specialty}</h3>
        <p><strong>Recipient:</strong> Sales or operations lead. <strong>Requested next step:</strong> review the supporting observations and assign the follow-up questions below.</p>
        <ul>
          <li>Scenario pressure score: <strong>{fmt.score(review.score)}/100</strong>, using project-defined weights.</li>
          <li>Average procedure-level payment change: <strong>{fmt.pct(review.paymentChange)}</strong> in the constructed CY{review.year - 1}–{review.year} comparison.</li>
          {review.coverage.hasRecords && <li>Synthetic open-stage pipeline: <strong>{fmt.usd0(review.amount)}</strong> across {review.deals} deals{review.share == null ? '' : ` (${fmt.pct(review.share)} of open-stage pipeline)`}. Includes overdue open opportunities.</li>}
        </ul>
        {review.coverage.hasRecords && <><p>{pipelineHygieneText(review.hygiene)}</p><p>{firstSalesCheck}</p></>}
        <p>{amountBasis}</p>
        <p>{salesDateScope}</p>
        </details>
        <section className="review-editor" aria-labelledby="review-editor-heading">
          <h3 id="review-editor-heading" tabIndex={-1} ref={editorRef}>Draft brief: {review.specialty}</h3>
          <p>Notes stay with each specialty until reload. Download to save.</p>
          <h4>Selected procedure evidence</h4>
          {draft.evidence.length ? <ul className="review-evidence">
            {draft.evidence.map(item => <li key={item.id}>
              <div>
                <strong>{item.description}</strong> · HCPCS {item.code} · CY{item.priorYear}–{item.year}
                <ProcedureEvidenceSummary evidence={item} />
                <details className="review-evidence-detail">
                  <summary>View HCPCS {item.code} comparison and sources</summary>
                  <ProcedureEvidence evidence={item} />
                </details>
              </div>
              <button type="button" className="exec-brief-link" aria-label={`Remove HCPCS ${item.code} from brief`} onClick={() => onRemove(item.id)}>Remove</button>
            </li>)}
          </ul> : <p>No evidence yet. Inspect procedures and add a comparison.</p>}
          <p className="review-status">Draft notes · unverified</p>
          <div className="review-fields">
            <label htmlFor="review-observation">Analyst observation and limits</label>
            <textarea id="review-observation" rows={3} maxLength={2000} value={draft.observation} onChange={event => onEdit('observation', event.target.value)} placeholder="Describe what you found and what the evidence cannot tell you." />
            <label htmlFor="review-question">Open question</label>
            <textarea id="review-question" rows={2} maxLength={1000} value={draft.question} onChange={event => onEdit('question', event.target.value)} placeholder="What still needs investigation?" />
            <label htmlFor="review-reviewer">Next reviewer</label>
            <input id="review-reviewer" maxLength={120} value={draft.reviewer} onChange={event => onEdit('reviewer', event.target.value)} placeholder="Person or role" />
            <label htmlFor="review-next-check">Requested next check</label>
            <textarea id="review-next-check" rows={2} maxLength={1000} value={draft.nextCheck} onChange={event => onEdit('nextCheck', event.target.value)} placeholder="What should that reviewer check?" />
          </div>
          <p className="review-status" role="status">{completeness.count} of 4 brief elements complete. Presence check only; accuracy and approval are unverified.</p>
          <ul className="review-checklist">{completeness.checks.map(item => <li key={item.label}>{item.complete ? 'Included' : 'Missing'}: {item.label}</li>)}</ul>
          <a download={filename} href={`data:text/markdown;charset=utf-8,${encodeURIComponent(reviewHandoffText(review, draft))}`}>Download draft brief</a>
          {review.coverage.hasRecords && <p><a download={filename.replace('-review.md', '-overdue-opportunities.csv')} href={`data:text/csv;charset=utf-8,${encodeURIComponent(salesReviewCsv(review.salesReview))}`}>Download overdue opportunities CSV ({review.salesReview.overdue.length})</a></p>}
          {review.coverage.hasRecords && <p className="review-status">The brief includes owner totals and the full overdue list for this specialty.</p>}
          <p className="review-status">Incomplete fields are marked. Download saves a copy; it does not send or assign the brief.</p>
        </section>
        <details className="review-evaluation">
          <summary>Suggested follow-up checks</summary>
          <dl className="review-questions">
          {review.questions.map(item => <div key={item.owner}><dt>{item.owner}: {item.question}</dt><dd>{item.next}</dd></div>)}
          </dl>
        </details>
        <p className="review-status"><a href="https://kristenmartino.ai/work/specialtypulse-pipeline" target="_blank" rel="noreferrer">Project scope and validation plan ↗</a></p>
      </div>
    </div>
    </section>
  );
}
