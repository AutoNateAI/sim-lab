import React, {useCallback, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {dashboardRuns, type AgentRow, type DashboardRun} from './data';
import {PhaserReplay} from './PhaserReplay';
import {GR_VENUES, GR_WARDS, GR_CENSUS_ARCHETYPES} from './gr-geodata';
import * as Sounds from './sounds';
import './styles.css';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const CLOCK_STEP_MINUTES = 15;

type Status = AgentRow['status'];
type DrawerTab = 'simulation' | 'agents' | 'programs' | 'city';
type ModalTab = 'overview' | 'agents' | 'beats' | 'config' | 'realtime';

const STATUS_COLORS: Record<Status, string> = {
  unaware: '#4e6680',
  aware: '#00d4ff',
  training: '#ffb800',
  trained: '#b56bff',
  employed: '#00ff88',
};

const STATUS_LABELS: Record<Status, string> = {
  unaware: 'Unaware',
  aware: 'Aware',
  training: 'Training',
  trained: 'Trained',
  employed: 'Employed',
};

const STATUS_ORDER: Status[] = ['unaware', 'aware', 'training', 'trained', 'employed'];

// ─── ANALYTICS ───────────────────────────────────────────────────────────────

function countByStatus(rows: AgentRow[]): Record<Status, number> {
  return rows.reduce<Record<Status, number>>(
    (acc, row) => { acc[row.status] += 1; return acc; },
    {unaware: 0, aware: 0, training: 0, trained: 0, employed: 0},
  );
}

function currentRows(run: DashboardRun, week: number): AgentRow[] {
  return run.agentRows.filter((r) => r.week === week);
}

function agentHistory(run: DashboardRun, agentId: string): AgentRow[] {
  return run.agentRows.filter((r) => r.agent_id === agentId).sort((a, b) => a.week - b.week);
}

function weightedBottleNeck(run: DashboardRun): string {
  const final = run.weeks.at(-1)!;
  if (final.budgetRemaining <= 0 && final.training < run.config.training_seats) return 'Budget';
  if (final.training >= run.config.training_seats && final.employed < run.config.job_openings) return 'Training capacity';
  if (final.employed < final.trained && final.jobsRemaining > 0) return 'Employer demand';
  const residentsReached = run.config.population - final.unaware;
  if (residentsReached < run.config.population * 0.9) return 'Outreach';
  return 'Mixed constraint';
}

function strategyRecommendation(run: DashboardRun): string {
  switch (weightedBottleNeck(run)) {
    case 'Budget': return 'Budget ran out before the pipeline finished. Preserve dollars for the highest-leverage channel or shorten the intervention window.';
    case 'Training capacity': return 'The system is seat-constrained. Add seats before adding more outreach, or the outreach lift will clog the pipeline.';
    case 'Employer demand': return 'Converting residents into trained candidates faster than openings appear. Add employer partnerships, matching events, or placement incentives.';
    case 'Outreach': return 'The supply of aware residents is too low. Increase outreach or local targeting before expanding downstream capacity.';
    default: return 'The system is balancing multiple constraints. Compare this run against a lever change before assuming the bottleneck is fixed.';
  }
}

function strategyPowers(run: DashboardRun, baseline: DashboardRun) {
  const gains = {
    employed: run.metrics.employed - baseline.metrics.employed,
    trained: run.metrics.completedTraining - baseline.metrics.completedTraining,
    reached: run.metrics.residentsReached - baseline.metrics.residentsReached,
    budget: run.metrics.budgetRemaining - baseline.metrics.budgetRemaining,
  };
  return [
    {label: 'Transit boost', value: 1 + Math.min(0.5, Math.max(0, gains.reached) / 220), detail: 'Outreach coverage accelerates agent movement.'},
    {label: 'Placement lift', value: 1 + Math.min(0.45, Math.max(0, gains.employed) / 120), detail: 'More openings turn trained residents into visible motion.'},
    {label: 'Activation pulse', value: 1 + Math.min(0.35, Math.max(0, gains.trained) / 160), detail: 'Training throughput improves replay density.'},
    {label: 'Resource buffer', value: 1 + Math.min(0.25, Math.max(0, gains.budget) / 400_000), detail: 'Preserved budget keeps the intervention alive longer.'},
  ];
}

function miniTrend(values: number[], height = 64, width = 280): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const step = width / Math.max(values.length - 1, 1);
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(i * step)} ${Math.round(height - (v / max) * height)}`).join(' ');
}

function miniArea(values: number[], height = 64, width = 280): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const step = width / Math.max(values.length - 1, 1);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(i * step)} ${Math.round(height - (v / max) * height)}`).join(' ');
  return `${line} L ${width} ${height} L 0 ${height} Z`;
}

function parseBlockers(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return raw ? [raw] : []; }
}

// ─── PROGRAM CATALOG ─────────────────────────────────────────────────────────

type Program = {
  id: string;
  name: string;
  icon: string;
  kind: 'outreach' | 'training' | 'employer' | 'social' | 'transit';
  cost: number;
  description: string;
  effects: Partial<Record<string, number>>;
  color: string;
};

const PROGRAMS: Program[] = [
  {
    id: 'mobile-unit',
    name: 'Mobile Outreach Unit',
    icon: '🚌',
    kind: 'outreach',
    cost: 25000,
    description: 'Deploy a mobile workforce van to underserved neighborhoods — doubles outreach reach for 2 weeks',
    effects: {outreach_rate: 0.15},
    color: '#00d4ff',
  },
  {
    id: 'training-blitz',
    name: 'Training Blitz',
    icon: '🎓',
    kind: 'training',
    cost: 48000,
    description: 'Emergency cohort — adds 18 temporary training seats for 4 weeks',
    effects: {training_seats: 18},
    color: '#ffb800',
  },
  {
    id: 'employer-summit',
    name: 'Employer Summit',
    icon: '🤝',
    kind: 'employer',
    cost: 15000,
    description: 'One-day event at DeVos Place — unlocks 20 additional job commitments',
    effects: {job_openings: 20},
    color: '#00ff88',
  },
  {
    id: 'coffee-chats',
    name: 'Coffee Chats Program',
    icon: '☕',
    kind: 'social',
    cost: 8000,
    description: 'Structured 1-on-1 mentorship over coffee — boosts confidence and peer support',
    effects: {confidence: 12, peer_support: 0.18},
    color: '#d4813a',
  },
  {
    id: 'transit-pass',
    name: 'Transit Pass Initiative',
    icon: '🚇',
    kind: 'transit',
    cost: 12000,
    description: 'Free GRATA passes for enrolled residents — eliminates transportation pressure',
    effects: {transportation_pressure: -0.6},
    color: '#b56bff',
  },
  {
    id: 'networking-night',
    name: 'Networking Night',
    icon: '🌃',
    kind: 'social',
    cost: 6000,
    description: 'Evening mixer at The Intersection — builds employer_contact and mentor_contact flags',
    effects: {employer_contact: 0.35, mentor_contact: 0.25},
    color: '#ff7e5f',
  },
];

