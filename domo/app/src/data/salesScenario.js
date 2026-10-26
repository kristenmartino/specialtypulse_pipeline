function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time / 86400000 : null;
}

function validateSalesScenario(rows, scenario) {
  const snapshot = calendarDay(scenario.scenario_date);
  if (snapshot == null || scenario.synthetic !== true) throw new Error('A dated synthetic sales scenario is required');
  const ids = new Set();
  for (const row of rows) {
    const created = calendarDay(row.created_date), close = calendarDay(row.close_date), age = Number(row.days_in_stage);
    const fail = reason => { throw new Error(`Invalid sales scenario row ${row.opportunity_id}: ${reason}`); };
    if (!row.opportunity_id || ids.has(row.opportunity_id)) fail('missing or duplicate opportunity ID');
    ids.add(row.opportunity_id);
    if (created == null || created > snapshot) fail('created date is invalid or after the snapshot');
    if (close == null || close < created) fail('close date is invalid or before creation');
    if (row.days_in_stage == null || row.days_in_stage === '' || !Number.isInteger(age) || age < 0 || age > snapshot - created) fail('stage age exceeds opportunity age');
    if (row.stage === 'Closed Won' || row.stage === 'Closed Lost') {
      if (close > snapshot) fail('closed opportunity has a future actual close date');
      if (age !== snapshot - close) fail('closed-stage age differs from elapsed days since close');
    }
  }
}

module.exports = { validateSalesScenario };
