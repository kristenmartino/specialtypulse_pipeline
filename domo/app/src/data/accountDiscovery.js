const discovery = require('./accountDiscovery.json');
const sourceRevision = typeof __SP_SOURCE_REVISION__ === 'string' ? __SP_SOURCE_REVISION__ : 'main';
const discoverySource = `https://github.com/kristenmartino/specialtypulse_pipeline/blob/${sourceRevision}/domo/app/src/data/accountDiscovery.json`;

function discoveryExamples(specialty) {
  return discovery.examples.filter(example => example.specialty === specialty);
}

function selectedDiscovery(specialty, id) {
  return discoveryExamples(specialty).find(example => example.id === id) || null;
}

function discoveryRows(example) {
  return [
    ['Decision in this scenario', example.decision],
    ['Next reviewer', example.reviewer], ['Requested next check', example.nextCheck],
    ['Discovery date', example.discoveryDate], ['Fictional stakeholder', example.stakeholder],
    ['Current systems', example.systems], ['Reported workflow', example.workflow],
    ['Reported need and limits', example.reportedNeed], ['Illustrative baseline', example.baseline],
    ['Payer context', example.payerContext], ['Open questions', example.openQuestions],
  ];
}

function discoveryText(specialty, id) {
  const example = selectedDiscovery(specialty, id);
  if (!example) return [];
  return [
    '', '## Selected fictional account-discovery example',
    `${example.name} · ${example.specialty} · scenario snapshot ${discovery.scenarioDate}`,
    discovery.disclosure,
    'Both examples share the same specialty-level payment comparison. Their different follow-up decisions come from invented account records, not the specialty score. Differences between practices are not measured savings.',
    ...discoveryRows(example).map(([label, value]) => `${label}: ${value}`),
    '', '### Invented source excerpts',
    ...example.sources.map(source => `${source.id} · ${source.date} · ${source.type}: ${source.content}`),
    `[Synthetic discovery records](${discoverySource})`,
  ];
}

module.exports = { discovery, discoverySource, discoveryExamples, selectedDiscovery, discoveryRows, discoveryText };
