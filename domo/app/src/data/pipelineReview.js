const { activePipeline } = require('./reportingFacts');
const { dayNumber, sumAmounts, pipelineHygiene } = require('./pipelineHygiene');
const { salesCoverage } = require('./salesContext');

// Use one scope for headline amounts, owner totals and the sales review list.
function buildPipelineReview(pipeline, specialty, snapshotDate) {
  const rows = pipeline.filter(row => row.account_specialty === specialty);
  const coverage = salesCoverage(pipeline, specialty);
  const hygiene = pipelineHygiene(rows, snapshotDate);
  const open = activePipeline(rows);
  const won = rows.filter(row => row.stage === 'Closed Won');
  const snapshot = dayNumber(snapshotDate);
  const overdue = open
    .filter(row => dayNumber(row.close_date) != null && dayNumber(row.close_date) < snapshot)
    .map(row => ({ ...row, amount: Number(row.amount), days_overdue: snapshot - dayNumber(row.close_date) }));
  const owners = [...new Set(rows.map(row => row.owner))].map(owner => {
    const ownerRows = rows.filter(row => row.owner === owner);
    const ownerHygiene = pipelineHygiene(ownerRows, snapshotDate);
    const days = overdue.filter(row => row.owner === owner).map(row => row.days_overdue).sort((a, b) => a - b);
    const middle = Math.floor(days.length / 2);
    return { owner, region: ownerRows[0]?.region || '', deals: ownerHygiene.openCount,
      totalAmount: ownerHygiene.openAmount, oldestDaysOverdue: ownerHygiene.maxDaysOverdue,
      medianDaysOverdue: !days.length ? null : days.length % 2 ? days[middle] : (days[middle - 1] + days[middle]) / 2 };
  });
  return { rows, open, won, overdue, hygiene, coverage, owners, wonAmount: sumAmounts(won) };
}

module.exports = { buildPipelineReview };
