const tabs = ['market', 'procedure', 'pipeline', 'adoption', 'pdp'];

function readReviewLocation(search) {
  const query = new URLSearchParams(search);
  const year = query.get('year');
  const tab = tabs.includes(query.get('view')) ? query.get('view') : 'market';
  return {
    tab,
    specialty: query.get('specialty') || '',
    code: query.get('hcpcs') || '',
    year: /^\d{4}$/.test(year || '') ? Number(year) : null,
    ...(tab === 'market' && query.get('section') === 'accounts' ? { section: 'accounts' } : {}),
  };
}

function reviewSearch({ tab, specialty, code, year, section }) {
  const query = new URLSearchParams({ view: tab });
  if (specialty) query.set('specialty', specialty);
  if (tab === 'market' && section === 'accounts') query.set('section', 'accounts');
  if (tab === 'procedure') {
    if (code) query.set('hcpcs', code);
    if (year != null) query.set('year', String(year));
  }
  return `?${query}`;
}

module.exports = { readReviewLocation, reviewSearch };