// ─── FAKE LIVE EVENT FEED ─────────────────────────────────────────────────────

type LiveEvent = {id: number; time: string; text: string; color: string; week: number};

function generateEvents(run: DashboardRun, week: number): LiveEvent[] {
  const rows = currentRows(run, week);
  const events: LiveEvent[] = [];
  let id = 0;

  const employed = rows.filter((r) => r.status === 'employed').slice(0, 3);
  const training = rows.filter((r) => r.status === 'training').slice(0, 2);
  const stressed = rows.filter((r) => r.stress > 0.7).slice(0, 2);

  employed.forEach((r) => {
    events.push({id: id++, time: `Wk ${week}`, text: `${r.agent_id.replace('resident_', 'R-')} landed a ${r.job_archetype_id.replaceAll('_', ' ')} role`, color: '#00ff88', week});
  });
  training.forEach((r) => {
    events.push({id: id++, time: `Wk ${week}`, text: `${r.agent_id.replace('resident_', 'R-')} started training (${r.current_subgoal})`, color: '#ffb800', week});
  });
  stressed.forEach((r) => {
    events.push({id: id++, time: `Wk ${week}`, text: `${r.agent_id.replace('resident_', 'R-')} flagged high stress — ${parseBlockers(r.blockers)[0] ?? 'multiple pressures'}`, color: '#ff2d6b', week});
  });

  return events.reverse().slice(0, 8);
}

// ─── DYNAMIC CLOCK SPEED ──────────────────────────────────────────────────────

function clockIntervalMs(day: number, hour: number): number {
  const isWeekend = day >= 5;
  const isNight = hour >= 20 || hour < 6;
  if (isWeekend) return 30;
  if (isNight) return 40;
  return 120;
}

function clockSpeedLabel(day: number, hour: number): string | null {
  if (day >= 5) return '4× weekend';
  if (hour >= 20 || hour < 6) return '3× night';
  return null;
}

// ─── NEWLY EMPLOYED DETECTION ─────────────────────────────────────────────────

type NewlyEmployed = {
  agentId: string;
  fromStatus: string;
  jobArchetype: string;
  employer: string;
  program: string;
  neighborhood: string;
  archetype: string;
};

function findNewlyEmployed(run: DashboardRun, week: number): NewlyEmployed[] {
  if (week === 0) return [];
  const cur = run.agentRows.filter((r) => r.week === week);
  const prev = run.agentRows.filter((r) => r.week === week - 1);
  return cur
    .filter((agent) => {
      const prevRow = prev.find((r) => r.agent_id === agent.agent_id);
      return agent.status === 'employed' && prevRow?.status !== 'employed';
    })
    .map((agent) => ({
      agentId: agent.agent_id,
      fromStatus: prev.find((r) => r.agent_id === agent.agent_id)?.status ?? 'unknown',
      jobArchetype: agent.job_archetype_id ?? 'unknown',
      employer: agent.assigned_job_destination_id ?? '—',
      program: agent.assigned_program_id ?? '—',
      neighborhood: agent.neighborhood_id ?? '—',
      archetype: agent.resident_archetype ?? '—',
    }));
}

// ─── JOURNEY PANEL ────────────────────────────────────────────────────────────

