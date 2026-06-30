import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WocScene, parseAgents, type AgentState, type AgentStatus, type SceneStats} from './scene';
import type {ScheduleActivity} from './scene';
import type {EpisodeNpc, DialogueLine} from './npcs';
import {EP001_NPCS, EP001_SCENE, EP001_PRODUCTION, type BeatSetup} from './episodes/ep001_the_market';
import type {ProductionBeat} from './production_player';
import agentCsv from '../../../simulations/workforce-development/eastbrook-vale-experiment/runs/eastbrook_001_seed20061/agent_states.csv?raw';
import './styles.css';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const MINUTES_PER_DAY  = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const CLOCK_STEP = 15;
const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const STATUS_COLORS: Record<string,string> = {
  unaware:'#3a5068', aware:'#00aaee', training:'#ffaa00',
  trained:'#aa55ff', employed:'#00ee88', dropout:'#882222',
};

// ─── TYPES ───────────────────────────────────────────────────────────────────

type WeekSnapshot = {
  week:number; status:AgentStatus; moneyPressure:number; stress:number; energy:number;
  schedule:ScheduleActivity[]; skillLevel?:number; socialCapital?:number; eventThisWeek?:string;
};
type AgentTrajectory = {
  id:string; archetype:string; neighborhood:string; skillTrack?:string;
  snapshots:WeekSnapshot[]; weeksToEmployed:number|null; finalStatus:AgentStatus;
};
type SceneClip = {beatId:string; label:string; take:number; json:string; duration:number};

// ─── CSV PARSING ─────────────────────────────────────────────────────────────

const ALL_WEEKS = new Map<number,AgentState[]>();
const AVAILABLE_WEEKS: number[] = [];
((): void => {
  const weekSet = new Set<number>();
  for (const row of agentCsv.trim().split(/\r?\n/).slice(1)) {
    const w = Number(row.split(',')[0]);
    if (!isNaN(w)) weekSet.add(w);
  }
  for (const w of [...weekSet].sort((a,b) => a-b)) AVAILABLE_WEEKS.push(w);
})();

function getWeekAgents(week:number): AgentState[] {
  if (!ALL_WEEKS.has(week)) ALL_WEEKS.set(week, parseAgents(agentCsv, week));
  return ALL_WEEKS.get(week)!;
}

