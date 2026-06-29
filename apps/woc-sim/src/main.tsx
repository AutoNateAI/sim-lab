import React, {useCallback, useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WocScene, parseAgents, type AgentState, type SceneStats} from './scene';
import agentCsv from '../../../simulations/workforce-development/city-opportunity-simulator/runs/workforce_001-baseline-seed42/agent_states.csv?raw';
import './styles.css';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const CLOCK_STEP = 15;

const STATUS_COLORS: Record<string, string> = {
  unaware: '#3a5068',
  aware: '#00aaee',
  training: '#ffaa00',
  trained: '#aa55ff',
  employed: '#00ee88',
};

// Pre-parse all weeks from the CSV
const ALL_WEEKS = new Map<number, AgentState[]>();
const AVAILABLE_WEEKS: number[] = [];
((): void => {
  const [header, ...rows] = agentCsv.trim().split(/\r?\n/);
  void header;
  const weekSet = new Set<number>();
  for (const row of rows) {
    const weekStr = row.split(',')[0];
    if (weekStr) weekSet.add(Number(weekStr));
  }
  for (const w of [...weekSet].sort((a, b) => a - b)) {
    AVAILABLE_WEEKS.push(w);
  }
})();

function getWeekAgents(week: number): AgentState[] {
  if (!ALL_WEEKS.has(week)) {
    ALL_WEEKS.set(week, parseAgents(agentCsv, week));
  }
  return ALL_WEEKS.get(week)!;
}

// ─── CLOCK HELPERS ────────────────────────────────────────────────────────────

function clockMs(day: number, hour: number): number {
  if (day >= 5) return 30;
  if (hour < 6 || hour >= 20) return 40;
  return 120;
}

// ─── STATUS LEGEND ────────────────────────────────────────────────────────────

function StatusLegend({stats}: {stats: SceneStats | null}): React.JSX.Element {
  if (!stats) return <></>;
  const statuses: Array<keyof typeof STATUS_COLORS> = ['employed', 'trained', 'training', 'aware', 'unaware'];
  return (
    <div className="legend-panel">
      <div className="legend-title">Residents · Week</div>
      {statuses.map((s) => (
        <div key={s} className="legend-row">
          <div className="legend-dot" style={{background: STATUS_COLORS[s]}} />
          <span className="legend-label">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
          <span className="legend-count">{stats.counts[s as keyof typeof stats.counts] ?? 0}</span>
          <div className="legend-track">
            <div className="legend-fill" style={{
              width: `${Math.round(((stats.counts[s as keyof typeof stats.counts] ?? 0) / Math.max(1, stats.total)) * 100)}%`,
              background: STATUS_COLORS[s],
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

function App(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WocScene | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [clockMinute, setClockMinute] = useState(0);
  const [selectedWeek, setSelectedWeek] = useState(AVAILABLE_WEEKS[0] ?? 0);
  const [stats, setStats] = useState<SceneStats | null>(null);
  // Keep a ref so the scene-creation effect can always read the latest week
  // without listing it as a dep (week changes are handled by a separate effect).
  const selectedWeekRef = useRef(selectedWeek);
  selectedWeekRef.current = selectedWeek;

  const maxWeek = AVAILABLE_WEEKS.at(-1) ?? 0;
  const minuteInWeek = clockMinute % MINUTES_PER_WEEK;
  const day = Math.floor(minuteInWeek / MINUTES_PER_DAY);
  const hour = (minuteInWeek % MINUTES_PER_DAY) / 60;
  const displayHour = Math.floor(hour);
  const displayMin = Math.round((hour - displayHour) * 60) % 60;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Build scene once. Also loads agents immediately so that React StrictMode's
  // double-invocation (mount → unmount → remount) doesn't leave a live scene
  // with no agents. Each new scene instance gets its own setAgents call here.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new WocScene(canvas);
    sceneRef.current = scene;
    void scene.setAgents(getWeekAgents(selectedWeekRef.current), setStats);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload agents when the selected week changes (scene already exists by this point)
  useEffect(() => {
    if (!sceneRef.current) return;
    void sceneRef.current.setAgents(getWeekAgents(selectedWeek), setStats);
  }, [selectedWeek]);

  // Update agent positions when time changes
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.update(day * 24 + hour);
  }, [day, hour]);

  // Clock tick
  useEffect(() => {
    if (!isPlaying) return;
    const ms = clockMs(day, hour);
    const timer = window.setInterval(() => {
      setClockMinute((v) => (v >= maxWeek * MINUTES_PER_WEEK ? 0 : v + CLOCK_STEP));
    }, ms);
    return () => window.clearInterval(timer);
  }, [isPlaying, maxWeek, day, hour]);

  // Sync selectedWeek with clock week
  useEffect(() => {
    const clockWeek = Math.min(Math.floor(clockMinute / MINUTES_PER_WEEK), maxWeek);
    const nearest = AVAILABLE_WEEKS.reduce((best, w) =>
      Math.abs(w - clockWeek) < Math.abs(best - clockWeek) ? w : best,
      AVAILABLE_WEEKS[0] ?? 0,
    );
    setSelectedWeek(nearest);
  }, [clockMinute, maxWeek]);

  const handleWeekSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const w = Number(e.target.value);
    setClockMinute(w * MINUTES_PER_WEEK);
    setIsPlaying(false);
  }, []);

  return (
    <div className="woc-shell">
      <canvas ref={canvasRef} className="woc-canvas" />

      {/* Header bar */}
      <header className="woc-header">
        <div className="woc-brand">
          <span className="woc-brand-eyebrow">AutoNateAI · Sim Lab</span>
          <strong className="woc-brand-title">WoC Sim</strong>
          <span className="woc-brand-sub">Eastbrook Vale · Workforce</span>
        </div>
        <div className="woc-clock">
          <div className="clock-time">{String(displayHour).padStart(2, '0')}:{String(displayMin).padStart(2, '0')}</div>
          <div className="clock-day">Wk {selectedWeek} · {dayNames[day] ?? 'Day'}</div>
        </div>
        <div className="woc-controls">
          <button
            type="button"
            className="woc-btn"
            onClick={() => setIsPlaying((v) => !v)}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>
      </header>

      {/* Week scrubber */}
      <div className="woc-scrubber">
        <span className="scrub-label">Wk 0</span>
        <input
          type="range"
          min={0}
          max={maxWeek}
          value={selectedWeek}
          onChange={handleWeekSlider}
          className="scrub-range"
        />
        <span className="scrub-label">Wk {maxWeek}</span>
      </div>

      {/* Legend panel */}
      <StatusLegend stats={stats} />

      {/* Zone map key */}
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
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
