import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {AutonateCharacter} from './autonate';

// ─── WoC WORLD CONSTANTS (Zone 1 — Eastbrook Vale) ───────────────────────────

const WORLD_SEED = 20061;
const WATER_LEVEL = -4.5;
const HILL_SCALE = 0.013;
const DETAIL_SCALE = 0.05;
const CHARACTER_SCALE = 1.8; // yards — visible at typical orbit distance

const HUB = {x: 0, z: 0, radius: 26};
const LAKE = {x: -92, z: 88, radius: 30};

type Poi = {x: number; z: number; label: string; kind: 'hub' | 'camp' | 'poi' | 'danger'};
const POIS: Poi[] = [
  {x: 0, z: 0, label: 'Eastbrook', kind: 'hub'},
  {x: -2, z: 70, label: 'Wolf Run', kind: 'danger'},
  {x: 65, z: 0, label: 'Boar Meadow', kind: 'poi'},
  {x: -88, z: 82, label: 'Mirror Lake', kind: 'poi'},
  {x: 76, z: -76, label: 'Bandit Camp', kind: 'danger'},
  {x: 80, z: 80, label: 'Fallen Chapel', kind: 'danger'},
  {x: -84, z: -64, label: 'Copper Dig', kind: 'camp'},
  {x: -60, z: 4, label: 'Webwood', kind: 'poi'},
  {x: -12, z: -14, label: 'Graveyard', kind: 'camp'},
];

const ROAD_LINES: Array<{x: number; z: number}[]> = [
  [{x: 0, z: 0}, {x: -2, z: 35}, {x: -2, z: 70}],
  [{x: 0, z: 0}, {x: 32, z: 0}, {x: 65, z: 0}],
  [{x: 0, z: 0}, {x: 38, z: -38}, {x: 76, z: -76}],
  [{x: 0, z: 0}, {x: -44, z: 41}, {x: -88, z: 82}],
  [{x: 0, z: 0}, {x: -42, z: -32}, {x: -84, z: -64}],
  [{x: 0, z: 0}, {x: 40, z: 40}, {x: 80, z: 80}],
  [{x: 0, z: 0}, {x: -20, z: -10}, {x: -12, z: -14}],
];

// ─── ARCHETYPE → CHARACTER MAPPING ────────────────────────────────────────────

// Workforce archetypes map to WoC player classes. Each entry defines
// which GLB to load and which animation clips to use.
const ARCHETYPE_MODELS: Record<string, {file: string; idleClip: string; walkClip: string}> = {
  student:            {file: 'rogue.glb',     idleClip: 'Idle', walkClip: 'Walking_A'},
  young_professional: {file: 'mage.glb',      idleClip: 'Idle', walkClip: 'Walking_A'},
  parent_caregiver:   {file: 'druid.glb',     idleClip: 'Idle', walkClip: 'Walking_A'},
  senior_worker:      {file: 'knight.glb',    idleClip: 'Idle', walkClip: 'Walking_A'},
  veteran_job_seeker: {file: 'barbarian.glb', idleClip: 'Idle', walkClip: 'Walking_A'},
  employer:           {file: 'paladin.glb',   idleClip: 'Idle', walkClip: 'Walking_A'},
  default:            {file: 'ranger.glb',    idleClip: 'Idle', walkClip: 'Walking_A'},
};

function modelDefForArchetype(archetype: string): (typeof ARCHETYPE_MODELS)[string] {
  const key = archetype.toLowerCase().replaceAll(' ', '_');
  return ARCHETYPE_MODELS[key] ?? ARCHETYPE_MODELS.default!;
}

// ─── TERRAIN MATH (inlined from WoC rng.ts + world.ts) ───────────────────────

function hash2(x: number, y: number, seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x * 374761393), 668265263);
  h = Math.imul(h ^ (y * 1274126177), 461845907);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {return t * t * (3 - 2 * t);}