let trajCache: AgentTrajectory[]|null = null;
function buildTrajectories(): AgentTrajectory[] {
  if (trajCache) return trajCache;
  const byId = new Map<string,AgentTrajectory>();
  for (const week of AVAILABLE_WEEKS) {
    for (const agent of getWeekAgents(week)) {
      if (!byId.has(agent.id)) byId.set(agent.id, {
        id:agent.id, archetype:agent.archetype, neighborhood:agent.neighborhood,
        skillTrack:agent.skillTrack, snapshots:[], weeksToEmployed:null, finalStatus:'unaware',
      });
      const t = byId.get(agent.id)!;
      t.snapshots.push({week, status:agent.status, moneyPressure:agent.moneyPressure,
        stress:agent.stress, energy:agent.energy, schedule:agent.schedule,
        skillLevel:agent.skillLevel, socialCapital:agent.socialCapital, eventThisWeek:agent.eventThisWeek});
      if (agent.status === 'employed' && t.weeksToEmployed === null) t.weeksToEmployed = week;
      t.finalStatus = agent.status;
    }
  }
  trajCache = [...byId.values()];
  return trajCache;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function clockMs(day:number, hour:number): number {
  if (day >= 5) return 30;
  if (hour < 6 || hour >= 20) return 40;
  return 120;
}

function fmtDur(secs:number): string {
  const m = Math.floor(secs/60), s = Math.round(secs%60);
  return `${m}:${String(s).padStart(2,'0')}`;
}

function fmtHour(h:number): string {
  const hh = Math.floor(h), mm = Math.round((h%1)*60);
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

function getHourActivity(schedule:ScheduleActivity[], day:number, hour:number): string {
  const acts = schedule.filter(a => a.day === day);
  const commuting = acts.find(a => {
    const c = Math.max(0.1, a.commute_hours ?? 0.5);
    return hour >= Math.max(0, a.start - c) && hour < a.start;
  });
  if (commuting) return 'commute';
  const active = acts.find(a => hour >= a.start && hour < a.end);
  return active ? (active.kind ?? 'activity') : 'home';
}

const KIND_LABELS: Record<string,string> = {
  home:'Home', commute:'Commute', job_search:'Job search', training:'Training',
  work:'Work', rest:'Rest', social:'Social', childcare:'Childcare', activity:'Activity',
};

// ─── SIM COMPONENTS (Spirit View) ────────────────────────────────────────────

function AgentCard({traj, onClick}: {traj:AgentTrajectory; onClick:()=>void}): React.JSX.Element {
  return (
    <button className="agent-card" onClick={onClick}>
      <div className="agent-card-top">
        <span className="agent-card-archetype">{traj.archetype}</span>
        {traj.weeksToEmployed !== null && <span className="agent-card-badge">Wk {traj.weeksToEmployed}</span>}
      </div>
      <div className="agent-card-id">{traj.id}</div>
      <div className="agent-card-timeline">
        {traj.snapshots.map(s => (
          <div key={s.week} className="mini-dot" style={{background:STATUS_COLORS[s.status]}} title={`Wk ${s.week}: ${s.status}`} />
        ))}
      </div>
    </button>
  );
}

function OutcomeModal({onSelectAgent, onClose}: {onSelectAgent:(t:AgentTrajectory)=>void; onClose:()=>void}): React.JSX.Element {
  const trajs = useMemo(() => buildTrajectories(), []);
  const success = trajs.filter(t => t.finalStatus === 'employed').sort((a,b) => (a.weeksToEmployed??99)-(b.weeksToEmployed??99));
  const struggling = trajs.filter(t => t.finalStatus === 'unaware' || t.finalStatus === 'aware');
  const inProgress = trajs.filter(t => t.finalStatus === 'training' || t.finalStatus === 'trained');
  return (
    <div className="outcome-overlay" onClick={e => {if (e.target===e.currentTarget) onClose();}}>
      <div className="outcome-modal">
        <div className="outcome-modal-header">
          <span className="outcome-title">Simulation Outcomes · {AVAILABLE_WEEKS.length} Weeks</span>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="outcome-columns">
          {[
            {list:success, status:'employed', label:'Employed'},
            ...(inProgress.length ? [{list:inProgress, status:'training', label:'In Progress'}] : []),
            {list:struggling, status:'unaware', label:'Struggling'},
          ].map(({list, status, label}) => (
            <div key={status} className="outcome-col">
              <div className="outcome-col-header" style={{color:STATUS_COLORS[status]}}>
                <span className="col-status-dot" style={{background:STATUS_COLORS[status]}} />
                {label} · {list.length}
              </div>
              <div className="outcome-agent-list">
                {list.map(t => <AgentCard key={t.id} traj={t} onClick={() => {onSelectAgent(t); onClose();}} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentStoryPanel({traj, followedIds, onToggleFollow, onClose, onJumpToWeek}: {
  traj:AgentTrajectory; followedIds:ReadonlySet<string>;
  onToggleFollow:(id:string)=>void; onClose:()=>void; onJumpToWeek:(w:number)=>void;
}): React.JSX.Element {
  const last = traj.snapshots[traj.snapshots.length-1]!;
  const [storyWeek, setStoryWeek] = useState(traj.weeksToEmployed ?? last.week);
  const [storyDay,  setStoryDay]  = useState(1);
  const snap = traj.snapshots.find(s => s.week === storyWeek) ?? last;
  const isFollowed = followedIds.has(traj.id);
  useEffect(() => { setStoryWeek(traj.weeksToEmployed ?? last.week); }, [traj.id]); // eslint-disable-line

  const HOURS = Array.from({length:24}, (_,i) => i);
  const prevStatus = traj.snapshots.find(s => s.week < storyWeek && s.status !== snap.status)?.status;
  const statusChanged = prevStatus !== undefined && prevStatus !== snap.status;

  return (
    <div className="story-panel">
      <div className="story-header">
        <div className="story-agent-meta">
          <div className="story-archetype">{traj.archetype}</div>
          <div className="story-id">{traj.id}</div>
          <div className="story-neighborhood">{traj.neighborhood}</div>
          {traj.skillTrack && <div className="story-track">{traj.skillTrack} track</div>}
        </div>
        <div className="story-header-actions">
          <button className={`follow-btn ${isFollowed?'active':''}`} onClick={() => onToggleFollow(traj.id)}>
            {isFollowed ? '◎ Following' : '◯ Follow'}
          </button>
          <button className="modal-close-btn small" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="story-section">
        <div className="story-section-label">Journey · {traj.snapshots.length} weeks</div>
        <div className="story-timeline-dots">
          {traj.snapshots.map(s => (
            <button key={s.week}
              className={`tl-dot ${s.week===storyWeek?'selected':''} ${s.eventThisWeek?'has-event':''}`}
              style={{'--dot-color':STATUS_COLORS[s.status]} as React.CSSProperties}
              onClick={() => setStoryWeek(s.week)}
              title={`Wk ${s.week}: ${s.status}${s.eventThisWeek?` · ${s.eventThisWeek.replaceAll('_',' ')}`:''}` }
            />
          ))}
        </div>
        <div className="story-week-caption">
          <span>Wk {storyWeek}</span>
          <span className="story-status-badge" style={{background:STATUS_COLORS[snap.status]+'33', color:STATUS_COLORS[snap.status]}}>
            {snap.status}{statusChanged && ' ↑'}
          </span>
          <button className="jump-btn" onClick={() => { onJumpToWeek(storyWeek); onClose(); }}>Jump to week</button>
        </div>
      </div>
      <div className="story-section">
        <div className="story-section-label">State · Week {storyWeek}</div>
        {([
          {label:'Energy', value:snap.energy, cls:'energy'},
          {label:'Stress', value:snap.stress, cls:'stress'},
          {label:'Money pressure', value:snap.moneyPressure, cls:'money'},
          ...(snap.skillLevel!==undefined?[{label:'Skill level',value:snap.skillLevel,cls:'skill'}]:[]),
          ...(snap.socialCapital!==undefined?[{label:'Social capital',value:snap.socialCapital,cls:'social'}]:[]),
        ]).map(({label,value,cls}) => (
          <div key={label} className="story-bar-row">
            <span className="bar-label">{label}</span>
            <div className="bar-track"><div className={`bar-fill ${cls}`} style={{width:`${Math.min(100,(value??0)*100).toFixed(0)}%`}} /></div>
            <span className="bar-val">{((value??0)*100).toFixed(0)}%</span>
          </div>
        ))}
        {snap.eventThisWeek && <div className="story-event-badge">{snap.eventThisWeek.replaceAll('_',' ')}</div>}
      </div>
      <div className="story-section story-section-grow">
        <div className="story-section-label">Hourly · Week {storyWeek}</div>
        <div className="hourly-day-tabs">
          {DAY_NAMES.map((d,i) => (
            <button key={d} className={`hourly-day-btn ${i===storyDay?'active':''}`} onClick={() => setStoryDay(i)}>{d}</button>
          ))}
        </div>
        <div className="hourly-grid">
          {HOURS.map(h => {
            const kind = getHourActivity(snap.schedule, storyDay, h);
            return (
              <div key={h} className={`hour-cell kind-${kind.replaceAll(' ','-')}`}>
                <span className="hour-num">{String(h).padStart(2,'0')}</span>
                <span className="hour-label">{KIND_LABELS[kind]??kind}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── STUDIO: LEFT PANEL ───────────────────────────────────────────────────────

function SceneListItem({
  beat, isSelected, isRecording, isPreview, clip, anyRecording,
  onSelect, onPreview, onRecord,
}: {
  beat:ProductionBeat; isSelected:boolean; isRecording:boolean; isPreview:boolean;
  clip:SceneClip|undefined; anyRecording:boolean;
  onSelect:()=>void; onPreview:()=>void; onRecord:()=>void;
}): React.JSX.Element {
  let statusClass = '';
  if (isRecording) statusClass = 'recording';
  else if (isPreview) statusClass = 'preview';
  else if (clip) statusClass = 'clipped';

  return (
    <div className={`scene-item ${isSelected?'selected':''} ${statusClass}`} onClick={onSelect}>
      <div className="scene-item-status">
        {isRecording ? <span className="scene-dot rec-dot" /> :
         isPreview   ? <span className="scene-dot prev-dot" /> :
         clip        ? <span className="scene-dot clip-dot" title={fmtDur(clip.duration)}>✓</span> :
                       <span className="scene-dot empty-dot" />}
      </div>
      <div className="scene-item-body">
        <div className="scene-item-label">{beat.label}</div>
        <div className="scene-item-meta">
          {beat.cast.filter(m => m.id !== 'autonate').map(m => m.id).join(', ') || 'Autonate solo'}
        </div>
      </div>
      {isSelected && (
        <div className="scene-item-actions" onClick={e => e.stopPropagation()}>
          <button
            className={`si-btn preview-btn ${isPreview?'active':''}`}
            onClick={onPreview} disabled={anyRecording}
            title="Load stage for this scene"
          >◎</button>
          <button
            className={`si-btn record-btn ${isRecording?'active':''}`}
            onClick={onRecord} disabled={anyRecording && !isRecording}
            title={isRecording ? 'Stop recording' : 'Record with automation'}
          >{isRecording ? '⏹' : '●'}</button>
        </div>
      )}
    </div>
  );
}

function LeftPanel({
  selectedBeatId, productionBeatId, previewBeatId, playlist, anyRecording,
  onSelectScene, onPreview, onRecord, onRemoveClip, onStitch,
}: {
  selectedBeatId:string|null; productionBeatId:string|null; previewBeatId:string|null;
  playlist:SceneClip[]; anyRecording:boolean;
  onSelectScene:(id:string)=>void;
  onPreview:(beat:ProductionBeat)=>void;
  onRecord:(beat:ProductionBeat)=>void;
  onRemoveClip:(beatId:string)=>void;
  onStitch:()=>void;
}): React.JSX.Element {
  const [episodeOpen, setEpisodeOpen] = useState(true);

  return (
    <div className="left-panel">
      {/* Project Browser */}
      <div className="panel-section">
        <div className="panel-section-hdr">
          <span className="panel-section-label">MEDIA POOL</span>
        </div>
        <div className="project-tree">
          <div className="tree-row tree-show">
            <span className="tree-icon">◈</span>
            <span className="tree-name">WoC Sim</span>
          </div>
          <div className="tree-row tree-season">
            <span className="tree-icon">▸</span>
            <span className="tree-name">Season 1</span>
          </div>
          <div
            className={`tree-row tree-episode ${episodeOpen?'open':''}`}
            onClick={() => setEpisodeOpen(v => !v)}
          >
            <span className="tree-icon">{episodeOpen?'▾':'▸'}</span>
            <span className="tree-name">EP001 · The Invisible Architecture</span>
          </div>
        </div>
      </div>

      {/* Scene List */}
      {episodeOpen && (
        <div className="panel-section panel-section-grow">
          <div className="panel-section-hdr">
            <span className="panel-section-label">SCENES</span>
            <span className="panel-section-count">{EP001_PRODUCTION.length}</span>
          </div>
          <div className="scene-list">
            {EP001_PRODUCTION.map(beat => (
              <SceneListItem
                key={beat.id}
                beat={beat}
                isSelected={selectedBeatId === beat.id}
                isRecording={productionBeatId === beat.id}
                isPreview={previewBeatId === beat.id && !productionBeatId}
                clip={playlist.find(c => c.beatId === beat.id)}
                anyRecording={anyRecording}
                onSelect={() => onSelectScene(beat.id)}
                onPreview={() => onPreview(beat)}
                onRecord={() => onRecord(beat)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Playlist */}
      <div className="panel-section">
        <div className="panel-section-hdr">
          <span className="panel-section-label">PLAYLIST</span>
          <span className="panel-section-count">{playlist.length}/{EP001_PRODUCTION.length}</span>
        </div>
        {playlist.length === 0 ? (
          <div className="playlist-empty">Record scenes and add them here</div>
        ) : (
          <div className="playlist-items">
            {EP001_PRODUCTION
              .map(b => playlist.find(c => c.beatId === b.id))
              .filter((c): c is SceneClip => !!c)
              .map(clip => (
                <div key={clip.beatId} className="playlist-item">
                  <span className="playlist-dot">✓</span>
                  <div className="playlist-item-info">
                    <span className="playlist-item-label">{clip.label}</span>
                    <span className="playlist-item-meta">T{clip.take} · {fmtDur(clip.duration)}</span>
                  </div>
                  <button className="playlist-remove" onClick={() => onRemoveClip(clip.beatId)} title="Remove">✕</button>
                </div>
              ))}
          </div>
        )}
        {playlist.length > 0 && (
          <button className="stitch-btn" onClick={onStitch}>
            <span className="stitch-icon">⬡</span> Stitch EP001
          </button>
        )}
      </div>
    </div>
  );
}

// ─── STUDIO: RIGHT PANEL (INSPECTOR) ─────────────────────────────────────────

function Inspector({
  selectedBeat, camState, onSetCam, onResetCam,
  lastRecordedBeatId, hasRecording, onAddToPlaylist,
}: {
  selectedBeat:ProductionBeat|null;
  camState:{yaw:number; pitch:number; dist:number};
  onSetCam:(yaw:number,pitch:number,dist:number)=>void;
  onResetCam:()=>void;
  lastRecordedBeatId:string|null;
  hasRecording:boolean;
  onAddToPlaylist:(beatId:string)=>void;
}): React.JSX.Element {
  return (
    <div className="right-panel">

      {/* Camera Inspector */}
      <div className="panel-section">
        <div className="panel-section-hdr">
          <span className="panel-section-label">CAMERA</span>
          <button className="cam-reset-btn" onClick={onResetCam} title="Snap camera behind Autonate">↺ Reset</button>
        </div>
        <div className="cam-controls">
          {([
            {label:'YAW',   val:camState.yaw,   min:-Math.PI, max:Math.PI, step:0.01, onChange:(v:number)=>onSetCam(v,camState.pitch,camState.dist)},
            {label:'PITCH', val:camState.pitch,  min:0.05, max:1.25, step:0.01, onChange:(v:number)=>onSetCam(camState.yaw,v,camState.dist)},
            {label:'DIST',  val:camState.dist,   min:4,    max:22,   step:0.1,  onChange:(v:number)=>onSetCam(camState.yaw,camState.pitch,v)},
          ] as const).map(({label, val, min, max, step, onChange}) => (
            <div key={label} className="cam-row">
              <span className="cam-param">{label}</span>
              <input
                type="range" min={min} max={max} step={step} value={val}
                className="cam-slider"
                onChange={e => onChange(Number(e.target.value))}
              />
              <span className="cam-val">{label === 'DIST' ? val.toFixed(1) : val.toFixed(2)}</span>
            </div>
          ))}
          <div className="cam-hint">drag viewport to orbit · scroll = zoom</div>
        </div>
      </div>

      {/* Scene Inspector */}
      {selectedBeat && (
        <div className="panel-section">
          <div className="panel-section-hdr">
            <span className="panel-section-label">SCENE</span>
          </div>
          <div className="scene-detail">
            <div className="scene-detail-title">{selectedBeat.label}</div>
            <div className="scene-detail-desc">{selectedBeat.description}</div>
            {selectedBeat.stage.length > 0 && (
              <>
                <div className="scene-detail-sub">Stage Assets</div>
                <div className="scene-detail-list">
                  {selectedBeat.stage.map((a,i) => (
                    <span key={i} className="asset-chip">{a.kind}</span>
                  ))}
                </div>
              </>
            )}
            <div className="scene-detail-sub">Cast</div>
            <div className="scene-detail-list">
              {selectedBeat.cast.map(m => (
                <span key={m.id} className={`cast-chip ${m.id==='autonate'?'cast-aut':''}`}>{m.id}</span>
              ))}
            </div>
          </div>
          {hasRecording && lastRecordedBeatId === selectedBeat.id && (
            <button className="add-to-playlist-btn" onClick={() => onAddToPlaylist(selectedBeat.id)}>
              ✓ Add to Playlist
            </button>
          )}
        </div>
      )}

      {/* CLI Actions */}
      <div className="panel-section panel-section-cli">
        <div className="panel-section-hdr">
          <span className="panel-section-label">CLAUDE CODE CLI</span>
        </div>
        <div className="cli-intro">Generate content from the terminal. Claude Code shares this codebase.</div>
        <div className="cli-actions">
          {[
            {icon:'✦', label:'Generate scene script',
             cmd:`claude 'write ProductionAct[] for EP001 ${selectedBeat?.label ?? 'selected scene'}'`},
            {icon:'✦', label:'Add NPC dialogue',
             cmd:`claude 'extend speech acts in ${selectedBeat?.id ?? 'meet_elara'} beat'`},
            {icon:'✦', label:'New episode beat',
             cmd:`claude 'add EP001 Scene ${EP001_PRODUCTION.length+1} to ep001_the_market.ts'`},
            {icon:'✦', label:'Stage asset ideas',
             cmd:`claude 'suggest ClaudeCraft props for ${selectedBeat?.label ?? 'market scene'}'`},
          ].map(({icon,label,cmd}) => (
            <div key={label} className="cli-action">
              <div className="cli-action-hdr">
                <span className="cli-action-icon">{icon}</span>
                <span className="cli-action-label">{label}</span>
              </div>
              <code className="cli-action-cmd">{cmd}</code>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ─── SIM VIEW LEFT PANEL ──────────────────────────────────────────────────────

function SimLeftPanel({
  stats, followedIds, trajectories, onSelectAgent, onRemoveFollow, onClearFollows,
}: {
  stats:SceneStats|null; followedIds:ReadonlySet<string>; trajectories:AgentTrajectory[];
  onSelectAgent:(t:AgentTrajectory)=>void; onRemoveFollow:(id:string)=>void; onClearFollows:()=>void;
}): React.JSX.Element {
  const statuses: AgentStatus[] = ['employed','trained','training','aware','unaware'];
  return (
    <div className="left-panel">
      <div className="panel-section">
        <div className="panel-section-hdr"><span className="panel-section-label">RESIDENTS</span></div>
        {stats && (
          <div className="sim-legend">
            {statuses.map(s => {
              const count = stats.counts[s] ?? 0;
              return (
                <div key={s} className="legend-row">
                  <div className="legend-dot" style={{background:STATUS_COLORS[s]}} />
                  <span className="legend-label">{s.charAt(0).toUpperCase()+s.slice(1)}</span>
                  <span className="legend-count">{count}</span>
                  <div className="legend-track">
                    <div className="legend-fill" style={{width:`${Math.round((count/Math.max(1,stats.total))*100)}%`, background:STATUS_COLORS[s]}} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {followedIds.size > 0 && (
        <div className="panel-section">
          <div className="panel-section-hdr">
            <span className="panel-section-label">FOLLOWING</span>
            <button className="follow-clear-btn" onClick={onClearFollows}>Clear</button>
          </div>
          <div className="following-chips">
            {trajectories.filter(t => followedIds.has(t.id)).map(t => (
              <div key={t.id} className="follow-chip">
                <button className="follow-chip-name" onClick={() => onSelectAgent(t)}>{t.archetype}</button>
                <button className="follow-chip-remove" onClick={() => onRemoveFollow(t.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="panel-section panel-section-grow">
        <div className="panel-section-hdr"><span className="panel-section-label">SIM NOTES</span></div>
        <div className="sim-notes">
          <p>Eastbrook Vale · 50 residents · 16 week simulation</p>
          <p>World seed 20061 · 5 skill tracks · 8 employers</p>
        </div>
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────

function App(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef  = useRef<WocScene|null>(null);
  const selectedWeekRef = useRef<number>(AVAILABLE_WEEKS[0] ?? 0);
  const recTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // Sim state
  const [isPlaying,    setIsPlaying]    = useState(true);
  const [clockMinute,  setClockMinute]  = useState(0);
  const [selectedWeek, setSelectedWeek] = useState(AVAILABLE_WEEKS[0] ?? 0);
  const [stats,        setStats]        = useState<SceneStats|null>(null);
  const [outcomeOpen,  setOutcomeOpen]  = useState(false);
  const [selectedTraj, setSelectedTraj] = useState<AgentTrajectory|null>(null);
  const [followedIds,  setFollowedIds]  = useState<ReadonlySet<string>>(new Set());

  // View mode
  const [viewMode, setViewModeState] = useState<'spirit'|'human'>('human');

  // Scene state
  const [subtitle,     setSubtitle]     = useState<string|null>(null);
  const [sceneRunning, setSceneRunning] = useState(false);
  const [recording,    setRecording]    = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [playingBack,  setPlayingBack]  = useState(false);
  const [recTime,      setRecTime]      = useState(0);

  // Episode recording (legacy full-episode auto-play)
  const [episodeRecording, setEpisodeRecording] = useState(false);
  const [episodePaused,    setEpisodePaused]    = useState(false);
  const [playbackPaused,   setPlaybackPaused]   = useState(false);

  // NPC proximity
  const [nearestNpc,   setNearestNpc]   = useState<EpisodeNpc|null>(null);
  const [dialogueLine, setDialogueLine] = useState<DialogueLine|null>(null);
  const [portalPrompt, setPortalPrompt] = useState<string|null>(null);

  // Production studio
  const [selectedBeatId,     setSelectedBeatId]     = useState<string|null>(EP001_PRODUCTION[0]?.id ?? null);
  const [productionBeatId,   setProductionBeatId]   = useState<string|null>(null);
  const [previewBeatId,      setPreviewBeatId]      = useState<string|null>(null);
  const [lastRecordedBeatId, setLastRecordedBeatId] = useState<string|null>(null);
  const [playlist,           setPlaylist]           = useState<SceneClip[]>([]);
  const [takeNumbers,        setTakeNumbers]        = useState<Record<string,number>>({});
  const [camState,           setCamStateReact]      = useState({yaw:0, pitch:0.36, dist:10});

  const maxWeek       = AVAILABLE_WEEKS.at(-1) ?? 0;
  const minuteInWeek  = clockMinute % MINUTES_PER_WEEK;
  const day           = Math.floor(minuteInWeek / MINUTES_PER_DAY);
  const hour          = (minuteInWeek % MINUTES_PER_DAY) / 60;
  const displayHour   = Math.floor(hour);
  const displayMin    = Math.round((hour - displayHour) * 60) % 60;

  selectedWeekRef.current = selectedWeek;
  const trajectories = useMemo(() => buildTrajectories(), []);

  const selectedBeat = EP001_PRODUCTION.find(b => b.id === selectedBeatId) ?? null;

  // ── Scene setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new WocScene(canvas);
    sceneRef.current = scene;
    (window as unknown as Record<string,unknown>).__wocScene = scene;
    scene.setViewMode('human');
    void scene.setAgents(getWeekAgents(selectedWeekRef.current), setStats);
    void scene.setEpisodeNpcs(EP001_NPCS, setNearestNpc, setDialogueLine, setPortalPrompt);
    return () => { scene.dispose(); sceneRef.current = null; delete (window as unknown as Record<string,unknown>).__wocScene; };
  }, []); // eslint-disable-line

  // Poll camera state
  useEffect(() => {
    const id = window.setInterval(() => {
      if (sceneRef.current) setCamStateReact(sceneRef.current.getCamState());
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (sceneRef.current) void sceneRef.current.setAgents(getWeekAgents(selectedWeek), setStats);
  }, [selectedWeek]);

  useEffect(() => { sceneRef.current?.update(day * 24 + hour); }, [day, hour]);

  useEffect(() => {
    if (!isPlaying) return;
    const ms = clockMs(day, hour);
    const id = window.setInterval(() => setClockMinute(v => v + CLOCK_STEP), ms);
    return () => window.clearInterval(id);
  }, [isPlaying, day, hour]);

  useEffect(() => {
    const w = Math.min(Math.floor(clockMinute / MINUTES_PER_WEEK), maxWeek);
    const nearest = AVAILABLE_WEEKS.reduce(
      (best, cw) => (Math.abs(cw - w) < Math.abs(best - w) ? cw : best),
      AVAILABLE_WEEKS[0] ?? 0,
    );
    setSelectedWeek(nearest);
  }, [clockMinute, maxWeek]);

  // R key = manual record
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.code === 'KeyR' && viewMode === 'human' && !e.repeat && !productionBeatId) {
        handleToggleRecord();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode, productionBeatId]); // eslint-disable-line

  useEffect(() => () => { if (recTimerRef.current) clearInterval(recTimerRef.current); }, []);

  // ── Sim handlers ─────────────────────────────────────────────────────────────

  const handleToggleFollow = useCallback((id:string) => {
    if (!sceneRef.current) return;
    const nowFollowing = sceneRef.current.toggleFollow(id);
    setFollowedIds(prev => { const next = new Set(prev); if (nowFollowing) next.add(id); else next.delete(id); return next; });
  }, []);

  const handleRemoveFollow = useCallback((id:string) => {
    if (!sceneRef.current) return;
    if (sceneRef.current.getFollowedIds().has(id)) sceneRef.current.toggleFollow(id);
    setFollowedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  }, []);

  const handleClearFollows = useCallback(() => {
    sceneRef.current?.clearFollows();
    setFollowedIds(new Set());
  }, []);

  const handleJumpToWeek = useCallback((w:number) => {
    setIsPlaying(false);
    setClockMinute(cur => {
      const d = Math.floor((cur%MINUTES_PER_WEEK)/MINUTES_PER_DAY);
      const m = cur%MINUTES_PER_DAY;
      return w*MINUTES_PER_WEEK + d*MINUTES_PER_DAY + m;
    });
  }, []);

  // ── Record / playback ────────────────────────────────────────────────────────

  const handleToggleRecord = useCallback(() => {
    if (!sceneRef.current) return;
    if (recording) {
      sceneRef.current.stopRecording();
      setRecording(false);
      setHasRecording(true);
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    } else {
      setHasRecording(false); setPlayingBack(false); setRecTime(0);
      sceneRef.current.startRecording();
      setRecording(true);
      recTimerRef.current = setInterval(() => setRecTime(t => t+1), 1000);
    }
  }, [recording]);

  const handlePlayback = useCallback(() => {
    if (!sceneRef.current || !hasRecording) return;
    setPlayingBack(true);
    sceneRef.current.playRecording(text => { setSubtitle(text); if (text===null) setPlayingBack(false); });
  }, [hasRecording]);

  const handleStopPlayback = useCallback(() => {
    sceneRef.current?.stopPlayback(); setPlayingBack(false); setSubtitle(null);
  }, []);

  const handleExportRecording = useCallback(() => {
    if (!sceneRef.current) return;
    const json = sceneRef.current.exportRecording();
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([json],{type:'application/json'})),
      download: `autonate_scene_${Date.now()}.json`,
    });
    a.click();
  }, []);

  const handlePlayScene = useCallback(() => {
    if (!sceneRef.current) return;
    if (sceneRunning) {
      sceneRef.current.stopScene(); setSceneRunning(false); setSubtitle(null);
    } else {
      setSceneRunning(true);
      sceneRef.current.playScene(text => { setSubtitle(text); if (text===null) setSceneRunning(false); });
    }
  }, [sceneRunning]);

  const handlePlayEpisodeAndRecord = useCallback(() => {
    if (!sceneRef.current) return;
    if (episodeRecording) {
      sceneRef.current.stopScene(); sceneRef.current.stopRecording();
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      setEpisodeRecording(false); setRecording(false); setSceneRunning(false);
      setHasRecording(sceneRef.current.hasRecording); setSubtitle(null);
      return;
    }
    setHasRecording(false); setRecTime(0); setEpisodeRecording(true); setRecording(true); setSceneRunning(true);
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    recTimerRef.current = setInterval(() => setRecTime(t => t+1), 1000);
    sceneRef.current.playEpisodeAndRecord(
      EP001_SCENE,
      text => setSubtitle(text),
      () => {
        if (recTimerRef.current) clearInterval(recTimerRef.current);
        setEpisodeRecording(false); setRecording(false); setSceneRunning(false);
        setHasRecording(true); setSubtitle(null);
      },
    );
  }, [episodeRecording]);

  const handlePauseEpisode = useCallback(() => {
    if (!sceneRef.current) return;
    if (episodePaused) {
      sceneRef.current.resumeEpisodeRecord(); setEpisodePaused(false);
      recTimerRef.current = setInterval(() => setRecTime(t => t+1), 1000);
    } else {
      sceneRef.current.pauseEpisodeRecord(); setEpisodePaused(true);
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    }
  }, [episodePaused]);

  const handlePausePlayback = useCallback(() => {
    if (!sceneRef.current) return;
    if (playbackPaused) {
      sceneRef.current.resumePlayback(); setPlaybackPaused(false);
    } else {
      sceneRef.current.pausePlayback(); setPlaybackPaused(true);
    }
  }, [playbackPaused]);

  // ── Production studio handlers ────────────────────────────────────────────────

  const handleSetCamState = useCallback((yaw:number, pitch:number, dist:number) => {
    sceneRef.current?.setCamState(yaw, pitch, dist);
    setCamStateReact({yaw, pitch, dist});
  }, []);

  const handleResetCam = useCallback(() => { sceneRef.current?.snapHumanCameraPublic(); }, []);

  const handlePreviewScene = useCallback((beat:ProductionBeat) => {
    if (!sceneRef.current || productionBeatId) return;
    sceneRef.current.previewProductionBeat(beat);
    setPreviewBeatId(beat.id);
    setLastRecordedBeatId(null);
    setSelectedBeatId(beat.id);
  }, [productionBeatId]);

  const handleRecordProductionBeat = useCallback((beat:ProductionBeat) => {
    if (!sceneRef.current) return;
    if (productionBeatId === beat.id) {
      sceneRef.current.stopScene(); sceneRef.current.stopRecording();
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      setProductionBeatId(null); setRecording(false);
      setLastRecordedBeatId(beat.id);
      setHasRecording(sceneRef.current.hasRecording);
      setRecTime(0);
      return;
    }
    setHasRecording(false); setLastRecordedBeatId(null); setPlayingBack(false);
    setPreviewBeatId(null); setRecTime(0); setProductionBeatId(beat.id); setRecording(true);
    setSelectedBeatId(beat.id);
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    recTimerRef.current = setInterval(() => setRecTime(t => t+1), 1000);
    sceneRef.current.recordProductionBeat(
      beat,
      text => setSubtitle(text),
      () => {
        if (recTimerRef.current) clearInterval(recTimerRef.current);
        setProductionBeatId(null); setRecording(false);
        setLastRecordedBeatId(beat.id); setHasRecording(true);
        setRecTime(0); setSubtitle(null);
      },
    );
  }, [productionBeatId]);

  const handleAddToPlaylist = useCallback((beatId:string) => {
    if (!sceneRef.current || !hasRecording) return;
    const json = sceneRef.current.exportRecording();
    const duration = sceneRef.current.recordingDuration;
    const beat = EP001_PRODUCTION.find(b => b.id === beatId);
    if (!beat) return;
    const take = (takeNumbers[beatId] ?? 0) + 1;
    setTakeNumbers(prev => ({...prev, [beatId]: take}));
    setPlaylist(prev => [...prev.filter(c => c.beatId !== beatId), {beatId, label:beat.label, take, json, duration}]);
    setLastRecordedBeatId(null);
    setHasRecording(false);
  }, [hasRecording, takeNumbers]);

  const handleRemoveClip = useCallback((beatId:string) => {
    setPlaylist(prev => prev.filter(c => c.beatId !== beatId));
  }, []);

  const handleStitch = useCallback(() => {
    if (playlist.length === 0) return;
    const ordered = EP001_PRODUCTION.map(b => playlist.find(c => c.beatId === b.id)).filter((c): c is SceneClip => !!c);
    let timeOffset = 0;
    const allFrames: Array<Record<string,unknown>> = [];
    const allOverrides: Array<Record<string,unknown>> = [];
    for (const clip of ordered) {
      const data = JSON.parse(clip.json) as {frames:Array<{t:number}&Record<string,unknown>>; overrides:Array<{t:number}&Record<string,unknown>>; version:number; frameRate:number};
      for (const f of data.frames) allFrames.push({...f, t:f.t+timeOffset});
      for (const o of (data.overrides??[])) allOverrides.push({...o, t:o.t+timeOffset});
      if (data.frames.length > 0) timeOffset += data.frames[data.frames.length-1]!.t + 1/24;
    }
    const stitched = JSON.stringify({version:2, frameRate:24, frames:allFrames, overrides:allOverrides});
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([stitched],{type:'application/json'})),
      download: `ep001_stitched_${Date.now()}.json`,
    });
    a.click();
  }, [playlist]);

  const handleToggleView = useCallback(() => {
    const next = viewMode === 'spirit' ? 'human' : 'spirit';
    sceneRef.current?.setViewMode(next);
    setViewModeState(next);
    if (next === 'human') setIsPlaying(false);
    if (next === 'spirit') setIsPlaying(true);
  }, [viewMode]);

  const isHuman = viewMode === 'human';
  const anyRecording = productionBeatId !== null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="studio-shell">

      {/* ── TOP BAR ── */}
      <header className="top-bar">
        <div className="top-bar-left">
          <span className="brand-mark">◈</span>
          <span className="brand-name">AutonateAI</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-item">WoC Studio</span>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-item active">EP001</span>
        </div>
        <div className="top-bar-center">
          {isHuman ? (
            <span className="mode-badge studio-mode">STUDIO</span>
          ) : (
            <span className="mode-badge sim-mode">SIM VIEW</span>
          )}
        </div>
        <div className="top-bar-right">
          {!isHuman && (
            <button className="top-btn outcomes-btn" onClick={() => setOutcomeOpen(v => !v)}>Outcomes</button>
          )}
          <button className={`top-btn view-toggle ${isHuman?'':'active'}`} onClick={handleToggleView}>
            {isHuman ? '◉ Sim View' : '← Studio'}
          </button>
          {isHuman && (
            <div className="top-clock">
              {String(displayHour).padStart(2,'0')}:{String(displayMin).padStart(2,'0')}
              <span className="top-clock-week">Wk {selectedWeek}</span>
            </div>
          )}
        </div>
      </header>

      {/* ── MAIN AREA ── */}
      <div className="main-area">

        {/* Left Panel */}
        {isHuman ? (
          <LeftPanel
            selectedBeatId={selectedBeatId}
            productionBeatId={productionBeatId}
            previewBeatId={previewBeatId}
            playlist={playlist}
            anyRecording={anyRecording}
            onSelectScene={setSelectedBeatId}
            onPreview={handlePreviewScene}
            onRecord={handleRecordProductionBeat}
            onRemoveClip={handleRemoveClip}
            onStitch={handleStitch}
          />
        ) : (
          <SimLeftPanel
            stats={stats}
            followedIds={followedIds}
            trajectories={trajectories}
            onSelectAgent={setSelectedTraj}
            onRemoveFollow={handleRemoveFollow}
            onClearFollows={handleClearFollows}
          />
        )}

        {/* Viewport */}
        <div className="viewport">
          <canvas ref={canvasRef} className="main-canvas" />

          {/* Subtitle */}
          {subtitle && !dialogueLine && (
            <div className="subtitle-bar"><div className="subtitle-text">{subtitle}</div></div>
          )}

          {/* Dialogue overlay */}
          {dialogueLine && (
            <div className={`dialogue-overlay ${dialogueLine.isAutonate?'autonate-line':'npc-line'}`}>
              <div className="dialogue-speaker">{dialogueLine.speaker}</div>
              <div className="dialogue-text">"{dialogueLine.text}"</div>
              <div className="dialogue-hint">E — continue</div>
            </div>
          )}

          {/* Portal prompt */}
          {isHuman && portalPrompt && !dialogueLine && (
            <div className="portal-prompt">{portalPrompt}</div>
          )}

          {/* NPC interact prompt */}
          {isHuman && nearestNpc && !dialogueLine && !portalPrompt && (
            <div className="interact-prompt">
              <span className="interact-key">E</span>
              Talk to {nearestNpc.name} · <em>{nearestNpc.role}</em>
            </div>
          )}

          {/* Recording indicator */}
          {recording && (
            <div className={`rec-badge ${productionBeatId?'scene-rec':episodeRecording?'ep-rec':''}`}>
              <span className="rec-pulse" />
              {productionBeatId ? 'SCENE' : episodeRecording ? 'EP' : 'REC'}{' '}
              {String(Math.floor(recTime/60)).padStart(2,'0')}:{String(recTime%60).padStart(2,'0')}
            </div>
          )}

          {/* Paused banners */}
          {episodePaused && (
            <div className="paused-banner">⏸ PAUSED · drag to orbit · ▶ Resume when ready</div>
          )}
          {playbackPaused && (
            <div className="paused-banner pin-mode">⏸ PAUSED · drag to set angle · ▶ Resume</div>
          )}

          {/* Spirit view overlays */}
          {!isHuman && (
            <>
              {outcomeOpen && (
                <OutcomeModal onSelectAgent={setSelectedTraj} onClose={() => setOutcomeOpen(false)} />
              )}
              {selectedTraj && (
                <AgentStoryPanel
                  traj={selectedTraj} followedIds={followedIds}
                  onToggleFollow={handleToggleFollow} onClose={() => setSelectedTraj(null)}
                  onJumpToWeek={handleJumpToWeek}
                />
              )}
            </>
          )}

          {/* Studio controls hint */}
          {isHuman && !recording && !playingBack && !episodePaused && (
            <div className="viewport-hint">
              <span className="hint-key">↑↓←→</span> Move
              <span className="hint-sep">·</span>
              <span className="hint-key">drag</span> Camera
              <span className="hint-sep">·</span>
              <span className="hint-key">scroll</span> Zoom
              <span className="hint-sep">·</span>
              <span className="hint-key">R</span> Record
            </div>
          )}
        </div>

        {/* Right Panel */}
        {isHuman ? (
          <Inspector
            selectedBeat={selectedBeat}
            camState={camState}
            onSetCam={handleSetCamState}
            onResetCam={handleResetCam}
            lastRecordedBeatId={lastRecordedBeatId}
            hasRecording={hasRecording}
            onAddToPlaylist={handleAddToPlaylist}
          />
        ) : (
          <div className="right-panel">
            {/* Sim timeline in right panel */}
            <div className="panel-section">
              <div className="panel-section-hdr"><span className="panel-section-label">TIME</span></div>
              <div className="sim-timeline">
                <div className="sim-tl-row">
                  <span className="sim-tl-label">Week</span>
                  <input type="range" min={0} max={maxWeek} step={1} value={selectedWeek}
                    onChange={e => { setIsPlaying(false); handleJumpToWeek(Number(e.target.value)); }}
                    className="sim-slider" />
                  <span className="sim-tl-val">Wk {selectedWeek}</span>
                </div>
                <div className="sim-tl-row">
                  <span className="sim-tl-label">Day</span>
                  <div className="day-btns">
                    {DAY_NAMES.map((d,i) => (
                      <button key={d} className={`day-btn ${i===day?'active':''}`}
                        onClick={() => { setIsPlaying(false); setClockMinute(cur => Math.floor(cur/MINUTES_PER_WEEK)*MINUTES_PER_WEEK + i*MINUTES_PER_DAY + cur%MINUTES_PER_DAY); }}
                      >{d}</button>
                    ))}
                  </div>
                </div>
                <div className="sim-tl-row">
                  <span className="sim-tl-label">Hour</span>
                  <input type="range" min={0} max={23.75} step={0.25} value={hour}
                    onChange={e => { setIsPlaying(false); setClockMinute(cur => Math.floor(cur/MINUTES_PER_WEEK)*MINUTES_PER_WEEK + day*MINUTES_PER_DAY + Math.round(Number(e.target.value)*60)); }}
                    className="sim-slider" />
                  <span className="sim-tl-val">{fmtHour(hour)}</span>
                </div>
                <button className="sim-play-btn" onClick={() => setIsPlaying(v => !v)}>
                  {isPlaying ? '⏸ Pause' : '▶ Play'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER BAR ── */}
      <footer className="footer-bar">
        {isHuman ? (
          <>
            <div className="footer-left">
              {/* Scene controls */}
              {!episodeRecording && !playingBack && !recording && (
                <button className={`footer-btn preview-btn ${previewBeatId?'active':''}`}
                  onClick={() => { if (selectedBeat) handlePreviewScene(selectedBeat); }}
                  disabled={anyRecording || !selectedBeat}
                >◎ Preview</button>
              )}
              {!episodeRecording && !playingBack && (
                <button
                  className={`footer-btn record-btn ${productionBeatId?'active':''}`}
                  onClick={() => { if (selectedBeat) handleRecordProductionBeat(selectedBeat); }}
                  disabled={!selectedBeat || (anyRecording && productionBeatId !== selectedBeatId)}
                >
                  {productionBeatId ? '⏹ Stop' : '● Record'}
                </button>
              )}
              {hasRecording && !recording && lastRecordedBeatId === selectedBeatId && (
                <button className="footer-btn add-btn" onClick={() => lastRecordedBeatId && handleAddToPlaylist(lastRecordedBeatId)}>
                  ✓ Add to Playlist
                </button>
              )}
              {hasRecording && !recording && !productionBeatId && (
                <>
                  {playingBack ? (
                    <>
                      <button className="footer-btn" onClick={handlePausePlayback}>{playbackPaused?'▶ Resume':'⏸ Pause'}</button>
                      <button className="footer-btn" onClick={handleStopPlayback}>⏹ Stop</button>
                    </>
                  ) : (
                    <>
                      <button className="footer-btn replay-btn" onClick={handlePlayback}>▶ Replay</button>
                      <button className="footer-btn" onClick={handleExportRecording}>↓ Export</button>
                    </>
                  )}
                </>
              )}
              {/* Episode auto-record */}
              {!recording && !playingBack && (
                <button className={`footer-btn ep-btn ${episodeRecording?'active':''}`}
                  onClick={handlePlayEpisodeAndRecord} disabled={anyRecording && !episodeRecording}
                  title="Auto-play full EP001 scene and record"
                >
                  {episodeRecording ? '⏹ Stop EP' : '⬡ Record EP001'}
                </button>
              )}
              {episodeRecording && (
                <button className="footer-btn" onClick={handlePauseEpisode}>{episodePaused?'▶ Resume':'⏸ Pause'}</button>
              )}
            </div>
            <div className="footer-center">
              {selectedBeat && (
                <span className="footer-scene-name">{selectedBeat.label}</span>
              )}
              {recording && (
                <span className="footer-rec-status">
                  <span className="footer-rec-dot" />
                  REC {String(Math.floor(recTime/60)).padStart(2,'0')}:{String(recTime%60).padStart(2,'0')}
                </span>
              )}
            </div>
            <div className="footer-right">
              <span className="footer-hint">↑↓←→ · drag · scroll · R</span>
            </div>
          </>
        ) : (
          <>
            <div className="footer-left">
              <button className="footer-btn" onClick={() => setIsPlaying(v=>!v)}>{isPlaying?'⏸ Pause':'▶ Play'}</button>
              <button className="footer-btn" onClick={() => setOutcomeOpen(v=>!v)}>Outcomes</button>
            </div>
            <div className="footer-center">
              <span className="footer-sim-clock">
                Wk {selectedWeek} · {DAY_NAMES[day]} · {String(displayHour).padStart(2,'0')}:{String(displayMin).padStart(2,'0')}
              </span>
            </div>
            <div className="footer-right">
              <span className="footer-hint">Click agent to follow · drag to orbit</span>
            </div>
          </>
        )}
      </footer>

    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
