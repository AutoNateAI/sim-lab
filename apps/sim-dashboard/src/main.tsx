import React, {useCallback, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {dashboardRuns, type AgentRow, type DashboardRun} from './data';
import {PhaserReplay} from './PhaserReplay';
import './styles.css';

type Status = AgentRow['status'];

const statusPalette: Record<Status, string> = {
  unaware: '#9aa6b2',
  aware: '#2f80ed',
  training: '#f2b134',
  trained: '#7b61ff',
  employed: '#22a06b',
};

const statusLabels: Record<Status, string> = {
  unaware: 'Unaware',
  aware: 'Aware',
  training: 'In training',
  trained: 'Trained',
  employed: 'Employed',
};

const statusOrder: Status[] = ['unaware', 'aware', 'training', 'trained', 'employed'];

function countByStatus(rows: AgentRow[]): Record<Status, number> {
  return rows.reduce<Record<Status, number>>((acc, row) => {
    acc[row.status] += 1;
    return acc;
  }, {unaware: 0, aware: 0, training: 0, trained: 0, employed: 0});
}

function parseBlockers(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [raw];
  }
}

function currentRows(run: DashboardRun, week: number): AgentRow[] {
  return run.agentRows.filter((row) => row.week === week);
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
    case 'Budget':
      return 'Budget ran out before the pipeline finished. Preserve dollars for the highest-leverage channel or shorten the intervention window.';
    case 'Training capacity':
      return 'The system is seat-constrained. Add seats before adding more outreach, or the outreach lift will clog the pipeline.';
    case 'Employer demand':
      return 'The model is converting residents into trained candidates faster than openings appear. Add employer partnerships, matching, or placement events.';
    case 'Outreach':
      return 'The supply of aware residents is too low. Increase outreach or local targeting before expanding downstream capacity.';
    default:
      return 'The system is balancing multiple constraints. Compare this run against a lever change before assuming the bottleneck is fixed.';
  }
}

function strategyPowers(run: DashboardRun, baseline: DashboardRun): Array<{label: string; value: number; detail: string}> {
  const gains = {
    employed: run.metrics.employed - baseline.metrics.employed,
    trained: run.metrics.completedTraining - baseline.metrics.completedTraining,
    reached: run.metrics.residentsReached - baseline.metrics.residentsReached,
    budget: run.metrics.budgetRemaining - baseline.metrics.budgetRemaining,
  };

  const transit = 1 + Math.min(0.5, Math.max(0, gains.reached) / 220);
  const placement = 1 + Math.min(0.45, Math.max(0, gains.employed) / 120);
  const activation = 1 + Math.min(0.35, Math.max(0, gains.trained) / 160);

  return [
    {
      label: 'Transit boost',
      value: transit,
      detail: 'Agents travel faster when outreach reaches the map early and repeatedly.',
    },
    {
      label: 'Placement lift',
      value: placement,
      detail: 'More openings turn trained residents into visible movement on the board.',
    },
    {
      label: 'Activation pulse',
      value: activation,
      detail: 'Training throughput improves the pace of the replay and the density of motion.',
    },
    {
      label: 'Resource buffer',
      value: 1 + Math.min(0.25, Math.max(0, gains.budget) / 400_000),
      detail: 'Preserved budget keeps the intervention alive longer on the board.',
    },
  ];
}