function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm2(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0, amp = 0.5, freq = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, y * freq, seed + i * 1013) * amp;
    total += amp; amp *= 0.5; freq *= 2;
  }
  return sum / total;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function terrainHeight(x: number, z: number): number {
  const hill = 26, base = 0, hubHeight = 1.5;
  let h = (fbm2(x * HILL_SCALE + 100, z * HILL_SCALE + 100, WORLD_SEED, 4) - 0.5) * hill + base;
  h += (fbm2(x * DETAIL_SCALE, z * DETAIL_SCALE, WORLD_SEED + 7, 2) - 0.5) * 2.2;

  const dHub = Math.sqrt(x * x + z * z);
  if (dHub < HUB.radius * 1.6) {
    const blend = smoothstep(HUB.radius * 0.7, HUB.radius * 1.6, dHub);
    h = h * blend + hubHeight * (1 - blend);
  }

  const dLake = Math.sqrt((x - LAKE.x) ** 2 + (z - LAKE.z) ** 2);
  if (dLake < LAKE.radius * 1.6) {
    const lakeBlend = smoothstep(LAKE.radius * 0.55, LAKE.radius * 1.6, dLake);
    h = h * lakeBlend + (WATER_LEVEL - 4) * (1 - lakeBlend);
  }

  const minLand = WATER_LEVEL + 1.4;
  if (h < minLand) h = minLand - (minLand - h) * 0.12;

  const rimS = smoothstep(-150, -180, z);
  const rimN = smoothstep(150, 180, z);
  const rimX = smoothstep(155, 180, Math.abs(x));
  h += Math.max(rimX, rimS, rimN) * 40;
  return h;
}

// ─── COORDINATE MAPPING (GR → WoC Zone 1) ────────────────────────────────────

const GR_CX = 12000, GR_CY = 8000;
const GR_SX = 240 / 24000, GR_SZ = 240 / 16000;

function grToWoc(grX: number, grY: number): {x: number; z: number} {
  return {x: (grX - GR_CX) * GR_SX, z: (grY - GR_CY) * GR_SZ};
}

// ─── AGENT DATA TYPES ─────────────────────────────────────────────────────────

export type AgentStatus = 'unaware' | 'aware' | 'training' | 'trained' | 'employed' | 'dropout';

export type ScheduleActivity = {
  day: number;
  kind: string;
  start: number;
  end: number;
  at_home: boolean;
  destination_x?: number;
  destination_y?: number;
  commute_hours?: number;
};

export type AgentState = {
  id: string;
  status: AgentStatus;
  archetype: string;
  neighborhood: string;
  home: {x: number; z: number};
  dest: {x: number; z: number};
  schedule: ScheduleActivity[];
  moneyPressure: number;
  stress: number;
  energy: number;
  // Eastbrook Vale experiment fields (optional — absent in legacy CSVs)
  skillTrack?: string;
  skillLevel?: number;
  socialCapital?: number;
  eventThisWeek?: string;
};

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    const n = line[i + 1];
    if (c === '"' && n === '"') {current += '"'; i++;}
    else if (c === '"') {quoted = !quoted;}
    else if (c === ',' && !quoted) {fields.push(current); current = '';}
    else {current += c;}
  }
  fields.push(current);
  return fields;
}

export function parseAgents(csv: string, targetWeek: number, maxAgents = 60): AgentState[] {
  const lines = csv.trim().split(/\r?\n/);
  if (!lines[0]) return [];

  // Parse header to build column name → index map (supports both old and new CSV formats)
  const headerFields = splitCsvLine(lines[0]);
  const col: Record<string, number> = {};
  headerFields.forEach((name, idx) => { col[name] = idx; });

  const i = {
    week:    col['week']    ?? 0,
    id:      col['agent_id'] ?? 1,
    status:  col['status'] ?? 2,
    homeX:   col['home_x'] ?? 17,
    homeY:   col['home_y'] ?? 18,
    destX:   col['dest_x'] ?? col['destination_x'] ?? 20,
    destY:   col['dest_y'] ?? col['destination_y'] ?? 21,
    arch:    col['archetype'] ?? col['resident_archetype'] ?? 35,
    neigh:   col['neighborhood'] ?? col['neighborhood_id'] ?? 34,
    money:   col['money_pressure'] ?? 9,
    stress:  col['stress'] ?? 52,
    energy:  col['energy'] ?? 54,
    sched:   col['schedule_json'] ?? col['daily_schedule'] ?? 57,
    track:   col['skill_track'] ?? -1,
    skill:   col['skill_level'] ?? -1,
    sc:      col['social_capital'] ?? -1,
    event:   col['event_this_week'] ?? -1,
  };

  // Normalize a numeric field to 0-1 range. New CSV uses 0-100, old CSV uses 0-1.
  const norm01 = (v: string | undefined): number => {
    const n = Number(v ?? 0);
    return n > 1 ? n / 100 : n;
  };

  const agents = new Map<string, AgentState>();
  for (const line of lines.slice(1)) {
    if (agents.size >= maxAgents) break;
    const p = splitCsvLine(line);
    if (Number(p[i.week]) !== targetWeek) continue;
    const home = grToWoc(Number(p[i.homeX]), Number(p[i.homeY]));
    const dest = grToWoc(Number(p[i.destX]), Number(p[i.destY]));
    let schedule: ScheduleActivity[] = [];
    try {schedule = JSON.parse(p[i.sched] ?? '[]') as ScheduleActivity[];} catch {/* */}
    agents.set(p[i.id]!, {
      id: p[i.id]!,
      status: p[i.status] as AgentStatus,
      archetype: (p[i.arch] ?? 'default').replaceAll('_', ' '),
      neighborhood: (p[i.neigh] ?? '').replaceAll('_', ' '),
      home,
      dest,
      schedule,
      moneyPressure: norm01(p[i.money]),
      stress: norm01(p[i.stress]),
      energy: norm01(p[i.energy]),
      skillTrack: i.track >= 0 ? (p[i.track] || undefined) : undefined,
      skillLevel: i.skill >= 0 ? Number(p[i.skill]) / 100 : undefined,   // 0-1
      socialCapital: i.sc >= 0 ? Number(p[i.sc]) / 100 : undefined,       // 0-1
      eventThisWeek: i.event >= 0 ? (p[i.event] || undefined) : undefined,
    });
  }
  return [...agents.values()];
}

