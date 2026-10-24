const tabs = ['market', 'procedure', 'pipeline', 'adoption', 'pdp'];

function readReviewLocation(search) {
  const query = new URLSearchParams(search);
  const year = query.get('year');
  return {
    tab: tabs.includes(query.get('view')) ? query.get('view') : 'market',
    specialty: query.get('specialty') || '',
    code: query.get('hcpcs') || '',
    year: /^\d{4}$/.test(year || '') ? Number(year) : null,
  };
}

function reviewSearch({ tab, specialty, code, year }) {
  const query = new URLSearchParams({ view: tab });
  if (specialty) query.set('specialty', specialty);
  if (tab === 'procedure') {
    if (code) query.set('hcpcs', code);
    if (year != null) query.set('year', String(year));
  }
  return `?${query}`;
}

module.exports = { readReviewLocation, reviewSearch };
