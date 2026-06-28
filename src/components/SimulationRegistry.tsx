import React, {useMemo, useState} from 'react';
import Link from '@docusaurus/Link';
import registry from '@site/registry/simulations.json';
import styles from './SimulationRegistry.module.css';

type Simulation = (typeof registry.simulations)[number];

function searchableText(simulation: Simulation): string {
  return [simulation.id, simulation.title, simulation.summary, simulation.industry, simulation.status, ...simulation.agents, ...simulation.metrics, ...simulation.tags].join(' ').replaceAll('_', ' ').toLowerCase();
}

export default function SimulationRegistry(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState('all');
  const industries = [...new Set(registry.simulations.map((simulation) => simulation.industry))].sort();
  const matches = useMemo(() => registry.simulations.filter((simulation) => {
    const industryMatches = industry === 'all' || simulation.industry === industry;
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return industryMatches && terms.every((term) => searchableText(simulation).includes(term));
  }), [query, industry]);

  return <section className={styles.registry}>
    <div className={styles.filters}>
      <label><span>Search the registry</span><input type="search" value={query} placeholder="Try: employment, resident, budget…" onChange={(event) => setQuery(event.target.value)}/></label>
      <label><span>Industry</span><select value={industry} onChange={(event) => setIndustry(event.target.value)}><option value="all">All industries</option>{industries.map((value) => <option key={value} value={value}>{value.replaceAll('-', ' ')}</option>)}</select></label>
    </div>
    <div className={styles.count}>{matches.length} of {registry.simulations.length} simulations</div>
    <div className={styles.results}>
      {matches.map((simulation) => <article key={simulation.id}>
        <div className={styles.meta}><code>{simulation.id}</code><span>{simulation.industry}</span><span>{simulation.status}</span></div>
        <h2><Link to={simulation.route}>{simulation.title}</Link></h2>
        <p>{simulation.summary}</p>
        <div className={styles.tags}>{simulation.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <div className={styles.artifacts}><span>ODD {simulation.odd_version}</span><span>Model {simulation.model_version}</span><span>Browser model</span><span>PDF</span></div>
      </article>)}
      {matches.length === 0 && <p className={styles.empty}>No simulations match those terms.</p>}
    </div>
  </section>;
}