function miniTrend(values: number[], height = 54, width = 180): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const step = width / Math.max(values.length - 1, 1);
  return values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${Math.round(index * step)} ${Math.round(height - (value / max) * height)}`)
    .join(' ');
}

function Modal({
  run,
  selectedAgent,
  week,
  onSelectRun,
  onClose,
}: {
  run: DashboardRun;
  selectedAgent: AgentRow | null;
  week: number;
  onSelectRun: (run: DashboardRun) => void;
  onClose: () => void;
}): React.JSX.Element {
  const focusRows = currentRows(run, week);
  const counts = countByStatus(focusRows);
  const narrative = run.narrative_beats ?? [];
  const recommendation = strategyRecommendation(run);
  const comparison = dashboardRuns.find((candidate) => candidate.scenario_id === 'baseline') ?? run;
  const deltaEmployment = run.metrics.employed - comparison.metrics.employed;
  const deltaTraining = run.metrics.completedTraining - comparison.metrics.completedTraining;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-label="Simulation insights" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <span className="eyebrow">RUN INSIGHTS</span>
            <h2>{run.label}</h2>
            <p>{run.run_id}</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>Close</button>
        </header>

        <div className="modal-grid">
          <section className="modal-panel modal-hero">
            <div className="callout">
              <span>Primary bottleneck</span>
              <strong>{weightedBottleNeck(run)}</strong>
              <p>{recommendation}</p>
            </div>
            <div className="stat-strip">
              <div><span>Residents reached</span><strong>{run.metrics.residentsReached}</strong></div>
              <div><span>Completed training</span><strong>{run.metrics.completedTraining}</strong></div>
              <div><span>Employed</span><strong>{run.metrics.employed}</strong></div>
              <div><span>Delta vs baseline</span><strong>{deltaEmployment >= 0 ? '+' : ''}{deltaEmployment} employed</strong><small>{deltaTraining >= 0 ? '+' : ''}{deltaTraining} trained</small></div>
            </div>
            <div className="sparkline-card">
              <div className="sparkline-head">
                <span>Employment trend</span>
                <span>week {week}</span>
              </div>
              <svg viewBox="0 0 180 54" className="sparkline" preserveAspectRatio="none" aria-hidden="true">
                <path d={miniTrend(run.weeks.map((entry) => entry.employed))} />
              </svg>
            </div>
          </section>

          <section className="modal-panel">
            <h3>Current week breakdown</h3>
            <div className="status-grid">
              {statusOrder.map((status) => (
                <div key={status} className="status-chip" style={{borderColor: `${statusPalette[status]}33`}}>
                  <span style={{background: statusPalette[status]}} />
                  <strong>{counts[status]}</strong>
                  <small>{statusLabels[status]}</small>
                </div>
              ))}
            </div>
            <div className="insight-list">
              <div><span>Budget remaining</span><strong>${Math.round(run.metrics.budgetRemaining / 1000)}k</strong></div>
              <div><span>Jobs remaining</span><strong>{run.metrics.jobsRemaining}</strong></div>
              <div><span>Run folder</span><strong>{run.artifacts.root}</strong></div>
            </div>
          </section>

          <section className="modal-panel config-panel">
            <h3>Scenario configuration</h3>
            <div className="config-values">
              <div><span>Budget</span><strong>${Math.round(run.config.budget / 1000)}k</strong></div>
              <div><span>Outreach</span><strong>{Math.round(run.config.outreach_rate * 100)}%</strong></div>
              <div><span>Training seats</span><strong>{run.config.training_seats}</strong></div>
              <div><span>Job openings</span><strong>{run.config.job_openings}</strong></div>
            </div>
            <div className="scenario-grid">
              {dashboardRuns.map((candidate) => (
                <button key={candidate.run_id} type="button" className={candidate.run_id === run.run_id ? 'scenario-button active' : 'scenario-button'} onClick={() => onSelectRun(candidate)}>
                  <strong>{candidate.label}</strong><span>{candidate.scenario_id}</span>
                </button>
              ))}
            </div>
            <p>These controls switch between reproducible Mesa run bundles. They do not substitute browser-side model logic.</p>
          </section>

          <section className="modal-panel">
            <h3>Narrative beats</h3>
            <div className="beat-list">
              {narrative.map((beat) => (
                <article key={`${beat.week}-${beat.title}`} className="beat">
                  <span>Week {beat.week}</span>
                  <strong>{beat.title}</strong>
                  <p>{beat.explanation}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="modal-panel">
            <h3>{selectedAgent ? `Agent ${selectedAgent.agent_id}` : 'Click an agent on the board'}</h3>
            {selectedAgent ? (
              <div className="agent-detail">
                <div className="agent-grid">
                  <div><span>Status</span><strong>{selectedAgent.status}</strong></div>
                  <div><span>Goal</span><strong>{selectedAgent.goal}</strong></div>
                  <div><span>Current subgoal</span><strong>{selectedAgent.current_subgoal}</strong></div>
                  <div><span>Skill</span><strong>{Math.round(selectedAgent.skill)}%</strong></div>
                  <div><span>Motivation</span><strong>{Math.round(selectedAgent.motivation)}%</strong></div>
                  <div><span>Confidence</span><strong>{Math.round(selectedAgent.confidence)}%</strong></div>
                </div>
                <div className="agent-footer">
                  <div><span>Blockers</span><strong>{parseBlockers(selectedAgent.blockers).join(', ') || 'none'}</strong></div>
                  <div><span>Pressures</span><strong>Money {selectedAgent.money_pressure.toFixed(2)} · Transit {selectedAgent.transportation_pressure.toFixed(2)} · Family {selectedAgent.family_pressure.toFixed(2)}</strong></div>
                  <div><span>Contacts</span><strong>{selectedAgent.mentor_contact ? 'Mentor' : 'No mentor'} · {selectedAgent.employer_contact ? 'Employer' : 'No employer'}</strong></div>
                </div>
              </div>
            ) : (
              <p className="empty-state">Use the board to inspect an agent. The modal will show the full state, blockers, and pressures for the selected week.</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function Drawer({
  run,
  week,
  onWeekChange,
  onOpenModal,
  followedAgents,
  zoom,
  onZoomChange,
  isPlaying,
  onTogglePlay,
  theme,
  onToggleTheme,
}: {
  run: DashboardRun;
  week: number;
  onWeekChange: (value: number) => void;
  onOpenModal: () => void;
  followedAgents: AgentRow[];
  zoom: number;
  onZoomChange: (zoom: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}): React.JSX.Element {
  return (
    <aside className="drawer">
      <div className="brand compact">
        <span>AutoNateAI · SIM LAB</span>
        <strong>Simulation telemetry</strong>
      </div>

      <div className="drawer-scroll">
        <section className="drawer-panel vital-panel">
          <div className="drawer-label">Live simulation</div>
          <div className="vital-heading">
            <div><h2>{run.label}</h2><span>Week {week}</span></div>
            <span className={isPlaying ? 'live-badge' : 'live-badge paused'}>{isPlaying ? 'Live' : 'Paused'}</span>
          </div>
          <div className="vital-grid">
            <div><span>Employed</span><strong>{run.metrics.employed}</strong></div>
            <div><span>Training</span><strong>{run.metrics.completedTraining}</strong></div>
            <div><span>Reached</span><strong>{run.metrics.residentsReached}</strong></div>
            <div><span>Budget</span><strong>${Math.round(run.metrics.budgetRemaining / 1000)}k</strong></div>
          </div>
          <div className="control-stack">
            <button type="button" className="primary-button" onClick={onTogglePlay}>{isPlaying ? 'Pause simulation' : 'Resume simulation'}</button>
            <button type="button" className="secondary-button" onClick={onOpenModal}>Open report & configuration</button>
          </div>
        </section>

        <section className="drawer-panel">
          <div className="drawer-label">Timeline</div>
          <input type="range" min={0} max={run.weeks.at(-1)?.week ?? 0} value={week} onChange={(event) => onWeekChange(Number(event.target.value))} />
          <div className="week-readout"><span>Week 0</span><strong>Week {week}</strong><span>Week {run.weeks.at(-1)?.week ?? 0}</span></div>
        </section>

        <section className="drawer-panel follow-panel">
          <div className="drawer-label">Agent follow</div>
          {followedAgents.length > 0 ? (
            <>
              <div className="follow-summary"><strong>{followedAgents.length} tracked</strong><span>Shift-click to add more</span></div>
              <div className="follow-list">
                {followedAgents.map((agent) => (
                  <article key={agent.agent_id}>
                    <div><strong>{agent.agent_id}</strong><span>{statusLabels[agent.status]}</span></div>
                    <p>{agent.current_subgoal}</p>
                    <small>{parseBlockers(agent.blockers).join(', ') || 'No blockers'}</small>
                  </article>
                ))}
              </div>
              <div className="zoom-controls">
                <button type="button" onClick={() => onZoomChange(Math.max(0.38, zoom - 0.2))} aria-label="Zoom out">−</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={() => onZoomChange(Math.min(3, zoom + 0.2))} aria-label="Zoom in">+</button>
              </div>
            </>
          ) : (
            <p>Click an agent to follow it. Shift-click agents to track a group; click empty turf to clear.</p>
          )}
        </section>
      </div>

      <section className="drawer-theme">
        <button type="button" className="theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
          <span className="theme-toggle-icon" aria-hidden="true">{theme === 'light' ? '◐' : '◑'}</span>
          <span className="theme-toggle-text">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
        </button>
      </section>
    </aside>
  );
}

function App(): React.JSX.Element {
  const baseline = dashboardRuns.find((run) => run.scenario_id === 'baseline') ?? dashboardRuns[0];
  const [selectedRunId, setSelectedRunId] = useState(baseline.run_id);
  const [week, setWeek] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [followedAgentIds, setFollowedAgentIds] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [zoom, setZoom] = useState(0.48);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  React.useEffect(() => {
    document.body.dataset.theme = theme;
    return () => {
      delete document.body.dataset.theme;
    };
  }, [theme]);

  const selectedRun = dashboardRuns.find((run) => run.run_id === selectedRunId) ?? baseline;
  const maxWeek = selectedRun.weeks.at(-1)?.week ?? week;
  const currentWeek = Math.min(week, maxWeek);
  const weekRows = currentRows(selectedRun, currentWeek);
  const followedAgents = weekRows.filter((agent) => followedAgentIds.includes(agent.agent_id));
  const selectedAgent = followedAgents[0] ?? null;
  const powers = useMemo(() => strategyPowers(selectedRun, baseline), [baseline, selectedRun]);
  const handleAgentToggle = useCallback((agent: AgentRow, additive: boolean) => {
    setFollowedAgentIds((current) => {
      if (!additive) return [agent.agent_id];
      return current.includes(agent.agent_id) ? current.filter((agentId) => agentId !== agent.agent_id) : [...current, agent.agent_id];
    });
  }, []);
  const clearFollow = useCallback(() => setFollowedAgentIds([]), []);
  const selectRun = useCallback((run: DashboardRun) => {
    setSelectedRunId(run.run_id);
    setWeek(0);
    setFollowedAgentIds([]);
  }, []);

  React.useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setWeek((value) => (value >= maxWeek ? 0 : value + 1));
    }, 1200);
    return () => window.clearInterval(timer);
  }, [isPlaying, maxWeek, selectedRun.run_id]);

  return (
    <main className="board-shell">
      <section className="board-stage">
        <PhaserReplay
          run={selectedRun}
          week={currentWeek}
          followedAgentIds={followedAgentIds}
          speedMultiplier={powers[0].value}
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
        onWeekChange={setWeek}
        onOpenModal={() => setModalOpen(true)}
        followedAgents={followedAgents}
        zoom={zoom}
        onZoomChange={setZoom}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((value) => !value)}
        theme={theme}
        onToggleTheme={() => setTheme((value) => (value === 'light' ? 'dark' : 'light'))}
      />

      {modalOpen && (
        <Modal
          run={selectedRun}
          selectedAgent={selectedAgent}
          week={currentWeek}
          onSelectRun={selectRun}
          onClose={() => setModalOpen(false)}
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
