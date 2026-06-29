import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WocScene, parseAgents, type AgentState, type AgentStatus, type SceneStats} from './scene';
import agentCsv from '../../../simulations/workforce-development/eastbrook-vale-experiment/runs/eastbrook_001_seed20061/agent_states.csv?raw';
import type {ScheduleActivity} from './scene';
import './styles.css';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const CLOCK_STEP = 15;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUS_COLORS: Record<string, string> = {
  unaware: '#3a5068',
  aware: '#00aaee',
  training: '#ffaa00',
  trained: '#aa55ff',
  employed: '#00ee88',
  dropout: '#882222',
};

// ─── TRAJECTORY TYPES ────────────────────────────────────────────────────────

type WeekSnapshot = {
  week: number;
  status: AgentStatus;
  moneyPressure: number;
  stress: number;
  energy: number;
  schedule: ScheduleActivity[];
  skillLevel?: number;
  socialCapital?: number;
  eventThisWeek?: string;
};

type AgentTrajectory = {
  id: string;
  archetype: string;
  neighborhood: string;
  skillTrack?: string;
  snapshots: WeekSnapshot[];
  weeksToEmployed: number | null;
  finalStatus: AgentStatus;
};

// ─── CSV PARSING ─────────────────────────────────────────────────────────────

const ALL_WEEKS = new Map<number, AgentState[]>();
const AVAILABLE_WEEKS: number[] = [];
((): void => {
  const lines = agentCsv.trim().split(/\r?\n/);
  const weekSet = new Set<number>();
  for (const row of lines.slice(1)) {
    const weekStr = row.split(',')[0];
    if (weekStr && !isNaN(Number(weekStr))) weekSet.add(Number(weekStr));
  }
  for (const w of [...weekSet].sort((a, b) => a - b)) AVAILABLE_WEEKS.push(w);
})();

function getWeekAgents(week: number): AgentState[] {
  if (!ALL_WEEKS.has(week)) ALL_WEEKS.set(week, parseAgents(agentCsv, week));
  return ALL_WEEKS.get(week)!;
}