// ─── AGENT PLACEMENT ──────────────────────────────────────────────────────────

function lerpN(a: number, b: number, t: number): number {return a + (b - a) * t;}

function agentPosAtTime(agent: AgentState, timeInWeek: number): {x: number; z: number; moving: boolean} {
  const day = Math.floor(timeInWeek / 24) % 7;
  const hour = timeInWeek % 24;
  const activities = agent.schedule.filter((a) => a.day === day && !a.at_home);
  const act = activities.find((a) => {
    const commute = Math.max(0.1, a.commute_hours ?? 0.5);
    return hour >= Math.max(0, a.start - commute) && hour < Math.min(24, a.end + commute);
  });
  if (!act) return {...agent.home, moving: false};
  const commute = Math.max(0.1, act.commute_hours ?? 0.5);
  const deptH = Math.max(0, act.start - commute);
  const dest = act.destination_x != null
    ? grToWoc(act.destination_x, act.destination_y ?? 0)
    : agent.dest;
  if (hour < deptH) return {...agent.home, moving: false};
  if (hour < act.start) {
    const t = (hour - deptH) / commute;
    return {x: lerpN(agent.home.x, dest.x, t), z: lerpN(agent.home.z, dest.z, t), moving: true};
  }
  if (hour < act.end) return {...dest, moving: false};
  const retT = Math.min(1, (hour - act.end) / commute);
  return {x: lerpN(dest.x, agent.home.x, retT), z: lerpN(dest.z, agent.home.z, retT), moving: retT < 1};
}

// ─── STATUS COLORS ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<AgentStatus, THREE.Color> = {
  unaware: new THREE.Color(0x3a5068),
  aware:   new THREE.Color(0x00aaee),
  training: new THREE.Color(0xffaa00),
  trained:  new THREE.Color(0xaa55ff),
  employed: new THREE.Color(0x00ee88),
  dropout:  new THREE.Color(0x882222),
};

const STATUS_LABELS: Record<AgentStatus, string> = {
  unaware: 'Unaware', aware: 'Aware', training: 'Training',
  trained: 'Trained', employed: 'Employed', dropout: 'Dropout',
};

// ─── TERRAIN GEOMETRY ─────────────────────────────────────────────────────────

