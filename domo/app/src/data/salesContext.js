const source = require('./sourceData.json');

// Explicit interpretation for this synthetic demo; the original fixture supplied
// an unlabeled amount field and no capture timestamp.
const businessSetting = 'Assumed setting: a specialty analyst supports a healthcare-software sales team selling electronic health record (EHR), practice management (PM) and revenue cycle management (RCM) software. The sales or operations lead decides which questions need analyst verification or account discovery before a commercial recommendation.';
const amountBasis = 'Demo assumption: amount represents annual contract value (ACV) in USD. Active pipeline sums unweighted opportunity amounts, excluding Closed Won and Closed Lost. Closed-won ACV is a separate stage total, not recognized revenue or a sales forecast.';

function fixtureDateScope(rows) {
  const range = key => {
    const dates = rows.map(row => row[key]).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')).sort();
    return dates.length ? `${dates[0]}–${dates[dates.length - 1]}` : 'not recorded';
  };
  return `Static sales fixture: ${rows.length} opportunities; created dates ${range('created_date')}; close dates ${range('close_date')}. All supplied rows are included without a reporting-period filter. Scenario snapshot: 2026-08-31, an invented demo assumption. The source capture date was not recorded; stages are shown as supplied.`;
}

const salesDateScope = fixtureDateScope(source.sfdc);
module.exports = { businessSetting, amountBasis, salesDateScope, fixtureDateScope };
