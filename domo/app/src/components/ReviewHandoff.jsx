import React, { useMemo } from 'react';
import { buildReviewHandoff, reviewHandoffText } from '../data/reviewFacts';
import { latestRows } from '../data/reportingFacts';
import { fmt } from '../data/constants';

export default function ReviewHandoff({ benchmarks, pipeline, onNavigate, selected, onSelect }) {
  const specialties = useMemo(() => [...new Set(latestRows(benchmarks).rows.map(row => row.provider_specialty))].sort(), [benchmarks]);
  const review = useMemo(() => buildReviewHandoff(benchmarks, pipeline, selected), [benchmarks, pipeline, selected]);
  if (!review) return null;
  const filename = `specialtypulse-${review.specialty.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-review.md`;
  return (
    <details className="review-handoff">
      <summary>Prepare a specialty review · sample handoff</summary>
      <div className="review-handoff-body">
        <p>For a specialty analyst preparing a review for a sales or operations lead. Choose a pattern to investigate and name the evidence the next reviewer needs.</p>
        <div className="procedure-controls">
          <label htmlFor="review-specialty">Example specialty</label>
          <select id="review-specialty" value={review.specialty} onChange={event => onSelect(event.target.value)}>
            {specialties.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <p className="review-status">{review.status} The example starts with the highest score in the constructed scenario; it is not an account-prioritization decision.</p>
        <h3>Sample handoff: {review.specialty}</h3>
        <p><strong>Recipient:</strong> Sales or operations lead. <strong>Requested next step:</strong> review the supporting observations and assign the follow-up questions below.</p>
        <ul>
          <li>Scenario pressure score: <strong>{fmt.score(review.score)}/100</strong>, using project-defined weights.</li>
          <li>Average procedure-level payment change: <strong>{fmt.pct(review.paymentChange)}</strong> in the constructed CY{review.year - 1}–{review.year} comparison.</li>
          <li>Synthetic active pipeline: <strong>{fmt.usd0(review.amount)}</strong> across {review.deals} deals{review.share == null ? '' : ` (${fmt.pct(review.share)} of active pipeline)`}.</li>
        </ul>
        <dl className="review-questions">
          {review.questions.map(item => <div key={item.owner}><dt>{item.owner}: {item.question}</dt><dd>{item.next}</dd></div>)}
        </dl>
        <div className="review-links">
          <button type="button" className="exec-brief-link" onClick={() => onNavigate('procedure', review.specialty)}>Inspect {review.specialty} procedures →</button>
          <button type="button" className="exec-brief-link" onClick={() => onNavigate('pipeline', review.specialty)}>Compare pipeline exposure →</button>
          <a download={filename} href={`data:text/markdown;charset=utf-8,${encodeURIComponent(reviewHandoffText(review))}`}>Download sample handoff</a>
        </div>
        <details className="review-evaluation">
          <summary>Proposed acceptance criteria</summary>
          <p>Future user-evaluation plan. No user-test results or business outcomes have been collected.</p>
          <p>Ask an intended reviewer to prepare a specialty brief from the demo. Observe where help is needed and record the interpretation, missing evidence and recipient feedback.</p>
          <ol>
            <li><strong>Explain the focus:</strong> identify the chosen specialty, cite a payment comparison and pipeline exposure, and recognize that the data is synthetic.</li>
            <li><strong>Interpret the measures:</strong> explain the payment denominator and distinguish a scenario score from a sales recommendation.</li>
            <li><strong>Make a usable handoff:</strong> state an unresolved question, a receiving role and a next check. The receiving reviewer can identify what is being requested.</li>
          </ol>
          <p>These criteria evaluate the proposed review workflow. They do not demonstrate adoption, time savings or improved sales decisions.</p>
        </details>
      </div>
    </details>
  );
}
