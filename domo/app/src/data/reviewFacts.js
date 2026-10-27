const { buildBriefFacts, latestRows } = require('./reportingFacts');
const { draftCompleteness } = require('./reviewDraft');
const { procedureEvidenceText } = require('./procedureFacts');
const { businessSetting, amountBasis, salesDateScope, salesScenarioDate, salesEvidenceText, missingSalesText } = require('./salesContext');
const { pipelineHygiene, pipelineHygieneText, firstSalesCheck } = require('./pipelineHygiene');
const { buildPipelineReview } = require('./pipelineReview');
const { salesReviewAppendix } = require('./salesPacket');
const { discoveryText } = require('./accountDiscovery');

const reviewQuestions = [
  { owner: 'Sales operations lead', question: 'Which open opportunities need their stages and close dates corrected before planning?', next: firstSalesCheck },
  { owner: 'Specialty analyst', question: 'Do the source records, service mix and calculation explain the payment comparison?', next: 'Trace a procedure to its inputs and record any unresolved data or interpretation issue.' },
  { owner: 'Sales operations lead', question: 'What do account notes say about the customer’s needs?', next: 'Confirm account context; a specialty-level score does not establish account need.' },
  { owner: 'Sales or operations lead', question: 'What evidence is needed before a commercial recommendation?', next: 'Confirm the next reviewer and the evidence to request. Source and account validation remain pending.' },
];

function buildReviewHandoff(benchmarks, pipeline, requestedSpecialty) {
  const facts = buildBriefFacts(benchmarks, [], pipeline);
  const selected = requestedSpecialty
    ? facts.specialties.find(row => row.name === requestedSpecialty)
    : facts.top;
  const benchmark = latestRows(benchmarks).rows.find(row => row.provider_specialty === selected?.name);
  if (!selected || !benchmark) return null;
  const change = benchmark.avg_yoy_payment_change;
  return {
    specialty: selected.name, year: Number(benchmark.year), score: selected.pressure,
    paymentChange: change == null || change === '' || !Number.isFinite(Number(change)) ? null : Number(change),
    amount: selected.amount, deals: selected.deals, share: selected.share, coverage: selected.coverage,
    hygiene: pipelineHygiene(pipeline.filter(row => row.account_specialty === selected.name), salesScenarioDate),
    salesReview: buildPipelineReview(pipeline, selected.name, salesScenarioDate),
    status: 'Sample only — source and account validation pending.',
    questions: selected.coverage.hasRecords ? reviewQuestions : [
      { owner: 'Sales operations lead', question: 'Which sales records should cover this specialty?', next: 'Confirm sales source coverage before interpreting pipeline or checking overdue opportunities.' },
      ...reviewQuestions.slice(1),
    ],
  };
}

function reviewHandoffText(review, draft) {
  if (!review) return '';
  if (draft) draft = { ...draft, evidence: draft.evidence.filter(item => item.specialty === review.specialty) };
  const change = review.paymentChange == null ? 'Unavailable' : `${(review.paymentChange * 100).toFixed(1)}%`;
  return [
    '# Sample specialty-review handoff',
    '',
    `Focus: ${review.specialty} · CY${review.year}`,
    'Prepared for: Sales or operations lead',
    `Status: ${review.status}`,
    '',
    'Purpose: Identify a payment pattern to investigate and prepare questions for the next reviewer.',
    'Data: Synthetic CMS-schema records; 2021–2022 are generated comparison scenarios. Sales are synthetic.',
    businessSetting,
    amountBasis,
    salesDateScope,
    '',
    '## Supporting observations',
    `- Scenario pressure score: ${review.score == null ? 'Unavailable' : review.score.toFixed(1)}/100. Project-defined and unvalidated against sales outcomes.`,
    `- Average procedure-level payment change: ${change}; a constructed scenario comparison.`,
    review.coverage.hasRecords ? `- Synthetic open-stage pipeline: $${review.amount.toLocaleString('en-US')} across ${review.deals} deals${review.share == null ? '' : ` (${(review.share * 100).toFixed(1)}% of open-stage pipeline)`}. Includes overdue open opportunities.` : `- ${missingSalesText(review.specialty)}`,
    ...(review.coverage.hasRecords && review.hygiene ? ['', '## Sales follow-up first', pipelineHygieneText(review.hygiene), firstSalesCheck] : ['', '## Sales coverage check', 'Confirm sales source coverage with the sales operations lead before interpreting pipeline or checking overdue opportunities.']),
    '',
    ...salesEvidenceText(review.specialty),
    ...(draft ? [
      '',
      '## Analyst draft — unverified',
      `Completeness: ${draftCompleteness(draft).count}/4 brief elements. This checks presence, not accuracy or approval.`,
      '',
      '### Selected procedure evidence',
      ...draft.evidence.flatMap(procedureEvidenceText),
      ...(!draft.evidence.length ? ['Not selected.'] : []),
      '',
      `Observation: ${draft.observation.trim() || 'Not entered.'}`,
      `Open question: ${draft.question.trim() || 'Not entered.'}`,
      `Next reviewer: ${draft.reviewer.trim() || 'Not entered.'}`,
      `Requested next check: ${draft.nextCheck.trim() || 'Not entered.'}`,
      ...discoveryText(review.specialty, draft.accountDiscoveryId),
    ] : []),
    '',
    '## Suggested follow-up checks',
    ...review.questions.flatMap(item => [`- ${item.owner}: ${item.question}`, `  Next check: ${item.next}`]),
    '',
    ...salesReviewAppendix({ ...review.salesReview, specialty: review.specialty }),
    '',
    'This is an example work product. No stakeholder review, account validation, approved shortlist or business outcome is recorded.',
    '',
  ].join('\n');
}

module.exports = { buildReviewHandoff, reviewHandoffText };
