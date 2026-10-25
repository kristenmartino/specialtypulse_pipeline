const DAY_MS = 86400000;

// Require real ISO calendar dates. UTC day arithmetic keeps results independent
// of the viewer's timezone and the machine's current date.
function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time / DAY_MS : null;
}

function sumAmounts(rows) {
  let cents = 0;
  for (const row of rows) {
    if (row.amount == null || row.amount === '' || !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0) return null;
    cents += Math.round(Number(row.amount) * 100);
    if (!Number.isSafeInteger(cents)) return null;
  }
  return cents / 100;
}

function pipelineHygiene(rows, snapshotDate) {
  const snapshot = dayNumber(snapshotDate);
  if (snapshot == null) throw new Error('A valid scenario snapshot date is required');
  const open = rows.filter(row => row.stage !== 'Closed Won' && row.stage !== 'Closed Lost');
  const overdue = open.filter(row => dayNumber(row.close_date) != null && dayNumber(row.close_date) < snapshot);
  const days = overdue.map(row => snapshot - dayNumber(row.close_date));
  return {
    snapshotDate, openCount: open.length, openAmount: sumAmounts(open),
    overdueCount: overdue.length, overdueAmount: sumAmounts(overdue),
    overdueShare: open.length ? overdue.length / open.length : null,
    unknownCloseDateCount: open.filter(row => dayNumber(row.close_date) == null).length,
    minDaysOverdue: days.length ? Math.min(...days) : null,
    maxDaysOverdue: days.length ? Math.max(...days) : null,
  };
}

const firstSalesCheck = 'First sales follow-up: reconcile opportunity stages and close dates with the sales operations lead before using the open-stage total for planning. Record confirmed changes; past-due dates alone do not close or remove opportunities.';

function pipelineHygieneText(facts) {
  const amount = facts.overdueAmount == null ? 'ACV unavailable' : `$${facts.overdueAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in assumed USD ACV`;
  const age = facts.overdueCount ? `; ${facts.minDaysOverdue}–${facts.maxDaysOverdue} days overdue` : '';
  const share = facts.overdueShare == null ? '' : ` (${(facts.overdueShare * 100).toFixed(1)}% of open deals)`;
  const unknown = facts.unknownCloseDateCount ? ` ${facts.unknownCloseDateCount} open deals have missing or invalid close dates and are excluded from the overdue count.` : '';
  return `At the invented ${facts.snapshotDate} scenario snapshot, ${facts.overdueCount} of ${facts.openCount} open deals${share} have close dates before the snapshot: ${amount}${age}. The open-stage total includes these overdue opportunities.${unknown}`;
}

module.exports = { pipelineHygiene, pipelineHygieneText, firstSalesCheck };
