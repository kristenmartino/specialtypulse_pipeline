import React from 'react';
import { discovery, discoverySource, discoveryExamples, selectedDiscovery, discoveryRows } from '../data/accountDiscovery';

export default function AccountDiscovery({ specialty, selectedId, onChange, onSelectSpecialty }) {
  const examples = discoveryExamples(specialty);
  const selected = selectedDiscovery(specialty, selectedId);
  return (
    <section className="account-discovery" aria-label="Fictional account discovery">
      <h4>Account discovery <span>· optional fictional example</span></h4>
      <p className="review-status" role="status">{selected ? `${selected.name} included in this brief · fully synthetic.` : 'No account example included in this brief.'} {selected && <button type="button" className="exec-brief-link" onClick={() => onChange('')}>Remove account example</button>}</p>
      <details className="review-evidence-detail">
        <summary>Compare two fictional practices</summary>
        <p>{discovery.disclosure}</p>
        <p>Both use Dermatology's payment comparison. Invented account records lead to different next checks. Neither example establishes a customer need or financial benefit.</p>
        {!examples.length ? <><p>These examples are for Dermatology. Switch specialty to explore them; your current notes will stay with {specialty}.</p><button type="button" className="exec-brief-link" onClick={() => onSelectSpecialty('Dermatology')}>Explore Dermatology account examples →</button></> : <>
          <p>Scenario snapshot: {discovery.scenarioDate}. Include one example to carry its context and source excerpts into the download. Your notes and completeness count stay separate.</p>
          {examples.map(example => <details className="account-example" key={example.id}>
            <summary>{example.name} · {example.summary}</summary>
            <dl className="review-questions">{discoveryRows(example).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <h4>Invented source excerpts</h4>
            {example.sources.map(source => <p key={source.id}><strong>{source.id} · {source.date} · {source.type}</strong><br />{source.content}</p>)}
            <button type="button" className="procedure-add" disabled={selected?.id === example.id} onClick={() => onChange(example.id)}>{selected?.id === example.id ? `${example.name} included` : `Include ${example.name} in brief`}</button>
          </details>)}
        </>}
        <p><a href={discoverySource} target="_blank" rel="noreferrer">Synthetic discovery records ↗</a></p>
      </details>
    </section>
  );
}