function buildTerrainGeometry(segments = 96): THREE.BufferGeometry {
  const size = 360;
  const positions: number[] = [], normals: number[] = [];
  const colors: number[] = [], indices: number[] = [];
  const eps = size / segments;

  for (let zi = 0; zi <= segments; zi++) {
    for (let xi = 0; xi <= segments; xi++) {
      const x = (xi / segments - 0.5) * size;
      const z = (zi / segments - 0.5) * size;
      const y = terrainHeight(x, z);
      positions.push(x, y, z);

      const dydx = (terrainHeight(x + eps, z) - terrainHeight(x - eps, z)) / (2 * eps);
      const dydz = (terrainHeight(x, z + eps) - terrainHeight(x, z - eps)) / (2 * eps);
      const nl = Math.sqrt(dydx * dydx + 1 + dydz * dydz);
      normals.push(-dydx / nl, 1 / nl, -dydz / nl);

      const roadDist = ROAD_LINES.reduce((best, road) => {
        for (let i = 0; i < road.length - 1; i++) {
          const a = road[i]!, b = road[i + 1]!;
          const abx = b.x - a.x, abz = b.z - a.z;
          const apx = x - a.x, apz = z - a.z;
          const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / (abx * abx + abz * abz + 1e-6)));
          const d = Math.sqrt((apx - abx * t) ** 2 + (apz - abz * t) ** 2);
          if (d < best) return d;
        }
        return best;
      }, Infinity);

      let r: number, g: number, b: number;
      if (y < WATER_LEVEL + 0.4)       {r = 0.08; g = 0.22; b = 0.45;}
      else if (y < WATER_LEVEL + 2.0)  {r = 0.55; g = 0.48; b = 0.32;}
      else if (roadDist < 5)            {r = 0.52; g = 0.48; b = 0.40;}
      else if (y < 2)                   {r = 0.22; g = 0.42; b = 0.18;}
      else if (y < 6)                   {r = 0.28; g = 0.50; b = 0.22;}
      else if (y < 12)                  {r = 0.35; g = 0.50; b = 0.25;}
      else if (y < 18)                  {r = 0.42; g = 0.42; b = 0.32;}
      else                              {r = 0.62; g = 0.58; b = 0.52;}

      const dHub2 = Math.sqrt(x * x + z * z);
      if (dHub2 < HUB.radius) {
        const blend = smoothstep(HUB.radius * 0.6, HUB.radius, dHub2);
        r = lerpN(0.72, r, blend); g = lerpN(0.68, g, blend); b = lerpN(0.58, b, blend);
      }
      colors.push(r, g, b);
    }
  }

  for (let zi = 0; zi < segments; zi++) {
    for (let xi = 0; xi < segments; xi++) {
      const a = zi * (segments + 1) + xi;
      const b = a + 1, c = a + (segments + 1), d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}

// ─── LABEL SPRITES ────────────────────────────────────────────────────────────

function makeLabelSprite(text: string, kind: Poi['kind']): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 48;
  const ctx = canvas.getContext('2d')!;
  const kindColor: Record<Poi['kind'], string> = {
    hub: '#00d4ff', camp: '#ffb800', poi: '#00ff88', danger: '#ff2d6b',
  };
  ctx.clearRect(0, 0, 256, 48);
  ctx.font = 'bold 20px "DM Mono", monospace';
  const w = ctx.measureText(text).width + 20;
  ctx.fillStyle = 'rgba(4,8,20,0.82)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 6, w, 36, 8);
  ctx.fill();
  ctx.strokeStyle = kindColor[kind];
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = kindColor[kind];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 24);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({map: tex, depthTest: false, transparent: true});
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(28, 5.25, 1);
  return sprite;
}

// ─── CHARACTER HANDLE ─────────────────────────────────────────────────────────

type CharacterHandle = {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  idleAction: THREE.AnimationAction;
  walkAction: THREE.AnimationAction;
  statusOrb: THREE.Mesh;
  isWalking: boolean;
  lastX: number;
  lastZ: number;
};

function findClip(clips: THREE.AnimationClip[], name: string): THREE.AnimationClip | null {
  return clips.find((c) => c.name === name) ?? clips[0] ?? null;
}

// ─── SCENE STATS ─────────────────────────────────────────────────────────────

export type SceneStats = {
  counts: Record<AgentStatus, number>;
  total: number;
};

// ─── MAIN SCENE CLASS ─────────────────────────────────────────────────────────

