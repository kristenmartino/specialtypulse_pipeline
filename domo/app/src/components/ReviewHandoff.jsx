import React, { useMemo, useEffect, useRef } from 'react';
import { buildReviewHandoff, reviewHandoffText } from '../data/reviewFacts';
import { draftCompleteness } from '../data/reviewDraft';
import { latestRows } from '../data/reportingFacts';
import { fmt } from '../data/constants';
import ReviewEvaluation from './ReviewEvaluation';
import ProcedureEvidence from './ProcedureEvidence';

export default function ReviewHandoff({ benchmarks, pipeline, onNavigate, selected, onSelect, draft, onEdit, onRemove, open, onOpenChange, focusEditor }) {
  const specialties = useMemo(() => [...new Set(latestRows(benchmarks).rows.map(row => row.provider_specialty))].sort(), [benchmarks]);
  const review = useMemo(() => buildReviewHandoff(benchmarks, pipeline, selected), [benchmarks, pipeline, selected]);
  const editorRef = useRef(null);
  useEffect(() => {
    if (focusEditor && open && editorRef.current) {
      editorRef.current.focus({ preventScroll: true });
      editorRef.current.scrollIntoView({ block: 'start' });
    }
  }, [focusEditor, open]);
  if (!review) return null;
  const completeness = draftCompleteness(draft);
  const filename = `specialtypulse-${review.specialty.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-review.md`;
  return (
    <details className="review-handoff" open={open} onToggle={event => onOpenChange(event.currentTarget.open)}>
      <summary>Prepare a specialty review · sample handoff</summary>
      <div className="review-handoff-body">
        <p>Choose a specialty, inspect its procedures and add evidence to a draft for a sales or operations lead.</p>
        <div className="procedure-controls">
          <label htmlFor="review-specialty">Example specialty</label>
          <select id="review-specialty" value={review.specialty} onChange={event => onSelect(event.target.value)}>
            {specialties.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <p className="review-status">{review.status} The initial selection uses the highest scenario score; it is not an account-prioritization decision.</p>
        <h3>Sample handoff: {review.specialty}</h3>
        <p><strong>Recipient:</strong> Sales or operations lead. <strong>Requested next step:</strong> review the supporting observations and assign the follow-up questions below.</p>
        <ul>
          <li>Scenario pressure score: <strong>{fmt.score(review.score)}/100</strong>, using project-defined weights.</li>
          <li>Average procedure-level payment change: <strong>{fmt.pct(review.paymentChange)}</strong> in the constructed CY{review.year - 1}–{review.year} comparison.</li>
          <li>Synthetic active pipeline: <strong>{fmt.usd0(review.amount)}</strong> across {review.deals} deals{review.share == null ? '' : ` (${fmt.pct(review.share)} of active pipeline)`}.</li>
        </ul>
        <div className="review-links">
          <button type="button" className="exec-brief-link" onClick={() => onNavigate('procedure', review.specialty)}>Inspect {review.specialty} procedures →</button>
          <button type="button" className="exec-brief-link" onClick={() => onNavigate('pipeline', review.specialty)}>Compare pipeline exposure →</button>
        </div>
        <section className="review-editor" aria-labelledby="review-editor-heading">
          <h3 id="review-editor-heading" tabIndex={-1} ref={editorRef}>Draft brief: {review.specialty}</h3>
          <p>Drafts stay in this tab until you reload. Each specialty keeps its own notes. Download to keep a copy.</p>
          <h4>Selected procedure evidence</h4>
          {draft.evidence.length ? <ul className="review-evidence">
            {draft.evidence.map(item => <li key={item.id}>
              <div><strong>{item.description}</strong> · {item.specialty} / HCPCS {item.code} / CY{item.year}<ProcedureEvidence evidence={item} /></div>
              <button type="button" className="exec-brief-link" aria-label={`Remove HCPCS ${item.code} from brief`} onClick={() => onRemove(item.id)}>Remove</button>
            </li>)}
          </ul> : <p>No procedure selected. Use “Inspect {review.specialty} procedures” above, then “Add to brief.”</p>}
          <p className="review-status">Analyst notes below are unverified draft content.</p>
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
          <p className="review-status" role="status">{completeness.count} of 4 brief elements complete. This checks presence, not accuracy or approval.</p>
          <ul className="review-checklist">{completeness.checks.map(item => <li key={item.label}>{item.complete ? 'Included' : 'Missing'}: {item.label}</li>)}</ul>
          <a download={filename} href={`data:text/markdown;charset=utf-8,${encodeURIComponent(reviewHandoffText(review, draft))}`}>Download draft brief</a>
          <p className="review-status">Incomplete fields are marked in the download. Downloading does not send or assign the brief.</p>
        </section>
        <details className="review-evaluation">
          <summary>Suggested follow-up checks</summary>
          <dl className="review-questions">
          {review.questions.map(item => <div key={item.owner}><dt>{item.owner}: {item.question}</dt><dd>{item.next}</dd></div>)}
          </dl>
        </details>
        <details className="review-evaluation">
          <summary>Problem hypothesis to validate</summary>
          <p>Assumed workflow: an analyst compares payment tables, checks pipeline context in a separate report and copies findings into a brief for a sales or operations lead.</p>
          <p>Hypothesis: moving between those sources makes evidence and follow-up requests easy to omit. A brief built during the investigation could reduce preparation and clarification work.</p>
          <p>Before a pilot, ask intended analysts and recipients to walk through a recent review. Confirm its frequency, tools, time spent, missing evidence and decisions it supports. These are assumptions, not research findings.</p>
        </details>
        <ReviewEvaluation />
      </div>
    </details>
  );
}
