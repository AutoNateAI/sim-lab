import React, {useMemo, useState} from 'react';
import {defaultConfig, runSimulation, type SimulationConfig, type WeekResult} from './simulation';
import styles from './simulator.module.css';

const series: Array<{key: keyof WeekResult; label: string; color: string}> = [
  {key: 'aware', label: 'Aware', color: '#42a5f5'},
  {key: 'training', label: 'In training', color: '#ffb74d'},
  {key: 'trained', label: 'Trained', color: '#ab7df6'},
  {key: 'employed', label: 'Employed', color: '#5ee6b8'},
];

function pathFor(results: WeekResult[], key: keyof WeekResult, population: number): string {
  return results.map((row, index) => {
    const x = (index / (results.length - 1)) * 100;
    const y = 100 - (Number(row[key]) / population) * 100;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function Control({label, value, min, max, step, display, onChange}: {label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void}) {
  return <label className={styles.control}><span>{label}<strong>{display}</strong></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))}/></label>;
}

export default function CityOpportunitySimulator(): React.JSX.Element {
  const [config, setConfig] = useState<SimulationConfig>(defaultConfig);
  const results = useMemo(() => runSimulation(config), [config]);
  const final = results.at(-1)!;
  const update = (key: keyof SimulationConfig, value: number) => setConfig((current) => ({...current, [key]: value}));

  return <div className={styles.simulator} data-testid="city-opportunity-simulator">
    <div className={styles.header}><div><span>SEEDED AGENT MODEL</span><h2>Budget → awareness → skills → work</h2></div><button type="button" onClick={() => setConfig(defaultConfig)}>Reset model</button></div>
    <div className={styles.controls} data-testid="simulation-controls">
      <Control label="Program budget" value={config.budget} min={250000} max={1500000} step={50000} display={`$${(config.budget / 1000).toFixed(0)}k`} onChange={(value) => update('budget', value)}/>
      <Control label="Weekly outreach" value={config.outreachRate} min={0.02} max={0.2} step={0.01} display={`${Math.round(config.outreachRate * 100)}%`} onChange={(value) => update('outreachRate', value)}/>
      <Control label="Training seats" value={config.trainingSeats} min={12} max={80} step={4} display={`${config.trainingSeats}`} onChange={(value) => update('trainingSeats', value)}/>
      <Control label="Employer openings" value={config.jobOpenings} min={20} max={180} step={10} display={`${config.jobOpenings}`} onChange={(value) => update('jobOpenings', value)}/>
    </div>
    <div className={styles.metrics} data-testid="simulation-results">
      <div><span>Residents reached</span><strong>{config.population - final.unaware}</strong><small>{Math.round(((config.population - final.unaware) / config.population) * 100)}% of population</small></div>
      <div><span>Completed training</span><strong>{final.trained + final.employed}</strong><small>{final.training} still enrolled</small></div>
      <div><span>Employed</span><strong>{final.employed}</strong><small>{Math.round((final.employed / config.population) * 100)}% of population</small></div>
      <div><span>Budget remaining</span><strong>${Math.round(final.budgetRemaining / 1000)}k</strong><small>after {config.weeks} weeks</small></div>
    </div>
    <div className={styles.chartWrap}>
      <div className={styles.legend}>{series.map((item) => <span key={item.label}><i style={{background: item.color}}/>{item.label}</span>)}</div>
      <svg className={styles.chart} viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Resident outcomes over sixteen weeks">
        {[0, 25, 50, 75, 100].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} className={styles.gridline}/>) }
        {series.map((item) => <path key={item.label} d={pathFor(results, item.key, config.population)} fill="none" stroke={item.color} strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>) }
      </svg>
      <div className={styles.axis}><span>Week 0</span><span>Week {config.weeks}</span></div>
    </div>
    <p className={styles.note}>Same settings + seed 42 = same outcome. This makes comparisons inspectable and repeatable.</p>
  </div>;
}