function AgentJourney({run, agentId}: {run: DashboardRun; agentId: string}): React.JSX.Element {
  const history = agentHistory(run, agentId);
  if (history.length === 0) return <div className="empty-state"><div className="empty-state-icon">🔍</div><p>No history found for this agent.</p></div>;

  const transitions: Array<{week: number; from: string; to: string; row: AgentRow}> = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]!;
    const curr = history[i]!;
    if (prev.status !== curr.status || curr.stress > 0.75 || curr.interaction_count > prev.interaction_count + 2) {
      transitions.push({week: curr.week, from: prev.status, to: curr.status, row: curr});
    }
  }

  const latest = history.at(-1)!;

  return (
    <div className="agent-journey">
      <div className="agent-detail-grid" style={{marginBottom: 12}}>
        <div className="agent-cell">
          <div className="agent-cell-label">Current status</div>
          <div className="agent-cell-value" style={{color: STATUS_COLORS[latest.status]}}>{STATUS_LABELS[latest.status]}</div>
        </div>
        <div className="agent-cell">
          <div className="agent-cell-label">Archetype</div>
          <div className="agent-cell-value">{latest.resident_archetype.replaceAll('_', ' ')}</div>
        </div>
        <div className="agent-cell">
          <div className="agent-cell-label">Neighborhood</div>
          <div className="agent-cell-value">{latest.neighborhood_id.replaceAll('_', ' ')}</div>
        </div>
        <div className="agent-cell">
          <div className="agent-cell-label">Goal</div>
          <div className="agent-cell-value" style={{fontSize: '0.75rem', lineHeight: 1.4}}>{latest.goal}</div>
        </div>
      </div>

      <div className="pressure-bars">
        {[
          {key: 'money', label: 'Money pressure', value: latest.money_pressure},
          {key: 'transport', label: 'Transport', value: latest.transportation_pressure},
          {key: 'family', label: 'Family', value: latest.family_pressure},
          {key: 'stress', label: 'Stress', value: latest.stress},
          {key: 'energy', label: 'Energy', value: 1 - latest.energy},
        ].map(({key, label, value}) => (
          <div className="pressure-row" key={key}>
            <div className="pressure-label-row">
              <span>{label}</span>
              <span style={{color: value > 0.7 ? '#ff2d6b' : value > 0.4 ? '#ffb800' : '#00ff88'}}>{Math.round(value * 100)}%</span>
            </div>
            <div className="pressure-track">
              <div className={`pressure-fill ${key}`} style={{width: `${Math.round(value * 100)}%`}} />
            </div>
          </div>
        ))}
      </div>

      <div style={{marginTop: 12}}>
        <div className="drawer-label">Journey events</div>
        <div className="journey-timeline">
          {transitions.length === 0 && (
            <div className="journey-event">
              <div className="journey-event-week">Wk 0 → {history.length - 1}</div>
              <div className="journey-event-title">Remained {latest.status}</div>
              <div className="journey-event-detail">Agent maintained status throughout the simulation window.</div>
            </div>
          )}
          {transitions.map((t, i) => {
            const isStatusChange = t.from !== t.to;
            const isInteraction = !isStatusChange && t.row.interaction_count > 0;
            const cls = isStatusChange ? 'journey-event status-change' : isInteraction ? 'journey-event interaction' : 'journey-event blocker';
            return (
              <div key={i} className={cls}>
                <div className="journey-event-week">Week {t.week}</div>
                <div className="journey-event-title">
                  {isStatusChange ? `${STATUS_LABELS[t.from as Status]} → ${STATUS_LABELS[t.to as Status]}` : isInteraction ? `${t.row.interaction_count} interactions this week` : `Stress spike: ${Math.round(t.row.stress * 100)}%`}
                </div>
                <div className="journey-event-detail">
                  {t.row.current_subgoal} · {parseBlockers(t.row.blockers).join(', ') || 'no blockers'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{marginTop: 12}}>
        <div className="drawer-label">Social capital</div>
        <div className="agent-detail-grid">
          <div className="agent-cell">
            <div className="agent-cell-label">Interactions</div>
            <div className="agent-cell-value">{latest.interaction_count}</div>
          </div>
          <div className="agent-cell">
            <div className="agent-cell-label">Peer support</div>
            <div className="agent-cell-value">{Math.round(latest.peer_support * 100)}%</div>
          </div>
          <div className="agent-cell">
            <div className="agent-cell-label">Mentor</div>
            <div className="agent-cell-value" style={{color: latest.mentor_contact ? '#00ff88' : '#4e6680'}}>{latest.mentor_contact ? 'Connected' : 'None'}</div>
          </div>
          <div className="agent-cell">
            <div className="agent-cell-label">Employer</div>
            <div className="agent-cell-value" style={{color: latest.employer_contact ? '#00ff88' : '#4e6680'}}>{latest.employer_contact ? 'Connected' : 'None'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

function Modal({
  run, selectedAgent, week, onSelectRun, onClose, onSelectAgent,
}: {
  run: DashboardRun; selectedAgent: AgentRow | null; week: number;
  onSelectRun: (run: DashboardRun) => void; onClose: () => void;
  onSelectAgent: (agentId: string) => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<ModalTab>('overview');
  const [agentsSubTab, setAgentsSubTab] = useState<'journey' | 'outcomes'>('journey');
  const [realtimeBudgetBoost, setRealtimeBudgetBoost] = useState(0);
  const [realtimeSeats, setRealtimeSeats] = useState(0);

  const rows = currentRows(run, week);
  const counts = countByStatus(rows);
  const narrative = run.narrative_beats ?? [];
  const recommendation = strategyRecommendation(run);
  const baseline = dashboardRuns.find((r) => r.scenario_id === 'baseline') ?? run;
  const deltaEmp = run.metrics.employed - baseline.metrics.employed;
  const deltaTrain = run.metrics.completedTraining - baseline.metrics.completedTraining;
  const bottleneck = weightedBottleNeck(run);
  const newlyEmployed = useMemo(() => findNewlyEmployed(run, week), [run, week]);
  const trendPath = miniTrend(run.weeks.map((w) => w.employed));
  const areaPath = miniArea(run.weeks.map((w) => w.employed));

  function switchTab(t: ModalTab): void {
    setTab(t);
    Sounds.playClick();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-label="Simulation insights" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="modal-header">
          <div className="modal-header-left">
            <div className="modal-eyebrow">
              <span className="run-status-dot" />
              Grand Rapids · City Opportunity Simulator
            </div>
            <h2>{run.label}</h2>
            <div className="modal-header-meta">{run.run_id} · Week {week} · {rows.length} agents</div>
          </div>
          <div className="modal-header-actions">
            <button type="button" className="ghost-button" onClick={onClose}>✕ Close</button>
          </div>
        </header>

        {/* Tabs */}
        <div className="modal-tabs">
          {(['overview', 'agents', 'beats', 'config', 'realtime'] as ModalTab[]).map((t) => (
            <button key={t} type="button" className={tab === t ? 'modal-tab active' : 'modal-tab'} onClick={() => switchTab(t)}>
              {t === 'overview' ? '📊 Overview' : t === 'agents' ? '👥 Agents' : t === 'beats' ? '📍 Narrative' : t === 'config' ? '⚙️ Config' : '🎛️ Live'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="modal-body">
          {tab === 'overview' && (
            <div className="modal-grid">
              <div className="modal-col">
                {/* Bottleneck */}
                <div className="modal-panel">
                  <div className="modal-panel-title">Primary Bottleneck</div>
                  <div className="bottleneck-callout">
                    <div className="bottleneck-label">Constraint</div>
                    <div className="bottleneck-value">{bottleneck}</div>
                    <div className="bottleneck-rec">{recommendation}</div>
                  </div>
                </div>

                {/* Stat Strip */}
                <div className="modal-panel">
                  <div className="modal-panel-title">Pipeline Summary</div>
                  <div className="stat-strip">
                    <div className="stat-cell">
                      <div className="stat-cell-label">Reached</div>
                      <div className="stat-cell-value">{run.metrics.residentsReached}</div>
                    </div>
                    <div className="stat-cell">
                      <div className="stat-cell-label">Trained</div>
                      <div className="stat-cell-value">{run.metrics.completedTraining}</div>
                    </div>
                    <div className="stat-cell">
                      <div className="stat-cell-label">Employed</div>
                      <div className="stat-cell-value" style={{color: '#00ff88'}}>{run.metrics.employed}</div>
                    </div>
                    <div className="stat-cell">
                      <div className="stat-cell-label">vs Baseline</div>
                      <div className="stat-cell-value" style={{color: deltaEmp >= 0 ? '#00ff88' : '#ff2d6b', fontSize: '1.2rem'}}>
                        {deltaEmp >= 0 ? '+' : ''}{deltaEmp}
                      </div>
                      <div className={`stat-cell-sub ${deltaTrain < 0 ? 'negative' : ''}`}>{deltaTrain >= 0 ? '+' : ''}{deltaTrain} trained</div>
                    </div>
                    <div className="stat-cell">
                      <div className="stat-cell-label">New This Week</div>
                      <div className="stat-cell-value" style={{color: newlyEmployed.length > 0 ? '#00ff88' : 'var(--text-dim)'}}>
                        {newlyEmployed.length > 0 ? `+${newlyEmployed.length}` : '—'}
                      </div>
                      <div className="stat-cell-sub">employed</div>
                    </div>
                  </div>
                </div>

                {/* Sparkline */}
                <div className="modal-panel">
                  <div className="modal-panel-title">Employment Trend</div>
                  <div className="sparkline-card" style={{background: 'transparent', border: 'none', padding: 0}}>
                    <div className="sparkline-head">
                      <span>Residents employed over simulation</span>
                      <span className="current-week">Week {week}</span>
                    </div>
                    <svg viewBox="0 0 280 64" className="sparkline" preserveAspectRatio="none" aria-hidden="true">
                      <defs>
                        <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={areaPath} className="sparkline-area" />
                      <path d={trendPath} className="sparkline-line" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="modal-col">
                {/* Status breakdown */}
                <div className="modal-panel">
                  <div className="modal-panel-title">Week {week} Status Breakdown</div>
                  <div className="status-grid">
                    {STATUS_ORDER.map((s) => (
                      <div key={s} className="status-chip" style={{borderColor: `${STATUS_COLORS[s]}33`}}>
                        <div className="status-dot" style={{background: STATUS_COLORS[s], boxShadow: `0 0 6px ${STATUS_COLORS[s]}66`}} />
                        <div className="status-chip-count">{counts[s]}</div>
                        <div className="status-chip-label">{STATUS_LABELS[s]}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scenario switcher */}
                <div className="modal-panel">
                  <div className="modal-panel-title">Scenario Comparison</div>
                  <div className="scenario-grid">
                    {dashboardRuns.map((r) => (
                      <button key={r.run_id} type="button"
                        className={r.run_id === run.run_id ? 'scenario-button active' : 'scenario-button'}
                        onClick={() => { onSelectRun(r); Sounds.playClick(); }}>
                        <strong>{r.label}</strong>
                        <span>{r.scenario_id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* City wards quick view */}
                <div className="modal-panel">
                  <div className="modal-panel-title">GR Ward Coverage</div>
                  <div style={{display: 'grid', gap: 6}}>
                    {GR_WARDS.map((w) => (
                      <div key={w.id} style={{display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--line)'}}>
                        <div style={{width: 8, height: 8, borderRadius: '50%', background: w.color, flexShrink: 0, boxShadow: `0 0 8px ${w.color}`}} />
                        <div style={{flex: 1}}>
                          <div style={{font: '600 0.78rem/1 Space Grotesk, sans-serif', color: 'var(--text)'}}>{w.name}</div>
                          <div style={{font: '400 0.65rem/1 DM Mono, monospace', color: 'var(--muted)', marginTop: 2}}>{w.commissioners.join(' · ')}</div>
                        </div>
                        <div style={{font: '700 0.72rem/1 DM Mono, monospace', color: 'var(--text-dim)'}}>{(w.population / 1000).toFixed(0)}k</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'agents' && (() => {
            const allWeekRows = currentRows(run, week);
            const employedRows = allWeekRows.filter((r) => r.status === 'employed');
            const notEmployedRows = allWeekRows.filter((r) => r.status !== 'employed');
            return (
              <div>
                {/* Sub-tab navigation */}
                <div style={{display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--line)', paddingBottom: 12}}>
                  {(['journey', 'outcomes'] as const).map((st) => (
                    <button key={st} type="button"
                      onClick={() => { setAgentsSubTab(st); Sounds.playClick(); }}
                      style={{
                        padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        font: '600 0.72rem/1 Space Grotesk, sans-serif',
                        background: agentsSubTab === st ? 'var(--cyan)' : 'var(--surface-3)',
                        color: agentsSubTab === st ? '#000' : 'var(--text-dim)',
                        transition: 'all 0.15s',
                      }}>
                      {st === 'journey' ? 'Journey Inspector' : `Outcomes · ${employedRows.length} employed`}
                    </button>
                  ))}
                </div>

                {agentsSubTab === 'journey' && (
                  <div className="modal-grid">
                    <div className="modal-col">
                      {/* Newly Employed Panel */}
                      <div className="modal-panel">
                        <div className="modal-panel-title" style={{display: 'flex', alignItems: 'center', gap: 8}}>
                          <span>Newly Employed This Week</span>
                          {newlyEmployed.length > 0 && (
                            <span style={{background: '#00ff8833', color: '#00ff88', border: '1px solid #00ff8866', borderRadius: 12, padding: '1px 8px', font: '700 0.65rem/1.6 DM Mono, monospace'}}>
                              +{newlyEmployed.length}
                            </span>
                          )}
                        </div>
                        {newlyEmployed.length === 0 ? (
                          <div className="empty-state" style={{padding: '16px 0'}}>
                            <div className="empty-state-icon">🏆</div>
                            <p style={{fontSize: '0.78rem'}}>No new transitions to employed this week.</p>
                          </div>
                        ) : (
                          <div style={{display: 'grid', gap: 6, maxHeight: 240, overflowY: 'auto'}}>
                            {newlyEmployed.map((agent) => (
                              <button key={agent.agentId} type="button"
                                onClick={() => { onSelectAgent(agent.agentId); Sounds.playClick(); }}
                                style={{
                                  display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, padding: '8px 10px',
                                  borderRadius: 8, background: 'var(--surface-3)', border: '1px solid #00ff8833',
                                  cursor: 'pointer', textAlign: 'left', width: '100%',
                                  transition: 'border-color 0.15s, background 0.15s',
                                }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#00ff88'; (e.currentTarget as HTMLElement).style.background = '#00ff8808'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#00ff8833'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}>
                                <div>
                                  <div style={{font: '700 0.75rem/1 Space Grotesk, sans-serif', color: '#00ff88'}}>
                                    {agent.agentId.replace('resident_', 'R-')}
                                  </div>
                                  <div style={{font: '400 0.62rem/1.5 DM Mono, monospace', color: 'var(--muted)', marginTop: 2}}>
                                    {agent.archetype.replaceAll('_', ' ')} · {agent.neighborhood.replaceAll('_', ' ')}
                                  </div>
                                  <div style={{font: '400 0.62rem/1.5 DM Mono, monospace', color: 'var(--text-dim)'}}>
                                    {agent.jobArchetype.replaceAll('_', ' ')} · via {agent.program !== '—' ? agent.program : 'direct'}
                                  </div>
                                </div>
                                <div style={{textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2}}>
                                  <div style={{font: '500 0.6rem/1 DM Mono, monospace', color: 'var(--muted)', textTransform: 'uppercase'}}>from</div>
                                  <div style={{font: '600 0.7rem/1 Space Grotesk, sans-serif', color: STATUS_COLORS[agent.fromStatus as Status] ?? 'var(--text-dim)'}}>
                                    {STATUS_LABELS[agent.fromStatus as Status] ?? agent.fromStatus}
                                  </div>
                                  <div style={{font: '500 0.6rem/1 DM Mono, monospace', color: 'var(--cyan)', marginTop: 2}}>View journey →</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="modal-panel">
                        <div className="modal-panel-title">{selectedAgent ? `Agent ${selectedAgent.agent_id}` : 'Select an Agent'}</div>
                        {selectedAgent ? (
                          <AgentJourney run={run} agentId={selectedAgent.agent_id} />
                        ) : (
                          <div className="empty-state">
                            <div className="empty-state-icon">👆</div>
                            <p>Click any agent card above or tap a dot on the city map to inspect their full journey.</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="modal-col">
                      <div className="modal-panel">
                        <div className="modal-panel-title">Census Archetypes in Simulation</div>
                        <div style={{display: 'grid', gap: 6}}>
                          {GR_CENSUS_ARCHETYPES.map((a) => {
                            const count = Math.round(run.config.population * a.shareOfPop);
                            return (
                              <div key={a.archetype} style={{display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--line)'}}>
                                <div style={{fontSize: '1.1rem', flexShrink: 0}}>{a.icon}</div>
                                <div style={{flex: 1}}>
                                  <div style={{font: '600 0.78rem/1 Space Grotesk, sans-serif', color: 'var(--text)'}}>{a.label}</div>
                                  <div style={{font: '400 0.62rem/1 DM Mono, monospace', color: 'var(--muted)', marginTop: 2}}>
                                    Median income ${(a.medianIncome / 1000).toFixed(0)}k · Age {a.medianAge}
                                  </div>
                                </div>
                                <div style={{textAlign: 'right'}}>
                                  <div style={{font: '700 0.88rem/1 Space Grotesk, sans-serif', color: a.color}}>{count}</div>
                                  <div style={{font: '500 0.62rem/1 DM Mono, monospace', color: 'var(--muted)'}}>{Math.round(a.shareOfPop * 100)}%</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="modal-panel">
                        <div className="modal-panel-title">Social Venues Active</div>
                        <div className="venue-badges">
                          {GR_VENUES.filter((v) => ['coffee', 'bar', 'club', 'network'].includes(v.kind)).map((v) => (
                            <div key={v.id} className={`venue-badge ${v.kind}`}>
                              {v.kind === 'coffee' ? '☕' : v.kind === 'bar' ? '🍺' : v.kind === 'club' ? '🎵' : '🤝'} {v.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {agentsSubTab === 'outcomes' && (
                  <div className="modal-grid">
                    {/* Employed column */}
                    <div className="modal-col">
                      <div className="modal-panel">
                        <div className="modal-panel-title" style={{display: 'flex', alignItems: 'center', gap: 8}}>
                          <span>Employed</span>
                          <span style={{background: '#00ff8822', color: '#00ff88', border: '1px solid #00ff8844', borderRadius: 12, padding: '1px 8px', font: '700 0.65rem/1.6 DM Mono, monospace'}}>
                            {employedRows.length}
                          </span>
                        </div>
                        <div style={{display: 'grid', gap: 5, maxHeight: 480, overflowY: 'auto'}}>
                          {employedRows.map((r) => (
                            <button key={r.agent_id} type="button"
                              onClick={() => { onSelectAgent(r.agent_id); setAgentsSubTab('journey'); Sounds.playClick(); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                                borderRadius: 7, background: 'var(--surface-3)', border: '1px solid #00ff8822',
                                cursor: 'pointer', textAlign: 'left', width: '100%',
                              }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#00ff88'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#00ff8822'; }}>
                              <div style={{width: 8, height: 8, borderRadius: '50%', background: '#00ff88', flexShrink: 0}} />
                              <div style={{flex: 1, minWidth: 0}}>
                                <div style={{font: '600 0.72rem/1 Space Grotesk, sans-serif', color: '#00ff88'}}>
                                  {r.agent_id.replace('resident_', 'R-')}
                                </div>
                                <div style={{font: '400 0.6rem/1.4 DM Mono, monospace', color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                  {r.resident_archetype.replaceAll('_', ' ')} · {r.job_archetype_id.replaceAll('_', ' ')}
                                </div>
                              </div>
                              <div style={{font: '500 0.58rem/1 DM Mono, monospace', color: 'var(--cyan)', flexShrink: 0}}>view →</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Not yet employed column */}
                    <div className="modal-col">
                      <div className="modal-panel">
                        <div className="modal-panel-title" style={{display: 'flex', alignItems: 'center', gap: 8}}>
                          <span>Still in Pipeline</span>
                          <span style={{background: '#ff2d6b22', color: '#ff2d6b', border: '1px solid #ff2d6b44', borderRadius: 12, padding: '1px 8px', font: '700 0.65rem/1.6 DM Mono, monospace'}}>
                            {notEmployedRows.length}
                          </span>
                        </div>
                        <div style={{display: 'grid', gap: 5, maxHeight: 480, overflowY: 'auto'}}>
                          {notEmployedRows.map((r) => (
                            <button key={r.agent_id} type="button"
                              onClick={() => { onSelectAgent(r.agent_id); setAgentsSubTab('journey'); Sounds.playClick(); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                                borderRadius: 7, background: 'var(--surface-3)', border: `1px solid ${STATUS_COLORS[r.status]}22`,
                                cursor: 'pointer', textAlign: 'left', width: '100%',
                              }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = STATUS_COLORS[r.status]; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = `${STATUS_COLORS[r.status]}22`; }}>
                              <div style={{width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[r.status], flexShrink: 0}} />
                              <div style={{flex: 1, minWidth: 0}}>
                                <div style={{font: '600 0.72rem/1 Space Grotesk, sans-serif', color: STATUS_COLORS[r.status]}}>
                                  {r.agent_id.replace('resident_', 'R-')}
                                </div>
                                <div style={{font: '400 0.6rem/1.4 DM Mono, monospace', color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                  {STATUS_LABELS[r.status]} · {r.resident_archetype.replaceAll('_', ' ')}
                                  {r.stress > 0.7 ? ' · stressed' : ''}
                                </div>
                              </div>
                              <div style={{font: '500 0.58rem/1 DM Mono, monospace', color: 'var(--cyan)', flexShrink: 0}}>view →</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {tab === 'beats' && (
            <div style={{maxWidth: 720, margin: '0 auto'}}>
              <div className="modal-panel">
                <div className="modal-panel-title">Narrative Beats</div>
                <div className="beat-list">
                  {(narrative.length > 0 ? narrative : [{week: 0, title: 'Simulation initialized', explanation: 'All 240 residents begin in the unaware state. Outreach budget begins depleting as the model runs.'}]).map((beat, i) => (
                    <article key={i} className="beat">
                      <div className="beat-week">Week {beat.week}</div>
                      <div className="beat-title">{beat.title}</div>
                      <div className="beat-explanation">{beat.explanation}</div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'config' && (
            <div className="modal-grid">
              <div className="modal-col">
                <div className="modal-panel">
                  <div className="modal-panel-title">Run Configuration</div>
                  <div className="config-grid">
                    <div className="config-cell">
                      <div className="config-cell-label">Budget</div>
                      <div className="config-cell-value">${(run.config.budget / 1000).toFixed(0)}k</div>
                    </div>
                    <div className="config-cell">
                      <div className="config-cell-label">Outreach rate</div>
                      <div className="config-cell-value">{Math.round(run.config.outreach_rate * 100)}%</div>
                    </div>
                    <div className="config-cell">
                      <div className="config-cell-label">Training seats</div>
                      <div className="config-cell-value">{run.config.training_seats}</div>
                    </div>
                    <div className="config-cell">
                      <div className="config-cell-label">Job openings</div>
                      <div className="config-cell-value">{run.config.job_openings}</div>
                    </div>
                    <div className="config-cell">
                      <div className="config-cell-label">Population</div>
                      <div className="config-cell-value">{run.config.population}</div>
                    </div>
                    <div className="config-cell">
                      <div className="config-cell-label">Seed</div>
                      <div className="config-cell-value" style={{font: '700 0.9rem/1 DM Mono, monospace'}}>{run.config.seed}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-col">
                <div className="modal-panel">
                  <div className="modal-panel-title">Outcome Summary</div>
                  <div className="config-grid">
                    <div className="config-cell">
                      <div className="config-cell-label">Budget left</div>
                      <div className="config-cell-value" style={{color: run.metrics.budgetRemaining < 50000 ? '#ff2d6b' : '#00ff88'}}>
                        ${(run.metrics.budgetRemaining / 1000).toFixed(0)}k
                      </div>
                    </div>
                    <div className="config-cell">
                      <div className="config-cell-label">Jobs left</div>
                      <div className="config-cell-value">{run.metrics.jobsRemaining}</div>
                    </div>
                    <div className="config-cell">
                      <div className="config-cell-label">Bottleneck</div>
                      <div className="config-cell-value" style={{fontSize: '0.8rem'}}>{bottleneck}</div>
                    </div>
                    <div className="config-cell">
                      <div className="config-cell-label">Run folder</div>
                      <div className="config-cell-value" style={{font: '600 0.68rem/1.3 DM Mono, monospace', wordBreak: 'break-all'}}>{run.artifacts.root}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'realtime' && (
            <div className="modal-grid">
              <div className="modal-col">
                <div className="modal-panel">
                  <div className="modal-panel-title">Live Levers</div>
                  <div className="realtime-controls">
                    <div className="realtime-controls-title">Budget injection</div>
                    <div className="realtime-slider-row">
                      <div className="realtime-slider-label">Additional budget <span>+${(realtimeBudgetBoost * 1000).toFixed(0)}k</span></div>
                      <input type="range" min={0} max={200} step={10} value={realtimeBudgetBoost} onChange={(e) => setRealtimeBudgetBoost(Number(e.target.value))} />
                    </div>
                    <div className="realtime-slider-row">
                      <div className="realtime-slider-label">Emergency seats <span>+{realtimeSeats} seats</span></div>
                      <input type="range" min={0} max={36} step={6} value={realtimeSeats} onChange={(e) => setRealtimeSeats(Number(e.target.value))} />
                    </div>
                    <button type="button" className="primary-button" onClick={() => { Sounds.playProgramDrop(); }}>
                      🚀 Apply to simulation
                    </button>
                  </div>
                </div>

                <div className="modal-panel">
                  <div className="modal-panel-title">Drop a Program</div>
                  <div style={{display: 'grid', gap: 6}}>
                    {PROGRAMS.map((p) => (
                      <div key={p.id} className="program-item" onClick={() => Sounds.playProgramDrop()}>
                        <div className="program-item-icon" style={{background: `${p.color}18`, border: `1px solid ${p.color}33`}}>{p.icon}</div>
                        <div className="program-item-info">
                          <div className="program-item-name">{p.name}</div>
                          <div className="program-item-desc">{p.description}</div>
                        </div>
                        <div className="program-item-cost">${(p.cost / 1000).toFixed(0)}k</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-col">
                <div className="modal-panel">
                  <div className="modal-panel-title">Strategy Powers</div>
                  <div style={{display: 'grid', gap: 8}}>
                    {strategyPowers(run, baseline).map((power) => (
                      <div key={power.label} style={{padding: '11px 14px', borderRadius: 12, background: 'var(--surface-3)', border: '1px solid var(--line)'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4}}>
                          <span style={{font: '600 0.82rem/1 Space Grotesk, sans-serif', color: 'var(--text)'}}>{power.label}</span>
                          <span style={{font: '700 0.8rem/1 DM Mono, monospace', color: 'var(--cyan)'}}>{power.value.toFixed(2)}×</span>
                        </div>
                        <div style={{font: '400 0.72rem/1.4 Space Grotesk, sans-serif', color: 'var(--muted)'}}>{power.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── DRAWER ───────────────────────────────────────────────────────────────────

function Drawer({
  run, week, day, hour, onWeekChange, onOpenModal,
  followedAgents, zoom, onZoomChange, isPlaying, onTogglePlay,
  theme, onToggleTheme, soundOn, onToggleSound,
}: {
  run: DashboardRun; week: number; day: number; hour: number;
  onWeekChange: (v: number) => void; onOpenModal: () => void;
  followedAgents: AgentRow[]; zoom: number; onZoomChange: (z: number) => void;
  isPlaying: boolean; onTogglePlay: () => void;
  theme: 'light' | 'dark'; onToggleTheme: () => void;
  soundOn: boolean; onToggleSound: () => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<DrawerTab>('simulation');
  const displayHour = Math.floor(hour);
  const displayMinute = Math.round((hour - displayHour) * 60) % 60;
  const weekRows = currentRows(run, week);
  const counts = countByStatus(weekRows);
  const events = useMemo(() => generateEvents(run, week), [run, week]);
  const maxWeek = run.weeks.at(-1)?.week ?? 0;

  function handleTab(t: DrawerTab): void { setTab(t); Sounds.playClick(); }

  return (
    <aside className="drawer">
      {/* Brand */}
      <div className="brand">
        <div className="brand-eyebrow">AutoNateAI · Sim Lab</div>
        <strong>City Opportunity Simulator</strong>
        <span className="brand-sub">Grand Rapids, MI · Digital Twin</span>
      </div>

      {/* Tabs */}
      <div className="drawer-tabs">
        {(['simulation', 'agents', 'programs', 'city'] as DrawerTab[]).map((t) => (
          <button key={t} type="button" className={tab === t ? 'drawer-tab active' : 'drawer-tab'} onClick={() => handleTab(t)}>
            {t === 'simulation' ? 'Sim' : t === 'agents' ? 'Agents' : t === 'programs' ? 'Programs' : 'City'}
          </button>
        ))}
      </div>

      <div className="drawer-scroll">
        {tab === 'simulation' && (
          <>
            {/* Vital panel */}
            <section className="drawer-panel">
              <div className="drawer-label">Live simulation</div>
              <div className="vital-heading">
                <div>
                  <h2 style={{margin: 0, font: '700 0.95rem/1.2 Space Grotesk, sans-serif'}}>{run.label}</h2>
                  <div className="time-display">Wk {week} · Day {day + 1} · {String(displayHour).padStart(2, '0')}:{String(displayMinute).padStart(2, '0')}</div>
                </div>
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4}}>
                  <span className={isPlaying ? 'live-badge' : 'live-badge paused'}>{isPlaying ? 'Live' : 'Paused'}</span>
                  {isPlaying && clockSpeedLabel(day, hour) && (
                    <span style={{font: '600 0.6rem/1 DM Mono, monospace', color: '#ffb800', background: '#ffb80022', border: '1px solid #ffb80044', borderRadius: 4, padding: '2px 6px'}}>
                      {day >= 5 ? '📅' : '🌙'} {clockSpeedLabel(day, hour)}
                    </span>
                  )}
                </div>
              </div>
              <div className="vital-grid">
                <div className="vital-cell">
                  <div className="cell-label">Employed</div>
                  <div className="cell-value" style={{color: '#00ff88'}}>{run.metrics.employed}</div>
                </div>
                <div className="vital-cell">
                  <div className="cell-label">Training</div>
                  <div className="cell-value" style={{color: '#ffb800'}}>{run.metrics.completedTraining}</div>
                </div>
                <div className="vital-cell">
                  <div className="cell-label">Reached</div>
                  <div className="cell-value">{run.metrics.residentsReached}</div>
                </div>
                <div className="vital-cell">
                  <div className="cell-label">Budget</div>
                  <div className="cell-value" style={{color: run.metrics.budgetRemaining < 100000 ? '#ff2d6b' : 'var(--text)'}}>
                    ${(run.metrics.budgetRemaining / 1000).toFixed(0)}k
                  </div>
                </div>
              </div>
              <div className="control-stack">
                <button type="button" className="primary-button" onClick={() => { onTogglePlay(); isPlaying ? Sounds.playPause() : Sounds.playResume(); }}>
                  {isPlaying ? '⏸ Pause' : '▶ Resume'} Simulation
                </button>
                <button type="button" className="secondary-button" onClick={() => { onOpenModal(); Sounds.playModalOpen(); }}>
                  📊 Open Report & Analysis
                </button>
              </div>
            </section>

            {/* Clock / Timeline */}
            <section className="drawer-panel timeline-panel">
              <div className="drawer-label">City clock</div>
              <div className="timeline-track">
                <input type="range" min={0} max={maxWeek} value={week}
                  onChange={(e) => { onWeekChange(Number(e.target.value)); Sounds.playWeekTick(); }} />
                <div className="week-readout">
                  <span>Wk 0</span>
                  <strong>Week {week}</strong>
                  <span>Wk {maxWeek}</span>
                </div>
                <div className="week-ticks">
                  {Array.from({length: maxWeek + 1}, (_, i) => <div key={i} className="week-tick" style={{background: i === week ? 'var(--cyan)' : undefined}} />)}
                </div>
              </div>
            </section>

            {/* Current week status bars */}
            <section className="drawer-panel">
              <div className="drawer-label">Week {week} · status</div>
              <div style={{display: 'grid', gap: 5}}>
                {STATUS_ORDER.map((s) => (
                  <div key={s} style={{display: 'flex', alignItems: 'center', gap: 8}}>
                    <div style={{width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[s], flexShrink: 0}} />
                    <div style={{flex: 1, font: '500 0.7rem/1 DM Mono, monospace', color: 'var(--text-dim)'}}>{STATUS_LABELS[s]}</div>
                    <div style={{width: 80, height: 4, borderRadius: 2, background: 'var(--surface-3)', overflow: 'hidden'}}>
                      <div style={{height: '100%', width: `${(counts[s] / (weekRows.length || 1)) * 100}%`, background: STATUS_COLORS[s], borderRadius: 2, transition: 'width 400ms ease'}} />
                    </div>
                    <div style={{font: '700 0.72rem/1 DM Mono, monospace', color: 'var(--text)', minWidth: 24, textAlign: 'right'}}>{counts[s]}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Scenario switcher */}
            <section className="drawer-panel">
              <div className="drawer-label">Scenario</div>
              <div className="scenario-grid">
                {dashboardRuns.map((r) => (
                  <button key={r.run_id} type="button"
                    className={r.run_id === run.run_id ? 'scenario-button active' : 'scenario-button'}
                    onClick={() => Sounds.playClick()}>
                    <strong>{r.label}</strong>
                    <span>{r.scenario_id}</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === 'agents' && (
          <>
            <section className="drawer-panel follow-panel">
              <div className="drawer-label">Agent tracking</div>
              {followedAgents.length > 0 ? (
                <>
                  <div className="follow-summary">
                    <div className="follow-count-badge">{followedAgents.length} tracked</div>
                    <span style={{font: '500 0.68rem/1 DM Mono, monospace', color: 'var(--muted)'}}>Shift+click to add</span>
                  </div>
                  <div className="follow-list">
                    {followedAgents.map((a) => (
                      <div key={a.agent_id} className="follow-card" data-status={a.status}>
                        <div className="follow-card-head">
                          <div className="follow-card-id">{a.agent_id.replace('resident_', 'R-')}</div>
                          <div className="follow-card-status" data-status={a.status}>{STATUS_LABELS[a.status]}</div>
                        </div>
                        <div className="follow-card-goal">{a.current_subgoal}</div>
                        <div className="follow-card-blockers">{parseBlockers(a.blockers).join(' · ')}</div>
                      </div>
                    ))}
                  </div>
                  <div className="zoom-controls" style={{marginTop: 10}}>
                    <button type="button" className="icon-button" onClick={() => onZoomChange(Math.max(0.035, zoom - 0.08))} aria-label="Zoom out">−</button>
                    <div className="zoom-display">{Math.round(zoom * 100)}%</div>
                    <button type="button" className="icon-button" onClick={() => onZoomChange(Math.min(3, zoom + 0.08))} aria-label="Zoom in">+</button>
                  </div>
                </>
              ) : (
                <div className="empty-state" style={{padding: '16px 0'}}>
                  <div className="empty-state-icon">🗺️</div>
                  <p>Click any agent on the city map to track their journey. Shift+click to track multiple.</p>
                </div>
              )}
            </section>

            {/* Live event feed */}
            <section className="drawer-panel">
              <div className="drawer-label">Live events</div>
              <div className="event-feed">
                {events.map((ev) => (
                  <div key={ev.id} className="event-item">
                    <div className="event-dot" style={{background: ev.color, boxShadow: `0 0 6px ${ev.color}88`}} />
                    <div className="event-time">{ev.time}</div>
                    <div className="event-text">{ev.text}</div>
                  </div>
                ))}
                {events.length === 0 && <div style={{color: 'var(--muted)', font: '400 0.75rem/1.5 Space Grotesk, sans-serif', padding: '8px 0'}}>No events at week {week}.</div>}
              </div>
            </section>
          </>
        )}

        {tab === 'programs' && (
          <>
            <section className="drawer-panel program-drop-panel">
              <div className="drawer-label">Drop a program</div>
              <div className="program-list">
                {PROGRAMS.map((p) => (
                  <div key={p.id} className="program-item" onClick={() => Sounds.playProgramDrop()}>
                    <div className="program-item-icon" style={{background: `${p.color}18`, border: `1px solid ${p.color}33`}}>{p.icon}</div>
                    <div className="program-item-info">
                      <div className="program-item-name">{p.name}</div>
                      <div className="program-item-desc">{p.description}</div>
                    </div>
                    <div className="program-item-cost">${(p.cost / 1000).toFixed(0)}k</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        {tab === 'city' && (
          <>
            {/* Wards */}
            <section className="drawer-panel">
              <div className="drawer-label">City Commission Wards</div>
              <div style={{display: 'grid', gap: 6}}>
                {GR_WARDS.map((w) => (
                  <div key={w.id} style={{padding: '10px 12px', borderRadius: 10, background: 'var(--surface-3)', border: `1px solid ${w.color}33`}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                      <div style={{width: 8, height: 8, borderRadius: '50%', background: w.color, boxShadow: `0 0 8px ${w.color}`}} />
                      <span style={{font: '700 0.82rem/1 Space Grotesk, sans-serif', color: w.color}}>{w.name}</span>
                      <span style={{font: '500 0.65rem/1 DM Mono, monospace', color: 'var(--muted)', marginLeft: 'auto'}}>{(w.population / 1000).toFixed(0)}k residents</span>
                    </div>
                    <div style={{font: '500 0.68rem/1.3 DM Mono, monospace', color: 'var(--text-dim)'}}>
                      {w.commissioners.map((c, i) => <div key={i}>• {c}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Social venues */}
            <section className="drawer-panel">
              <div className="drawer-label">Social venues</div>
              <div style={{display: 'grid', gap: 5}}>
                {GR_VENUES.filter((v) => ['coffee', 'bar', 'club', 'network', 'chamber'].includes(v.kind)).map((v) => (
                  <div key={v.id} style={{display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--line)'}}>
                    <span style={{fontSize: '0.9rem', flexShrink: 0}}>
                      {v.kind === 'coffee' ? '☕' : v.kind === 'bar' ? '🍺' : v.kind === 'club' ? '🎵' : v.kind === 'chamber' ? '💼' : '🤝'}
                    </span>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{font: '600 0.75rem/1 Space Grotesk, sans-serif', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{v.name}</div>
                      <div style={{font: '400 0.62rem/1 DM Mono, monospace', color: 'var(--muted)', marginTop: 1}}>
                        +{Math.round(v.networkingChance * 100)}% net · {v.socialMultiplier.toFixed(1)}× social
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Census summary */}
            <section className="drawer-panel">
              <div className="drawer-label">GR Census snapshot</div>
              <div style={{display: 'grid', gap: 5}}>
                {GR_CENSUS_ARCHETYPES.map((a) => (
                  <div key={a.archetype} style={{display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--line)'}}>
                    <span style={{fontSize: '0.85rem'}}>{a.icon}</span>
                    <div style={{flex: 1}}>
                      <div style={{font: '600 0.72rem/1 Space Grotesk, sans-serif', color: 'var(--text)'}}>{a.label}</div>
                    </div>
                    <div style={{font: '700 0.72rem/1 DM Mono, monospace', color: a.color}}>{Math.round(a.shareOfPop * 100)}%</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="drawer-footer">
        <button type="button" className="theme-toggle" onClick={() => { onToggleTheme(); Sounds.playClick(); }} aria-label="Toggle theme">
          <span className="theme-toggle-icon">{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span className="theme-toggle-text">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <button type="button" className="icon-button" title={soundOn ? 'Mute sounds' : 'Enable sounds'}
          onClick={onToggleSound}
          style={soundOn ? {borderColor: 'rgba(0,212,255,0.4)', background: 'rgba(0,212,255,0.1)', color: 'var(--cyan)'} : {}}>
          {soundOn ? '🔊' : '🔇'}
        </button>
      </div>
    </aside>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

function App(): React.JSX.Element {
  const baseline = dashboardRuns.find((r) => r.scenario_id === 'baseline') ?? dashboardRuns[0]!;
  const [selectedRunId, setSelectedRunId] = useState(baseline.run_id);
  const [clockMinute, setClockMinute] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [followedAgentIds, setFollowedAgentIds] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [zoom, setZoom] = useState(0.32);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [soundOn, setSoundOn] = useState(false);
  const prevWeekRef = useRef(0);

  React.useEffect(() => {
    document.body.dataset.theme = theme;
    return () => { delete document.body.dataset.theme; };
  }, [theme]);

  React.useEffect(() => {
    Sounds.setMuted(!soundOn);
  }, [soundOn]);

  const selectedRun = dashboardRuns.find((r) => r.run_id === selectedRunId) ?? baseline;
  const maxWeek = selectedRun.weeks.at(-1)?.week ?? 0;
  const currentWeek = Math.min(Math.floor(clockMinute / MINUTES_PER_WEEK), maxWeek);
  const minuteInWeek = clockMinute % MINUTES_PER_WEEK;
  const day = Math.floor(minuteInWeek / MINUTES_PER_DAY);
  const hour = (minuteInWeek % MINUTES_PER_DAY) / 60;
  const weekRows = currentRows(selectedRun, currentWeek);
  const followedAgents = weekRows.filter((a) => followedAgentIds.includes(a.agent_id));
  const selectedAgent = followedAgents[0] ?? null;
  const powers = useMemo(() => strategyPowers(selectedRun, baseline), [baseline, selectedRun]);

  React.useEffect(() => {
    if (currentWeek !== prevWeekRef.current) {
      Sounds.playWeekTick();
      prevWeekRef.current = currentWeek;
    }
  }, [currentWeek]);

  const handleAgentToggle = useCallback((agent: AgentRow, additive: boolean) => {
    setFollowedAgentIds((cur) => {
      if (!additive) return [agent.agent_id];
      return cur.includes(agent.agent_id) ? cur.filter((id) => id !== agent.agent_id) : [...cur, agent.agent_id];
    });
    Sounds.playClick();
  }, []);

  const clearFollow = useCallback(() => setFollowedAgentIds([]), []);

  const selectRun = useCallback((run: DashboardRun) => {
    setSelectedRunId(run.run_id);
    setClockMinute(0);
    setFollowedAgentIds([]);
    Sounds.playClick();
  }, []);

  React.useEffect(() => {
    if (!isPlaying) return;
    const ms = clockIntervalMs(day, hour);
    const timer = window.setInterval(() => {
      setClockMinute((v) => (v >= maxWeek * MINUTES_PER_WEEK ? 0 : v + CLOCK_STEP_MINUTES));
    }, ms);
    return () => window.clearInterval(timer);
  }, [isPlaying, maxWeek, selectedRun.run_id, day, hour]);

  return (
    <main className="board-shell">
      <section className="board-stage">
        <PhaserReplay
          key={theme}
          run={selectedRun}
          week={currentWeek}
          day={day}
          hour={hour}
          followedAgentIds={followedAgentIds}
          speedMultiplier={powers[0]!.value}
          theme={theme}
          zoom={zoom}
          onZoomChange={setZoom}
          onAgentToggle={handleAgentToggle}
          onClearFollow={clearFollow}
        />
      </section>

      <Drawer
        run={selectedRun}
        week={currentWeek}
        day={day}
        hour={hour}
        onWeekChange={(v) => setClockMinute(v * MINUTES_PER_WEEK)}
        onOpenModal={() => setModalOpen(true)}
        followedAgents={followedAgents}
        zoom={zoom}
        onZoomChange={setZoom}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((v) => !v)}
        theme={theme}
        onToggleTheme={() => setTheme((v) => (v === 'light' ? 'dark' : 'light'))}
        soundOn={soundOn}
        onToggleSound={() => {
          const next = !soundOn;
          setSoundOn(next);
          // Wake AudioContext on the same gesture that unmutes — browser requires user interaction
          if (next) Sounds.ensureAudioReady();
        }}
      />

      {modalOpen && (
        <Modal
          run={selectedRun}
          selectedAgent={selectedAgent}
          week={currentWeek}
          onSelectRun={selectRun}
          onClose={() => setModalOpen(false)}
          onSelectAgent={(id) => setFollowedAgentIds([id])}
        />
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
