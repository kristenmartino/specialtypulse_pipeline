const { salesScenarioDate, missingSalesText } = require('./salesContext');
const { pipelineHygieneText, firstSalesCheck } = require('./pipelineHygiene');

const sourceRevision = typeof __SP_SOURCE_REVISION__ === 'string' ? __SP_SOURCE_REVISION__ : 'main';
const textCell = value => String(value ?? '—').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const usd = value => value == null ? 'Unavailable' : `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const overdueRows = review => [...review.overdue].sort((a, b) => b.days_overdue - a.days_overdue || String(a.opportunity_id).localeCompare(String(b.opportunity_id)));

function salesReviewCsv(review, revision = sourceRevision) {
  if (!review.coverage.hasRecords) return '';
  const columns = ['opportunity_id', 'account_name', 'account_specialty', 'owner', 'region', 'stage', 'assumed_acv_usd', 'close_date', 'days_overdue', 'scenario_snapshot_date', 'data_status', 'source_revision'];
  const rows = overdueRows(review).map(row => [row.opportunity_id, row.account_name, row.account_specialty, row.owner, row.region, row.stage,
    Number.isFinite(row.amount) ? row.amount.toFixed(2) : '', row.close_date, row.days_overdue, salesScenarioDate, 'synthetic', revision]);
  const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [columns, ...rows].map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
}

function salesReviewAppendix(review) {
  if (!review.coverage.hasRecords) return ['## Sales review appendix', 'Optional pipeline context; not required to prepare discovery questions.', missingSalesText(review.specialty)];
  const owners = review.owners.filter(row => row.deals > 0).sort((a, b) => (b.totalAmount ?? -1) - (a.totalAmount ?? -1));
  return [
    '## Sales review appendix',
    'Optional pipeline context; not required to prepare discovery questions.',
    `Specialty: ${review.specialty}. Synthetic records; invented scenario snapshot ${salesScenarioDate}. Stages are supplied, not confirmed. This packet does not update a CRM.`,
    '',
    '### Pipeline data check',
    pipelineHygieneText(review.hygiene),
    firstSalesCheck,
    '',
    '### Open-stage owner summary',
    'Open-stage totals include overdue opportunities. Ages use only valid overdue dates; an em dash means no eligible date. Amounts are assumed ACV in USD, not revenue or a forecast.',
    ...(owners.length ? [
      '| Owner | Region | Open deals | Assumed ACV · USD | Oldest overdue · days | Median overdue · days |',
      '| --- | --- | ---: | ---: | ---: | ---: |',
      ...owners.map(row => `| ${[row.owner, row.region, row.deals, usd(row.totalAmount), row.oldestDaysOverdue, row.medianDaysOverdue].map(textCell).join(' | ')} |`),
    ] : ['No open opportunities in the supplied specialty records.']),
    '',
    `### Overdue opportunities (${review.overdue.length})`,
    'Only open opportunities with a valid close date strictly before the scenario snapshot are included. Missing or invalid dates are excluded; they remain in open-stage totals.',
    ...(review.overdue.length ? [
      '| Opportunity ID | Account | Owner | Stage | Assumed ACV · USD | Close date | Days overdue |',
      '| --- | --- | --- | --- | ---: | --- | ---: |',
      ...overdueRows(review).map(row => `| ${[row.opportunity_id, row.account_name, row.owner, row.stage, usd(row.amount), row.close_date, row.days_overdue].map(textCell).join(' | ')} |`),
    ] : ['No overdue open opportunities in the supplied specialty records.']),
  ];
}

module.exports = { salesReviewCsv, salesReviewAppendix };