export class WocScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();
  private readonly loader: GLTFLoader;

  // GLB templates: file → {scene, animations}
  private readonly gltfCache = new Map<string, {scene: THREE.Group; clips: THREE.AnimationClip[]}>();
  private readonly modelsReady: Promise<void>;

  private characters = new Map<string, CharacterHandle>();
  private agents: AgentState[] = [];
  private onStats?: (s: SceneStats) => void;
  private animId = 0;
  private elapsed = 0;

  // Protagonist avatar
  private autonate: AutonateCharacter | null = null;
  private autonateReady: Promise<void> = Promise.resolve();

  // Follow mode
  private readonly followedIds = new Set<string>();
  private readonly followArrows = new Map<string, THREE.Mesh>();

  constructor(canvas: HTMLCanvasElement) {
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);

    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1520);
    this.scene.fog = new THREE.Fog(0x0a1520, 280, 500);

    this.camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.5, 600);
    this.camera.position.set(0, 120, -180);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 2, 0);
    this.controls.minDistance = 20;
    this.controls.maxDistance = 400;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomToCursor = true;      // zoom toward pointer, not orbit center
    this.controls.screenSpacePanning = true; // pan moves in screen XY plane (more natural)
    this.controls.zoomSpeed = 0.9;           // slightly gentler for trackpad

    this.buildWorld();
    this.modelsReady = this.preloadModels();
    this.autonateReady = this.loadAutonate();
    this.startLoop();

    const ro = new ResizeObserver(() => this.handleResize());
    ro.observe(canvas.parentElement ?? canvas);
  }

  private handleResize(): void {
    const c = this.renderer.domElement;
    this.renderer.setSize(c.clientWidth, c.clientHeight, false);
    this.camera.aspect = c.clientWidth / c.clientHeight;
    this.camera.updateProjectionMatrix();
  }

  // Load Autonate avatar and place at hub
  private async loadAutonate(): Promise<void> {
    this.autonate = new AutonateCharacter();
    try {
      await this.autonate.load(this.loader, __WOC_PUBLIC__);
      const hubY = terrainHeight(0, 0);
      this.autonate.setPosition(4, hubY, 8);  // just off hub center, facing plaza
      this.autonate.setFacing(-Math.PI / 6);
      this.scene.add(this.autonate.root);
      console.log('[autonate] loaded — lip sync ready:', this.autonate.lipSyncReady);
      console.log('[autonate] clips:', this.autonate.availableClips.join(', '));
    } catch (e) {
      console.warn('[autonate] failed to load:', e);
      this.autonate = null;
    }
  }

  // Pre-load every GLB we might need so setAgents() is instant
  private async preloadModels(): Promise<void> {
    const files = [...new Set(Object.values(ARCHETYPE_MODELS).map((m) => m.file))];
    const base = `${__WOC_PUBLIC__}/models/chars/players`;
    await Promise.all(
      files.map(async (file) => {
        try {
          const gltf = await this.loader.loadAsync(`${base}/${file}`);
          this.gltfCache.set(file, {
            scene: gltf.scene as THREE.Group,
            clips: gltf.animations as THREE.AnimationClip[],
          });
        } catch (e) {
          console.warn(`[woc-sim] Failed to load ${file}:`, e);
        }
      }),
    );
  }

  private buildWorld(): void {
    // ── Lighting ──────────────────────────────────────────────────────────────
    this.scene.add(new THREE.AmbientLight(0x203040, 1.2));

    const sun = new THREE.DirectionalLight(0xfff4e0, 2.8);
    sun.position.set(120, 180, -90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {near: 1, far: 500, left: -200, right: 200, top: 200, bottom: -200});
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x4060a0, 0.6);
    fill.position.set(-60, 40, 120);
    this.scene.add(fill);

    // ── Terrain ───────────────────────────────────────────────────────────────
    const terrain = new THREE.Mesh(
      buildTerrainGeometry(96),
      new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.85}),
    );
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // ── Water ─────────────────────────────────────────────────────────────────
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(360, 360),
      new THREE.MeshStandardMaterial({color: 0x0a2844, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.88}),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_LEVEL;
    this.scene.add(water);

    // ── Roads ─────────────────────────────────────────────────────────────────
    const roadMat = new THREE.LineBasicMaterial({color: 0x8a7a60, transparent: true, opacity: 0.7});
    for (const road of ROAD_LINES) {
      const pts = road.map(({x, z}) => new THREE.Vector3(x, terrainHeight(x, z) + 0.3, z));
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), roadMat));
    }

    // ── Hub building ──────────────────────────────────────────────────────────
    const hubY = terrainHeight(0, 0);
    const hubGroup = new THREE.Group();

    // Inn main body
    const inn = new THREE.Mesh(
      new THREE.BoxGeometry(14, 10, 12),
      new THREE.MeshStandardMaterial({color: 0x8a6840, roughness: 0.8}),
    );
    inn.position.set(0, hubY + 5, 0);
    inn.castShadow = true;
    hubGroup.add(inn);

    // Roof
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(10, 5, 4),
      new THREE.MeshStandardMaterial({color: 0x6a2020, roughness: 0.9}),
    );
    roof.position.set(0, hubY + 12.5, 0);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    hubGroup.add(roof);

    // Training hall (smaller building next to inn)
    const hall = new THREE.Mesh(
      new THREE.BoxGeometry(9, 7, 8),
      new THREE.MeshStandardMaterial({color: 0x7a5a38, roughness: 0.85}),
    );
    hall.position.set(-14, hubY + 3.5, 4);
    hall.castShadow = true;
    hubGroup.add(hall);

    const hallRoof = new THREE.Mesh(
      new THREE.ConeGeometry(7, 4, 4),
      new THREE.MeshStandardMaterial({color: 0x5a1818, roughness: 0.9}),
    );
    hallRoof.position.set(-14, hubY + 9, 4);
    hallRoof.rotation.y = Math.PI / 4;
    hubGroup.add(hallRoof);

    // Well
    const well = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 2, 8),
      new THREE.MeshStandardMaterial({color: 0x706050, roughness: 1}),
    );
    well.position.set(8, hubY + 1, -8);
    hubGroup.add(well);

    // Campfire glow
    const campfire = new THREE.PointLight(0xff8830, 10, 35);
    campfire.position.set(6, hubY + 2.5, 6);
    hubGroup.add(campfire);

    this.scene.add(hubGroup);

    // ── Scattered homes (agent neighborhoods) ─────────────────────────────────
    const homeRng = (n: number): number => hash2(Math.floor(n * 73), Math.floor(n * 41), WORLD_SEED + 11);
    for (let i = 0; i < 28; i++) {
      const angle = homeRng(i) * Math.PI * 2;
      const radius = 35 + homeRng(i + 0.3) * 90;
      const hx = Math.cos(angle) * radius;
      const hz = Math.sin(angle) * radius;
      if (Math.sqrt(hx * hx + hz * hz) < HUB.radius + 6) continue;
      const dLk = Math.sqrt((hx - LAKE.x) ** 2 + (hz - LAKE.z) ** 2);
      if (dLk < LAKE.radius + 3) continue;
      const hy = terrainHeight(hx, hz);
      if (hy < WATER_LEVEL + 1.5) continue;

      const size = 4 + homeRng(i + 0.6) * 3;
      const home = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * 0.7, size * 0.8),
        new THREE.MeshStandardMaterial({color: 0x7a6050, roughness: 0.9}),
      );
      home.position.set(hx, hy + size * 0.35, hz);
      home.castShadow = true;
      home.rotation.y = homeRng(i + 0.9) * Math.PI * 2;

      const homeRoof = new THREE.Mesh(
        new THREE.ConeGeometry(size * 0.72, size * 0.5, 4),
        new THREE.MeshStandardMaterial({color: 0x502828, roughness: 0.9}),
      );
      homeRoof.position.set(hx, hy + size * 0.7 + size * 0.25, hz);
      homeRoof.rotation.y = Math.PI / 4;
      this.scene.add(home, homeRoof);
    }

    // ── Trees ─────────────────────────────────────────────────────────────────
    const treeGeo = new THREE.ConeGeometry(2.5, 9, 6);
    const treeMat = new THREE.MeshStandardMaterial({color: 0x1a4828, roughness: 0.9});
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 4, 5);
    const trunkMat = new THREE.MeshStandardMaterial({color: 0x4a2c14, roughness: 1.0});
    const trees: {x: number; z: number; s: number}[] = [];

    const trng = (n: number): number => hash2(Math.floor(n * 100), Math.floor(n * 50), WORLD_SEED + 99);
    for (let i = 0; i < 420; i++) {
      const angle = trng(i) * Math.PI * 2;
      const r = 20 + trng(i + 0.1) * 155;
      const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
      if (Math.sqrt(x * x + z * z) < HUB.radius + 5) continue;
      if (Math.sqrt((x - LAKE.x) ** 2 + (z - LAKE.z) ** 2) < LAKE.radius + 4) continue;
      const y = terrainHeight(x, z);
      if (y < WATER_LEVEL + 1.8 || y > 20) continue;
      trees.push({x, z, s: 0.6 + trng(i + 0.2) * 0.8});
    }

    const treeInst = new THREE.InstancedMesh(treeGeo, treeMat, trees.length);
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    treeInst.castShadow = true;
    const tm = new THREE.Matrix4();
    trees.forEach(({x, z, s}, i) => {
      const y = terrainHeight(x, z);
      treeInst.setMatrixAt(i, tm.makeTranslation(x, y + 4.5 * s + 2, z).scale(new THREE.Vector3(s, s, s)));
      trunkInst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y + 2, z).scale(new THREE.Vector3(s, s, s)));
    });
    this.scene.add(treeInst, trunkInst);

    // ── POI billboards ────────────────────────────────────────────────────────
    const poiColors: Record<Poi['kind'], number> = {
      hub: 0x00d4ff, poi: 0x00ff88, camp: 0xffb800, danger: 0xff2d6b,
    };
    for (const poi of POIS) {
      const y = terrainHeight(poi.x, poi.z);
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 8, 6),
        new THREE.MeshStandardMaterial({
          color: poiColors[poi.kind], emissive: poiColors[poi.kind],
          emissiveIntensity: 1.5, roughness: 0, metalness: 0.5,
        }),
      );
      marker.position.set(poi.x, y + 3, poi.z);
      this.scene.add(marker);

      const sprite = makeLabelSprite(poi.label, poi.kind);
      sprite.position.set(poi.x, y + 16, poi.z);
      this.scene.add(sprite);
    }
  }

  // ─── CHARACTER MANAGEMENT ──────────────────────────────────────────────────

  private clearCharacters(): void {
    this.characters.forEach(({group, mixer}) => {
      mixer.stopAllAction();
      this.scene.remove(group);
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    });
    this.characters.clear();
  }

  private spawnCharacter(agent: AgentState, pos: {x: number; z: number}): CharacterHandle | null {
    const def = modelDefForArchetype(agent.archetype);
    const template = this.gltfCache.get(def.file);
    if (!template) return null;

    // Clone the rig using SkeletonUtils so bones/morph targets are independent
    const group = SkeletonUtils.clone(template.scene) as THREE.Group;
    group.scale.setScalar(CHARACTER_SCALE);
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = false;
      }
    });

    const y = terrainHeight(pos.x, pos.z);
    group.position.set(pos.x, y, pos.z);

    // Status orb — a glowing sphere above the character's head
    const statusColor = STATUS_COLORS[agent.status];
    const orbMat = new THREE.MeshStandardMaterial({
      color: statusColor, emissive: statusColor, emissiveIntensity: 2.2,
      roughness: 0, metalness: 0.3,
    });
    const statusOrb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 7, 5), orbMat);
    statusOrb.position.set(0, 2.8 / CHARACTER_SCALE, 0); // in local space, ~head height
    group.add(statusOrb);

    this.scene.add(group);

    // Animation mixer
    const mixer = new THREE.AnimationMixer(group);
    const idleClip = findClip(template.clips, def.idleClip);
    const walkClip = findClip(template.clips, def.walkClip);
    const idleAction = idleClip ? mixer.clipAction(idleClip) : null;
    const walkAction = walkClip ? mixer.clipAction(walkClip) : null;

    if (idleAction) {idleAction.play();}

    return {
      group,
      mixer,
      idleAction: idleAction ?? ({} as THREE.AnimationAction),
      walkAction: walkAction ?? ({} as THREE.AnimationAction),
      statusOrb,
      isWalking: false,
      lastX: pos.x,
      lastZ: pos.z,
    };
  }

  async setAgents(agents: AgentState[], onStats?: (s: SceneStats) => void): Promise<void> {
    await this.modelsReady;
    this.clearCharacters();
    this.agents = agents;
    this.onStats = onStats;

    for (const agent of agents) {
      const handle = this.spawnCharacter(agent, agent.home);
      if (handle) this.characters.set(agent.id, handle);
    }
  }

  // ─── PER-FRAME UPDATE ──────────────────────────────────────────────────────

  update(timeInWeek: number): void {
    const counts: Record<AgentStatus, number> = {
      unaware: 0, aware: 0, training: 0, trained: 0, employed: 0, dropout: 0,
    };

    this.agents.forEach((agent) => {
      counts[agent.status]++;
      const handle = this.characters.get(agent.id);
      if (!handle) return;

      const pos = agentPosAtTime(agent, timeInWeek);
      const y = terrainHeight(pos.x, pos.z);
      handle.group.position.set(pos.x, y, pos.z);

      // Orient toward direction of movement
      const dx = pos.x - handle.lastX;
      const dz = pos.z - handle.lastZ;
      if (Math.abs(dx) + Math.abs(dz) > 0.01) {
        handle.group.rotation.y = Math.atan2(dx, dz);
      }
      handle.lastX = pos.x;
      handle.lastZ = pos.z;

      // Crossfade between idle ↔ walk
      const wantWalk = pos.moving;
      if (wantWalk && !handle.isWalking && handle.walkAction.play) {
        handle.idleAction.crossFadeTo(handle.walkAction, 0.3, false);
        handle.walkAction.play();
        handle.isWalking = true;
      } else if (!wantWalk && handle.isWalking && handle.idleAction.play) {
        handle.walkAction.crossFadeTo(handle.idleAction, 0.3, false);
        handle.idleAction.play();
        handle.isWalking = false;
      }
    });

    this.onStats?.({counts, total: this.agents.length});
  }

  // ─── RENDER LOOP ───────────────────────────────────────────────────────────

  // ─── FOLLOW MODE ──────────────────────────────────────────────────────────

  toggleFollow(id: string): boolean {
    if (this.followedIds.has(id)) {
      this.followedIds.delete(id);
      const arrow = this.followArrows.get(id);
      if (arrow) {this.scene.remove(arrow); this.followArrows.delete(id);}
      return false;
    }
    this.followedIds.add(id);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.8, 2.5, 6),
      new THREE.MeshStandardMaterial({
        color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 3,
        roughness: 0, transparent: true, opacity: 0.9, depthTest: false,
      }),
    );
    // Tip points downward
    arrow.rotation.x = Math.PI;
    this.scene.add(arrow);
    this.followArrows.set(id, arrow);
    return true;
  }

  getFollowedIds(): ReadonlySet<string> {return this.followedIds;}

  clearFollows(): void {
    this.followArrows.forEach((m) => this.scene.remove(m));
    this.followArrows.clear();
    this.followedIds.clear();
  }

  // ─── RENDER LOOP ───────────────────────────────────────────────────────────

  private startLoop(): void {
    const tick = (): void => {
      const delta = this.clock.getDelta();
      this.elapsed += delta;
      this.controls.update();
      this.characters.forEach(({mixer}) => mixer.update(delta));

      // Update follow arrows: hover above agent head, slowly bob
      this.followArrows.forEach((arrow, id) => {
        const handle = this.characters.get(id);
        if (!handle) return;
        const p = handle.group.position;
        arrow.position.set(p.x, p.y + 5 + Math.sin(this.elapsed * 3) * 0.4, p.z);
      });

      // Camera follow: softly lerp OrbitControls target toward centroid of followed agents
      if (this.followedIds.size > 0) {
        const pts: THREE.Vector3[] = [];
        this.followedIds.forEach((id) => {
          const h = this.characters.get(id);
          if (h) pts.push(h.group.position);
        });
        if (pts.length > 0) {
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
          this.controls.target.lerp(new THREE.Vector3(cx, cy, cz), delta * 2.5);
        }
      }

      this.autonate?.update(delta);

      this.renderer.render(this.scene, this.camera);
      this.animId = requestAnimationFrame(tick);
    };
    this.animId = requestAnimationFrame(tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.animId);
    this.clearCharacters();
    this.clearFollows();
    this.controls.dispose();
    this.renderer.dispose();
  }

  getStatusLabels(): typeof STATUS_LABELS {return STATUS_LABELS;}

  // ─── AUTONATE API ─────────────────────────────────────────────────────────

  /** Play an animation clip on the Autonate avatar. No-op if not loaded yet. */
  playAutonatePose(clip: string, loop = true): void {
    this.autonate?.play(clip, loop);
  }

  /**
   * Drive Autonate's lip sync jaw proxy.
   * @param amplitude 0 = closed, 1 = fully open. Wire to Web Audio RMS.
   */
  setAutonateMouth(amplitude: number): void {
    this.autonate?.setMouthOpen(amplitude);
  }

  /** Clips available on the Autonate rig. Empty until loaded. */
  getAutonatePoses(): string[] {
    return this.autonate?.availableClips ?? [];
  }

  get autonateLoaded(): boolean {
    return this.autonate !== null;
  }
}
