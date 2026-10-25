const source = require('./sourceData.json');
const salesScenarioDate = '2026-08-31';
const sourceRevision = typeof __SP_SOURCE_REVISION__ === 'string' ? __SP_SOURCE_REVISION__ : 'main';

function salesEvidenceText(specialty, revision = sourceRevision) {
  const blob = path => `https://github.com/kristenmartino/specialtypulse_pipeline/blob/${revision}/${path}`;
  return [
    '## Sales evidence and reproduction',
    `[Synthetic sales CSV snapshot](${blob('data/sample_sfdc_pipeline.csv')}) — repository revision: ${revision}.`,
    `Specialty filter: account_specialty = ${JSON.stringify(specialty)}. Open-stage filter: exclude stage = "Closed Won" and "Closed Lost". Count the remaining opportunities and sum amount for the specialty open-stage total.`,
    `Overdue filter: within those open opportunities, require a valid close_date strictly before ${salesScenarioDate}, the invented scenario snapshot date. Count those rows and sum amount for overdue ACV; missing or invalid close dates are excluded from the overdue count.`,
    'Open-stage totals retain overdue opportunities. The specialty share denominator is the open-stage amount across all specialties in this CSV. No created-date or close-date reporting-period filter is applied.',
    `[Sales metric definitions](${blob('docs/METRIC_CERTIFICATION_LOG.md')}) — amount is assumed annual contract value in USD; these are unweighted scenario amounts, not recognized revenue or a forecast.`,
  ];
}

// Explicit interpretation for this synthetic demo; the original fixture supplied
// an unlabeled amount field and no capture timestamp.
const businessSetting = 'Assumed setting: a specialty analyst supports a healthcare-software sales team selling electronic health record (EHR), practice management (PM) and revenue cycle management (RCM) software. The sales or operations lead decides which questions need analyst verification or account discovery before a commercial recommendation.';
const amountBasis = 'Demo assumption: amount represents annual contract value (ACV) in USD. Open-stage pipeline sums unweighted opportunity amounts, excluding Closed Won and Closed Lost, and includes overdue open opportunities. Closed-won ACV is a separate stage total, not recognized revenue or a sales forecast.';

function fixtureDateScope(rows) {
  const range = key => {
    const dates = rows.map(row => row[key]).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')).sort();
    return dates.length ? `${dates[0]}–${dates[dates.length - 1]}` : 'not recorded';
  };
  return `Static sales fixture: ${rows.length} opportunities; created dates ${range('created_date')}; close dates ${range('close_date')}. All supplied rows are included without a reporting-period filter. Scenario snapshot: ${salesScenarioDate}, an invented demo assumption. The source capture date was not recorded; stages are shown as supplied.`;
}

const salesDateScope = fixtureDateScope(source.sfdc);
module.exports = { businessSetting, amountBasis, salesDateScope, fixtureDateScope, salesScenarioDate, salesEvidenceText };
