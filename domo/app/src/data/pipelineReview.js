const { activePipeline } = require('./reportingFacts');
const { dayNumber, sumAmounts, pipelineHygiene } = require('./pipelineHygiene');

// Use one scope for headline amounts, owner totals and the sales review list.
function buildPipelineReview(pipeline, specialty, snapshotDate) {
  const rows = pipeline.filter(row => row.account_specialty === specialty);
  const hygiene = pipelineHygiene(rows, snapshotDate);
  const open = activePipeline(rows);
  const won = rows.filter(row => row.stage === 'Closed Won');
  const snapshot = dayNumber(snapshotDate);
  const overdue = open
    .filter(row => dayNumber(row.close_date) != null && dayNumber(row.close_date) < snapshot)
    .map(row => ({ ...row, amount: Number(row.amount), days_overdue: snapshot - dayNumber(row.close_date) }));
  return { rows, open, won, overdue, hygiene, wonAmount: sumAmounts(won) };
}

module.exports = { buildPipelineReview };