let trajCache: AgentTrajectory[] | null = null;
function buildTrajectories(): AgentTrajectory[] {
  if (trajCache) return trajCache;
  const byId = new Map<string, AgentTrajectory>();
  for (const week of AVAILABLE_WEEKS) {
    for (const agent of getWeekAgents(week)) {
      if (!byId.has(agent.id)) {
        byId.set(agent.id, {
          id: agent.id, archetype: agent.archetype,
          neighborhood: agent.neighborhood,
          skillTrack: agent.skillTrack,
          snapshots: [], weeksToEmployed: null, finalStatus: 'unaware',
        });
      }
      const t = byId.get(agent.id)!;
      t.snapshots.push({
        week, status: agent.status,
        moneyPressure: agent.moneyPressure, stress: agent.stress, energy: agent.energy,
        schedule: agent.schedule,
        skillLevel: agent.skillLevel,
        socialCapital: agent.socialCapital,
        eventThisWeek: agent.eventThisWeek,
      });
      if (agent.status === 'employed' && t.weeksToEmployed === null) t.weeksToEmployed = week;
      t.finalStatus = agent.status;
    }
  }
  trajCache = [...byId.values()];
  return trajCache;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function clockMs(day: number, hour: number): number {
  if (day >= 5) return 30;
  if (hour < 6 || hour >= 20) return 40;
  return 120;
}

function getHourActivity(schedule: ScheduleActivity[], day: number, hour: number): string {
  const acts = schedule.filter((a) => a.day === day);
  const commuting = acts.find((a) => {
    const c = Math.max(0.1, a.commute_hours ?? 0.5);
    return hour >= Math.max(0, a.start - c) && hour < a.start;
  });
  if (commuting) return 'commute';
  const active = acts.find((a) => hour >= a.start && hour < a.end);
  if (active) return active.kind ?? 'activity';
  return 'home';
}

function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const KIND_LABELS: Record<string, string> = {
  home: 'Home', commute: 'Commute', job_search: 'Job search',
  training: 'Training', work: 'Work', rest: 'Rest', social: 'Social',
  childcare: 'Childcare', activity: 'Activity',
};

// ─── STATUS LEGEND ────────────────────────────────────────────────────────────

function StatusLegend({stats}: {stats: SceneStats | null}): React.JSX.Element {
  if (!stats) return <></>;
  const statuses: AgentStatus[] = ['employed', 'trained', 'training', 'aware', 'unaware'];
  return (
    <div className="legend-panel">
      <div className="legend-title">Residents · Week</div>
      {statuses.map((s) => {
        const count = stats.counts[s] ?? 0;
        return (
          <div key={s} className="legend-row">
            <div className="legend-dot" style={{background: STATUS_COLORS[s]}} />
            <span className="legend-label">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
            <span className="legend-count">{count}</span>
            <div className="legend-track">
              <div className="legend-fill" style={{
                width: `${Math.round((count / Math.max(1, stats.total)) * 100)}%`,
                background: STATUS_COLORS[s],
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── AGENT MINI CARD ─────────────────────────────────────────────────────────

function AgentCard({traj, onClick}: {traj: AgentTrajectory; onClick: () => void}): React.JSX.Element {
  return (
    <button className="agent-card" onClick={onClick}>
      <div className="agent-card-top">
        <span className="agent-card-archetype">{traj.archetype}</span>
        {traj.weeksToEmployed !== null && (
          <span className="agent-card-badge">Wk {traj.weeksToEmployed}</span>
        )}
      </div>
      <div className="agent-card-id">{traj.id}</div>
      <div className="agent-card-timeline">
        {traj.snapshots.map((s) => (
          <div
            key={s.week}
            className="mini-dot"
            style={{background: STATUS_COLORS[s.status]}}
            title={`Wk ${s.week}: ${s.status}`}
          />
        ))}
      </div>
    </button>
  );
}

// ─── OUTCOME MODAL ────────────────────────────────────────────────────────────

function OutcomeModal({
  onSelectAgent,
  onClose,
}: {
  onSelectAgent: (t: AgentTrajectory) => void;
  onClose: () => void;
}): React.JSX.Element {
  const trajs = useMemo(() => buildTrajectories(), []);
  const success = trajs
    .filter((t) => t.finalStatus === 'employed')
    .sort((a, b) => (a.weeksToEmployed ?? 99) - (b.weeksToEmployed ?? 99));
  const struggling = trajs
    .filter((t) => t.finalStatus === 'unaware' || t.finalStatus === 'aware')
    .sort((a, b) => a.archetype.localeCompare(b.archetype));
  const inProgress = trajs.filter(
    (t) => t.finalStatus === 'training' || t.finalStatus === 'trained',
  );

  return (
    <div className="outcome-overlay" onClick={(e) => {if (e.target === e.currentTarget) onClose();}}>
      <div className="outcome-modal">
        <div className="outcome-modal-header">
          <span className="outcome-title">Simulation Outcomes · {AVAILABLE_WEEKS.length} Weeks</span>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="outcome-columns">
          {/* Success */}
          <div className="outcome-col">
            <div className="outcome-col-header" style={{color: STATUS_COLORS.employed}}>
              <span className="col-status-dot" style={{background: STATUS_COLORS.employed}} />
              Employed · {success.length}
            </div>
            <div className="outcome-agent-list">
              {success.map((t) => (
                <AgentCard key={t.id} traj={t} onClick={() => { onSelectAgent(t); onClose(); }} />
              ))}
            </div>
          </div>
          {/* In-progress */}
          {inProgress.length > 0 && (
            <div className="outcome-col">
              <div className="outcome-col-header" style={{color: STATUS_COLORS.training}}>
                <span className="col-status-dot" style={{background: STATUS_COLORS.training}} />
                In Progress · {inProgress.length}
              </div>
              <div className="outcome-agent-list">
                {inProgress.map((t) => (
                  <AgentCard key={t.id} traj={t} onClick={() => { onSelectAgent(t); onClose(); }} />
                ))}
              </div>
            </div>
          )}
          {/* Struggling */}
          <div className="outcome-col">
            <div className="outcome-col-header" style={{color: STATUS_COLORS.unaware}}>
              <span className="col-status-dot" style={{background: STATUS_COLORS.unaware}} />
              Struggling · {struggling.length}
            </div>
            <div className="outcome-agent-list">
              {struggling.map((t) => (
                <AgentCard key={t.id} traj={t} onClick={() => { onSelectAgent(t); onClose(); }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AGENT STORY PANEL ───────────────────────────────────────────────────────

function AgentStoryPanel({
  traj,
  followedIds,
  onToggleFollow,
  onClose,
  onJumpToWeek,
}: {
  traj: AgentTrajectory;
  followedIds: ReadonlySet<string>;
  onToggleFollow: (id: string) => void;
  onClose: () => void;
  onJumpToWeek: (week: number) => void;
}): React.JSX.Element {
  const last = traj.snapshots[traj.snapshots.length - 1]!;
  const [storyWeek, setStoryWeek] = useState(traj.weeksToEmployed ?? last.week);
  const [storyDay, setStoryDay] = useState(1); // Tue default (weekday)
  const snap = traj.snapshots.find((s) => s.week === storyWeek) ?? last;
  const isFollowed = followedIds.has(traj.id);

  // Reset storyWeek when traj changes
  useEffect(() => {
    setStoryWeek(traj.weeksToEmployed ?? last.week);
  }, [traj.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const HOURS = Array.from({length: 24}, (_, i) => i);

  const prevStatus = traj.snapshots.find((s) => s.week < storyWeek && s.status !== snap.status)?.status;
  const statusChanged = prevStatus !== undefined && prevStatus !== snap.status;

  return (
    <div className="story-panel">
      {/* Header */}
      <div className="story-header">
        <div className="story-agent-meta">
          <div className="story-archetype">{traj.archetype}</div>
          <div className="story-id">{traj.id}</div>
          <div className="story-neighborhood">{traj.neighborhood}</div>
          {traj.skillTrack && <div className="story-track">{traj.skillTrack} track</div>}
        </div>
        <div className="story-header-actions">
          <button
            className={`follow-btn ${isFollowed ? 'active' : ''}`}
            onClick={() => onToggleFollow(traj.id)}
          >
            {isFollowed ? '◎ Following' : '◯ Follow'}
          </button>
          <button className="modal-close-btn small" onClick={onClose}>✕</button>
        </div>
      </div>

      {/* 16-week journey timeline */}
      <div className="story-section">
        <div className="story-section-label">Journey · {traj.snapshots.length} weeks</div>
        <div className="story-timeline-dots">
          {traj.snapshots.map((s) => (
            <button
              key={s.week}
              className={`tl-dot ${s.week === storyWeek ? 'selected' : ''} ${s.eventThisWeek ? 'has-event' : ''}`}
              style={{'--dot-color': STATUS_COLORS[s.status]} as React.CSSProperties}
              onClick={() => setStoryWeek(s.week)}
              title={`Wk ${s.week}: ${s.status}${s.eventThisWeek ? ` · ${s.eventThisWeek.replaceAll('_', ' ')}` : ''}`}
            />
          ))}
        </div>
        <div className="story-week-caption">
          <span>Wk {storyWeek}</span>
          <span
            className="story-status-badge"
            style={{background: STATUS_COLORS[snap.status] + '33', color: STATUS_COLORS[snap.status]}}
          >
            {snap.status}
            {statusChanged && ' ↑'}
          </span>
          <button
            className="jump-btn"
            onClick={() => { onJumpToWeek(storyWeek); onClose(); }}
          >Jump to week</button>
        </div>
      </div>

      {/* Pressure bars */}
      <div className="story-section">
        <div className="story-section-label">State · Week {storyWeek}</div>
        {([
          {label: 'Energy', value: snap.energy, cls: 'energy'},
          {label: 'Stress', value: snap.stress, cls: 'stress'},
          {label: 'Money pressure', value: snap.moneyPressure, cls: 'money'},
          ...(snap.skillLevel !== undefined ? [{label: 'Skill level', value: snap.skillLevel, cls: 'skill'}] : []),
          ...(snap.socialCapital !== undefined ? [{label: 'Social capital', value: snap.socialCapital, cls: 'social'}] : []),
        ]).map(({label, value, cls}) => (
          <div key={label} className="story-bar-row">
            <span className="bar-label">{label}</span>
            <div className="bar-track">
              <div className={`bar-fill ${cls}`} style={{width: `${Math.min(100, (value ?? 0) * 100).toFixed(0)}%`}} />
            </div>
            <span className="bar-val">{((value ?? 0) * 100).toFixed(0)}%</span>
          </div>
        ))}
        {snap.eventThisWeek && (
          <div className="story-event-badge">{snap.eventThisWeek.replaceAll('_', ' ')}</div>
        )}
      </div>

      {/* Hourly schedule for selected week */}
      <div className="story-section story-section-grow">
        <div className="story-section-label">Hourly · Week {storyWeek}</div>
        <div className="hourly-day-tabs">
          {DAY_NAMES.map((d, i) => (
            <button
              key={d}
              className={`hourly-day-btn ${i === storyDay ? 'active' : ''}`}
              onClick={() => setStoryDay(i)}
            >{d}</button>
          ))}
        </div>
        <div className="hourly-grid">
          {HOURS.map((h) => {
            const kind = getHourActivity(snap.schedule, storyDay, h);
            return (
              <div key={h} className={`hour-cell kind-${kind.replaceAll(' ', '-')}`}>
                <span className="hour-num">{String(h).padStart(2, '0')}</span>
                <span className="hour-label">{KIND_LABELS[kind] ?? kind}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── FOLLOW BAR ──────────────────────────────────────────────────────────────

function FollowBar({
  followedIds,
  trajectories,
  onRemove,
  onClearAll,
  onSelect,
}: {
  followedIds: ReadonlySet<string>;
  trajectories: AgentTrajectory[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onSelect: (t: AgentTrajectory) => void;
}): React.JSX.Element | null {
  if (followedIds.size === 0) return null;
  const followed = trajectories.filter((t) => followedIds.has(t.id));
  return (
    <div className="follow-bar">
      <span className="follow-bar-label">Following</span>
      {followed.map((t) => (
        <div key={t.id} className="follow-chip">
          <button className="follow-chip-name" onClick={() => onSelect(t)}>
            {t.archetype}
          </button>
          <button className="follow-chip-remove" onClick={() => onRemove(t.id)}>×</button>
        </div>
      ))}
      <button className="follow-clear-btn" onClick={onClearAll}>Clear all</button>
    </div>
  );
}

// ─── ENHANCED TIMELINE ───────────────────────────────────────────────────────

function EnhancedTimeline({
  week, day, hour, maxWeek, isPlaying,
  onWeekChange, onDayChange, onHourChange, onPlayPause,
}: {
  week: number; day: number; hour: number; maxWeek: number; isPlaying: boolean;
  onWeekChange: (w: number) => void;
  onDayChange: (d: number) => void;
  onHourChange: (h: number) => void;
  onPlayPause: () => void;
}): React.JSX.Element {
  return (
    <div className="enhanced-timeline">
      <button className="tl-play-btn" onClick={onPlayPause}>{isPlaying ? '⏸' : '▶'}</button>

      <div className="tl-controls">
        {/* Day selector */}
        <div className="tl-row">
          <span className="tl-label">Day</span>
          <div className="tl-day-btns">
            {DAY_NAMES.map((d, i) => (
              <button
                key={d}
                className={`tl-day-btn ${i === day ? 'active' : ''}`}
                onClick={() => onDayChange(i)}
              >{d}</button>
            ))}
          </div>
        </div>

        {/* Hour slider */}
        <div className="tl-row">
          <span className="tl-label">Hour</span>
          <input
            type="range" min={0} max={23.75} step={0.25} value={hour}
            onChange={(e) => onHourChange(Number(e.target.value))}
            className="tl-range"
          />
          <span className="tl-val">{fmtHour(hour)}</span>
        </div>

        {/* Week slider */}
        <div className="tl-row">
          <span className="tl-label">Wk {week}</span>
          <input
            type="range" min={0} max={maxWeek} step={1} value={week}
            onChange={(e) => onWeekChange(Number(e.target.value))}
            className="tl-range"
          />
          <span className="tl-val">Wk {maxWeek}</span>
        </div>
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

function App(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WocScene | null>(null);
  const selectedWeekRef = useRef<number>(AVAILABLE_WEEKS[0] ?? 0);

  const [isPlaying, setIsPlaying] = useState(true);
  const [clockMinute, setClockMinute] = useState(0);
  const [selectedWeek, setSelectedWeek] = useState(AVAILABLE_WEEKS[0] ?? 0);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [selectedTraj, setSelectedTraj] = useState<AgentTrajectory | null>(null);
  const [followedIds, setFollowedIds] = useState<ReadonlySet<string>>(new Set());
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarMouth, setAvatarMouth] = useState(0);
  const [viewMode, setViewModeState] = useState<'spirit' | 'human'>('spirit');

  const maxWeek = AVAILABLE_WEEKS.at(-1) ?? 0;
  const minuteInWeek = clockMinute % MINUTES_PER_WEEK;
  const day = Math.floor(minuteInWeek / MINUTES_PER_DAY);
  const hour = (minuteInWeek % MINUTES_PER_DAY) / 60;
  const displayHour = Math.floor(hour);
  const displayMin = Math.round((hour - displayHour) * 60) % 60;

  selectedWeekRef.current = selectedWeek;

  const trajectories = useMemo(() => buildTrajectories(), []);

  // Build scene + load initial agents (handles StrictMode double-mount)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new WocScene(canvas);
    sceneRef.current = scene;
    void scene.setAgents(getWeekAgents(selectedWeekRef.current), setStats);
    return () => { scene.dispose(); sceneRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload agents when week changes
  useEffect(() => {
    if (!sceneRef.current) return;
    void sceneRef.current.setAgents(getWeekAgents(selectedWeek), setStats);
  }, [selectedWeek]);

  // Update agent positions on every sim-time tick
  useEffect(() => {
    sceneRef.current?.update(day * 24 + hour);
  }, [day, hour]);

  // Clock tick
  useEffect(() => {
    if (!isPlaying) return;
    const ms = clockMs(day, hour);
    const id = window.setInterval(() => {
      setClockMinute((v) => v + CLOCK_STEP);
    }, ms);
    return () => window.clearInterval(id);
  }, [isPlaying, day, hour]);

  // Sync selectedWeek with clock
  useEffect(() => {
    const w = Math.min(Math.floor(clockMinute / MINUTES_PER_WEEK), maxWeek);
    const nearest = AVAILABLE_WEEKS.reduce(
      (best, cw) => (Math.abs(cw - w) < Math.abs(best - w) ? cw : best),
      AVAILABLE_WEEKS[0] ?? 0,
    );
    setSelectedWeek(nearest);
  }, [clockMinute, maxWeek]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleWeekChange = useCallback((w: number) => {
    setIsPlaying(false);
    setClockMinute((cur) => {
      const d = Math.floor((cur % MINUTES_PER_WEEK) / MINUTES_PER_DAY);
      const m = cur % MINUTES_PER_DAY;
      return w * MINUTES_PER_WEEK + d * MINUTES_PER_DAY + m;
    });
  }, []);

  const handleDayChange = useCallback((d: number) => {
    setIsPlaying(false);
    setClockMinute((cur) => {
      const w = Math.floor(cur / MINUTES_PER_WEEK);
      const m = cur % MINUTES_PER_DAY;
      return w * MINUTES_PER_WEEK + d * MINUTES_PER_DAY + m;
    });
  }, []);

  const handleHourChange = useCallback((h: number) => {
    setIsPlaying(false);
    setClockMinute((cur) => {
      const w = Math.floor(cur / MINUTES_PER_WEEK);
      const d = Math.floor((cur % MINUTES_PER_WEEK) / MINUTES_PER_DAY);
      return w * MINUTES_PER_WEEK + d * MINUTES_PER_DAY + Math.round(h * 60);
    });
  }, []);

  const handleToggleFollow = useCallback((id: string) => {
    if (!sceneRef.current) return;
    const nowFollowing = sceneRef.current.toggleFollow(id);
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (nowFollowing) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const handleRemoveFollow = useCallback((id: string) => {
    if (!sceneRef.current) return;
    if (sceneRef.current.getFollowedIds().has(id)) sceneRef.current.toggleFollow(id);
    setFollowedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }, []);

  const handleClearFollows = useCallback(() => {
    sceneRef.current?.clearFollows();
    setFollowedIds(new Set());
  }, []);

  const handleJumpToWeek = useCallback((w: number) => {
    setIsPlaying(false);
    setClockMinute((cur) => {
      const d = Math.floor((cur % MINUTES_PER_WEEK) / MINUTES_PER_DAY);
      const m = cur % MINUTES_PER_DAY;
      return w * MINUTES_PER_WEEK + d * MINUTES_PER_DAY + m;
    });
  }, []);

  const handleToggleView = useCallback(() => {
    const next = viewMode === 'spirit' ? 'human' : 'spirit';
    sceneRef.current?.setViewMode(next);
    setViewModeState(next);
    // Human view: pause the sim clock so time runs real-time
    if (next === 'human') setIsPlaying(false);
    // Spirit view: resume playing
    if (next === 'spirit') setIsPlaying(true);
  }, [viewMode]);

  const isHuman = viewMode === 'human';

  return (
    <div className="woc-shell">
      <canvas ref={canvasRef} className="woc-canvas" />

      {/* Header */}
      <header className="woc-header">
        <div className="woc-brand">
          <span className="woc-brand-eyebrow">AutoNateAI · Sim Lab</span>
          <strong className="woc-brand-title">WoC Sim</strong>
          <span className="woc-brand-sub">{isHuman ? 'Human View · Eastbrook Vale' : 'Spirit View · Eastbrook Vale · Workforce'}</span>
        </div>
        <div className="woc-clock">
          <div className="clock-time">{String(displayHour).padStart(2, '0')}:{String(displayMin).padStart(2, '0')}</div>
          <div className="clock-day">Wk {selectedWeek} · {DAY_NAMES[day]}</div>
        </div>
        <div className="woc-controls">
          <button
            className={`woc-btn view-toggle-btn ${isHuman ? 'human-active' : ''}`}
            onClick={handleToggleView}
            title={isHuman ? 'Return to Spirit View (omniscient)' : 'Enter Human View (control Autonate)'}
          >{isHuman ? '👁 Spirit View' : '🧑 Human View'}</button>
          {!isHuman && (
            <button
              className={`woc-btn ${avatarOpen ? 'active' : ''}`}
              onClick={() => setAvatarOpen((v) => !v)}
            >Avatar</button>
          )}
          {!isHuman && (
            <button
              className={`woc-btn outcomes-btn ${outcomeOpen ? 'active' : ''}`}
              onClick={() => setOutcomeOpen((v) => !v)}
            >Outcomes</button>
          )}
        </div>
      </header>

      {/* Human View HUD */}
      {isHuman && (
        <div className="human-hud">
          <div className="human-hud-mission">
            <div className="human-hud-label">Mission · 30 Days</div>
            <div className="human-hud-objective">Secure 5 AI consulting contracts</div>
            <div className="human-hud-progress">
              <div className="human-hud-pips">
                {[0,1,2,3,4].map((i) => (
                  <div key={i} className="human-hud-pip" />
                ))}
              </div>
              <span className="human-hud-count">0 / 5</span>
            </div>
          </div>
          <div className="human-hud-controls">
            <span className="human-hud-key">↑ ↓ ← →</span> Move / Turn
            <span className="human-hud-divider">·</span>
            <span className="human-hud-key">W A S D</span> Camera
            <span className="human-hud-divider">·</span>
            <span className="human-hud-key">Space</span> Jump
          </div>
        </div>
      )}

      {/* Follow bar — spirit only */}
      {!isHuman && <FollowBar
        followedIds={followedIds}
        trajectories={trajectories}
        onRemove={handleRemoveFollow}
        onClearAll={handleClearFollows}
        onSelect={setSelectedTraj}
      />}

      {/* Outcome modal — spirit only */}
      {!isHuman && outcomeOpen && (
        <OutcomeModal
          onSelectAgent={setSelectedTraj}
          onClose={() => setOutcomeOpen(false)}
        />
      )}

      {/* Agent story panel — spirit only */}
      {!isHuman && selectedTraj && (
        <AgentStoryPanel
          traj={selectedTraj}
          followedIds={followedIds}
          onToggleFollow={handleToggleFollow}
          onClose={() => setSelectedTraj(null)}
          onJumpToWeek={handleJumpToWeek}
        />
      )}

      {/* Avatar control panel */}
      {!isHuman && avatarOpen && (
        <div className="avatar-panel">
          <div className="avatar-panel-header">
            <span className="avatar-panel-title">Autonate · Avatar</span>
            <button className="avatar-panel-close" onClick={() => setAvatarOpen(false)}>×</button>
          </div>
          <div className="avatar-section-label">Pose</div>
          <div className="avatar-poses">
            {[
              {clip: 'Idle',           label: 'Idle'},
              {clip: 'Walking_A',      label: 'Walk'},
              {clip: 'Spellcast_Raise',label: 'Present'},
              {clip: 'Spellcasting',   label: 'Think'},
              {clip: 'Cheer',          label: 'Cheer'},
              {clip: 'Sit_Floor_Idle', label: 'Sit'},
              {clip: 'Hit_A',          label: 'React'},
            ].map(({clip, label}) => (
              <button
                key={clip}
                className="avatar-pose-btn"
                onClick={() => sceneRef.current?.playAutonatePose(clip)}
              >{label}</button>
            ))}
          </div>
          <div className="avatar-section-label">Lip sync — jaw open</div>
          <input
            type="range" min={0} max={1} step={0.01} value={avatarMouth}
            className="avatar-mouth-slider"
            onChange={(e) => {
              const v = Number(e.target.value);
              setAvatarMouth(v);
              sceneRef.current?.setAutonateMouth(v);
            }}
          />
          <div className="avatar-mouth-val">{(avatarMouth * 100).toFixed(0)}%</div>
        </div>
      )}

      {/* Status legend — spirit only */}
      {!isHuman && <StatusLegend stats={stats} />}

      {/* Zone map key — spirit only */}
      {!isHuman && (
        <div className="woc-map-key">
          <div className="map-key-title">Eastbrook Vale</div>
          {[
            {color: '#00d4ff', label: 'Hub town'},
            {color: '#00ff88', label: 'Points of interest'},
            {color: '#ffb800', label: 'Camps / mines'},
            {color: '#ff2d6b', label: 'Danger zones'},
          ].map(({color, label}) => (
            <div key={label} className="map-key-row">
              <div className="map-key-dot" style={{background: color, boxShadow: `0 0 5px ${color}`}} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Enhanced timeline — spirit only */}
      {!isHuman && (
        <EnhancedTimeline
          week={selectedWeek} day={day} hour={hour} maxWeek={maxWeek}
          isPlaying={isPlaying}
          onWeekChange={handleWeekChange}
          onDayChange={handleDayChange}
          onHourChange={handleHourChange}
          onPlayPause={() => setIsPlaying((v) => !v)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
