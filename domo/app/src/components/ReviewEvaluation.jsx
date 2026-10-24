import React from 'react';

export default function ReviewEvaluation() {
  return <details className="review-evaluation">
    <summary>Proposed usefulness study</summary>
    <p>This workflow and its evaluation criteria are proposed. No stakeholder validation, user evaluation or business outcomes have been recorded.</p>
    <p>Recruit five analyst–reviewer pairs for an exploratory comparison. Each analyst prepares two briefs from matched data: one with their usual report or spreadsheet and one with SpecialtyPulse. Alternate which method comes first and which scenario it uses. Confirm the usual workflow and match task difficulty before testing.</p>
    <p>Measure preparation time from opening the data to submitting a brief. Give reviewers the briefs without identifying the method; record missing evidence, interpretation errors and clarification requests before they can state the next action.</p>
    <ul>
      <li><strong>Completeness:</strong> at least four of five SpecialtyPulse briefs include procedure evidence, an observation with limits, an open question, and a next reviewer with a requested check; completeness must be at least as high as the comparison method.</li>
      <li><strong>Interpretation:</strong> no critical errors in SpecialtyPulse briefs or recipient explanations. Treating synthetic data as observed history, a score as account need, or a blended average as a procedure-specific expected rate counts as a critical error.</li>
      <li><strong>Preparation time:</strong> median paired time reduction of at least 20% against the comparison method, without reducing completeness.</li>
      <li><strong>Clarification:</strong> at least four of five recipients can explain the next action without clarification, with no more requests overall than for the comparison briefs.</li>
    </ul>
    <p>These are proposed thresholds for deciding whether to run a larger pilot, not achieved results. If accuracy or completeness fails, revise the workflow before testing speed again. Sessions and page views describe activity; they do not demonstrate usefulness.</p>
  </details>;
}
