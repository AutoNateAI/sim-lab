import {useEffect, useRef} from 'react';
import type React from 'react';
import Phaser from 'phaser';
import {dashboardWorld, type AgentRow, type DailyActivity, type DashboardRun} from './data';
import {GR_VENUES, GR_WARDS, VENUE_COLORS, ARCHETYPE_COLORS} from './gr-geodata';
import * as Sounds from './sounds';
import grOsmRoads from '../../../simulations/workforce-development/city-opportunity-simulator/gr-osm-roads.json';

type Point = {x: number; y: number};
type ThemeMode = 'light' | 'dark';
type CameraState = {zoom: number; scrollX?: number; scrollY?: number};

// ─── LIGHTING ────────────────────────────────────────────────────────────────

function lightingForHour(hour: number): {background: string; opacity: number} {
  if (hour >= 7 && hour < 17) return {background: '#000000', opacity: 0};
  if (hour >= 5 && hour < 7) return {background: '#ffb780', opacity: 0.10};
  if (hour >= 17 && hour < 20) return {background: '#1a2f5e', opacity: 0.14};
  return {background: '#050e1f', opacity: 0.22};
}

// ─── PALETTES ────────────────────────────────────────────────────────────────

const palettes = {
  light: {
    board: '#c8d8c8',
    grass: 0xb2c8a8,
    grassMark: 0x92b888,
    grassDot: 0x6a9860,
    road: 0xffffff,
    roadLine: 0xdddddd,
    roadDash: 0xaabbcc,
    ink: 0x102a3a,
    panel: 0xffffff,
    accent: 0x0066ff,
    tree: 0x2a5038,
    water: 0x6ab0d8,
    statuses: {
      unaware: 0x8899aa,
      aware: 0x0099ff,
      training: 0xff9900,
      trained: 0x9933ff,
      employed: 0x00cc55,
    },
    // signal colors — brighter in light mode
    sigGreen: 0x00ee44,
    sigRed: 0xff2222,
  },
  dark: {
    board: '#081428',
    grass: 0x081830,
    grassMark: 0x0c2240,
    grassDot: 0x0e2848,
    road: 0xd8eeff,
    roadLine: 0x4488cc,
    roadDash: 0x88ccff,
    ink: 0x050b12,
    panel: 0x101e2d,
    accent: 0x00d4ff,
    tree: 0x1a4830,
    water: 0x0a3050,
    statuses: {
      unaware: 0x3a5068,
      aware: 0x00aaee,
      training: 0xffaa00,
      trained: 0xaa55ff,
      employed: 0x00ee88,
    },
    sigGreen: 0x00ff44,
    sigRed: 0xff3333,
  },
} satisfies Record<ThemeMode, Record<string, unknown>>;

// ─── MATH HELPERS ────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function dist(a: Point, b: Point): number { return Math.hypot(b.x - a.x, b.y - a.y); }

// ─── ROUTING ─────────────────────────────────────────────────────────────────

function routeForAgent(row: AgentRow, activity?: DailyActivity): Point[] {
  if (activity?.route?.length) return activity.route.map(([x, y]) => ({x, y}));
  try {
    return (JSON.parse(row.route) as Array<[number, number]>).map(([x, y]) => ({x, y}));
  } catch {
    return [{x: row.home_x, y: row.home_y}, {x: row.destination_x, y: row.destination_y}];
  }
}

type TravelPhase = 'home' | 'outbound' | 'onsite' | 'inbound';

type AgentPlacement = {
  agentId: string;
  phase: TravelPhase;
  hidden: boolean;
  moving: boolean;
  point: Point;
  laneKey: string;
  segmentStart: Point;
  segmentEnd: Point;
  segmentDistance: number;
  segmentLength: number;
  laneOffset: Point;
  buildingAnchor: Point;
};

function routeLength(route: Point[]): number {
  return route.slice(1).reduce((sum, pt, i) => sum + dist(route[i]!, pt), 0);
}

function activeDaysFor(row: AgentRow): number {
  if (Number.isFinite(row.active_days)) return Phaser.Math.Clamp(Math.round(row.active_days), 1, 5);
  const base = {unaware: 1, aware: 3, training: 5, trained: 4, employed: 5}[row.status];
  const priority = Number.isFinite(row.priority_score) ? row.priority_score : row.motivation / 100;
  return Phaser.Math.Clamp(Math.round(base * (0.65 + priority * 0.5)), 1, 5);
}

function isScheduledDay(row: AgentRow, day: number): boolean {
  if (day >= 5) return false;
  const n = Number(row.agent_id.split('_').at(-1) ?? 0);
  const startDay = n % 5;
  return Array.from({length: activeDaysFor(row)}, (_, i) => (startDay + i) % 5).includes(day);
}

function laneMagnitude(row: AgentRow): number {
  return {walk: 11, bike: 7, car: 3}[row.mobility_mode];
}

function placementOnRoute(row: AgentRow, route: Point[], distFromHome: number, outbound: boolean, phase: TravelPhase, buildingAnchor: Point): AgentPlacement {
  const total = routeLength(route);
  const target = Phaser.Math.Clamp(distFromHome, 0, total);
  let walked = 0;
  let rs = route[0] ?? {x: row.home_x, y: row.home_y};
  let re = rs;
  let dos = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const sl = dist(route[i]!, route[i + 1]!);
    if (walked + sl >= target || i === route.length - 2) {
      rs = route[i]!;
      re = route[i + 1]!;
      dos = Phaser.Math.Clamp(target - walked, 0, sl);
      break;
    }
    walked += sl;
  }

  const segmentStart = outbound ? rs : re;
  const segmentEnd = outbound ? re : rs;
  const segmentLength = Math.max(1, dist(segmentStart, segmentEnd));
  const segmentDistance = outbound ? dos : segmentLength - dos;
  const dx = (segmentEnd.x - segmentStart.x) / segmentLength;
  const dy = (segmentEnd.y - segmentStart.y) / segmentLength;
  const lane = laneMagnitude(row);
  const laneOffset = {x: -dy * lane, y: dx * lane};
  const point = {
    x: lerp(segmentStart.x, segmentEnd.x, segmentDistance / segmentLength) + laneOffset.x,
    y: lerp(segmentStart.y, segmentEnd.y, segmentDistance / segmentLength) + laneOffset.y,
  };
  return {agentId: row.agent_id, phase, hidden: false, moving: true, point, laneKey: `${segmentStart.x}:${segmentStart.y}-${segmentEnd.x}:${segmentEnd.y}-${row.mobility_mode}`, segmentStart, segmentEnd, segmentDistance, segmentLength, laneOffset, buildingAnchor};
}

function stationaryPlacement(row: AgentRow, phase: TravelPhase, hidden: boolean, buildingAnchor: Point): AgentPlacement {
  const n = Number(row.agent_id.split('_').at(-1) ?? 0);
  const angle = (n % 12) * (Math.PI / 6);
  const radius = hidden ? 0 : 18 + (n % 3) * 7;
  const anchor = phase === 'onsite' ? buildingAnchor : {x: row.home_x, y: row.home_y};
  return {agentId: row.agent_id, phase, hidden, moving: false, point: {x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius}, laneKey: '', segmentStart: anchor, segmentEnd: anchor, segmentDistance: 0, segmentLength: 1, laneOffset: {x: 0, y: 0}, buildingAnchor: anchor};
}

function placementForTime(row: AgentRow, timeInWeek: number): AgentPlacement {
  const safeTime = Math.max(0, timeInWeek);
  const day = Math.floor(safeTime / 24) % 7;
  const hour = safeTime % 24;
  const activities = row.daily_schedule.filter((a) => a.day === day && !a.at_home);
  const activity = activities.find((a) => {
    const commute = Math.max(0.1, a.commute_hours ?? 0);
    return hour >= Math.max(0, a.start - commute) && hour < Math.min(24, a.end + commute);
  });
  const home = {x: row.home_x, y: row.home_y};
  if (!activity) return stationaryPlacement(row, 'home', false, home);

  const buildingAnchor = {x: activity.destination_x ?? row.destination_x, y: activity.destination_y ?? row.destination_y};
  const route = routeForAgent(row, activity);
  const totalDistance = routeLength(route);
  const commuteHours = Math.max(0.1, activity.commute_hours ?? totalDistance / row.travel_speed);
  const departureHour = Math.max(0, activity.start - commuteHours);
  const arrivalHour = activity.start;
  const returnDepartureHour = activity.end;

  if (hour < departureHour) return stationaryPlacement(row, 'home', false, home);
  if (hour < arrivalHour) return placementOnRoute(row, route, totalDistance * ((hour - departureHour) / commuteHours), true, 'outbound', buildingAnchor);
  if (hour < returnDepartureHour) return stationaryPlacement(row, 'onsite', false, buildingAnchor);
  if (hour < returnDepartureHour + commuteHours) return placementOnRoute(row, route, totalDistance * (1 - (hour - returnDepartureHour) / commuteHours), false, 'inbound', buildingAnchor);
  return stationaryPlacement(row, 'home', false, home);
}

function withSegmentDistance(placement: AgentPlacement, segmentDistance: number): AgentPlacement {
  const clamped = Phaser.Math.Clamp(segmentDistance, 0, placement.segmentLength);
  return {...placement, segmentDistance: clamped, point: {x: lerp(placement.segmentStart.x, placement.segmentEnd.x, clamped / placement.segmentLength) + placement.laneOffset.x, y: lerp(placement.segmentStart.y, placement.segmentEnd.y, clamped / placement.segmentLength) + placement.laneOffset.y}};
}

const ROAD_X = dashboardWorld.roads.filter((r) => r.id.startsWith('v-')).map((r) => r.points[0][0]);
const ROAD_Y = dashboardWorld.roads.filter((r) => r.id.startsWith('h-')).map((r) => r.points[0][1]);

function signalIsGreen(placement: AgentPlacement, timeInWeek: number): boolean {
  const xi = ROAD_X.indexOf(placement.segmentEnd.x);
  const yi = ROAD_Y.indexOf(placement.segmentEnd.y);
  if (xi < 0 || yi < 0) return true;
  const offsetMinutes = ((xi + yi) % 2) * 15;
  const phase = Math.floor(((timeInWeek * 60 + offsetMinutes) % 30) / 15);
  const horizontal = placement.segmentStart.y === placement.segmentEnd.y;
  return horizontal ? phase === 0 : phase === 1;
}

// ─── PARTICLE EMITTER ────────────────────────────────────────────────────────

type Particle = {x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: number; size: number};

// ─── REPLAY SCENE ────────────────────────────────────────────────────────────

class ReplayScene extends Phaser.Scene {
  private readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly shadows = new Map<string, Phaser.GameObjects.Arc>();
  private readonly agentRows = new Map<string, AgentRow>();
  private readonly followMarkers = new Map<string, Phaser.GameObjects.Container>();
  private readonly trafficDelayHours = new Map<string, number>();
  private readonly lastPlacements = new Map<string, AgentPlacement>();
  private readonly connectionLines = new Map<string, Phaser.GameObjects.Line>();
  private readonly particles: Particle[] = [];
  private particleGraphics: Phaser.GameObjects.Graphics | null = null;
  private wardGraphics: Phaser.GameObjects.Graphics | null = null;
  private interactionGraphics: Phaser.GameObjects.Graphics | null = null;
  private followedAgentIds = new Set<string>();
  private minimapCamera: Phaser.Cameras.Scene2D.Camera | null = null;
  private currentZoom: number;
  private displayTimeInWeek: number;
  private clockTweenTarget: {value: number} | null = null;
  private ready = false;
  private dragStart: {x: number; y: number; scrollX: number; scrollY: number} | null = null;
  private frameCount = 0;
  private lastAmbientSoundMs = 0; // throttle ambient sounds to 1 per 600ms

  constructor(
    private readonly run: DashboardRun,
    private readonly fromWeek: number,
    private readonly toWeek: number,
    private readonly initialDay: number,
    private readonly initialHour: number,
    private readonly fromRows: AgentRow[],
    private readonly toRows: AgentRow[],
    initialFollowedAgentIds: string[],
    private readonly speedMultiplier: number,
    private readonly theme: ThemeMode,
    private readonly zoom: number,
    private readonly cameraState: CameraState,
    private readonly onZoomChange: (zoom: number) => void,
    private readonly onAgentToggle: (agent: AgentRow, additive: boolean) => void,
    private readonly onAgentProfile: (agent: AgentRow) => void,
    private readonly onClearFollow: () => void,
  ) {
    super('ReplayScene');
    this.currentZoom = zoom;
    this.displayTimeInWeek = initialDay * 24 + initialHour;
    this.followedAgentIds = new Set(initialFollowedAgentIds);
  }

  private zoomAt(screenX: number, screenY: number, requestedZoom: number): void {
    const camera = this.cameras.main;
    const nextZoom = Phaser.Math.Clamp(requestedZoom, 0.035, 3);
    const before = camera.getWorldPoint(screenX, screenY);
    camera.setZoom(nextZoom);
    const after = camera.getWorldPoint(screenX, screenY);
    camera.scrollX += before.x - after.x;
    camera.scrollY += before.y - after.y;
    this.currentZoom = nextZoom;
    this.cameraState.zoom = nextZoom;
    this.cameraState.scrollX = camera.scrollX;
    this.cameraState.scrollY = camera.scrollY;
    this.onZoomChange(nextZoom);
  }

  private createTexture(key: string, size: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    const g = this.add.graphics();
    draw(g);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  // ─── TEXTURES ──────────────────────────────────────────────────────────────

  private makeTextures(): void {
    const p = palettes[this.theme];

    // Grass tile
    this.createTexture('grass', 32, (g) => {
      g.fillStyle(p.grass, 1);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(p.grassMark, 1);
      g.fillRect(2, 4, 3, 3);
      g.fillRect(18, 7, 3, 3);
      g.fillRect(11, 18, 4, 3);
      g.fillStyle(p.grassDot, 1);
      g.fillRect(7, 13, 2, 2);
      g.fillRect(22, 20, 2, 2);
    });

    // House
    this.createTexture('house', 32, (g) => {
      g.fillStyle(0xd4c4a8, 1);
      g.fillRect(5, 11, 22, 16);
      g.fillStyle(0xa85030, 1);
      g.fillRect(4, 5, 24, 8);
      g.fillStyle(0x7a3028, 1);
      g.fillRect(12, 17, 8, 10);
      g.fillStyle(0xe8d8b8, 1);
      g.fillRect(7, 13, 5, 5);
      g.fillRect(20, 13, 5, 5);
    });

    // Office tower
    this.createTexture('tower', 32, (g) => {
      g.fillStyle(0x2a4a6a, 1);
      g.fillRect(5, 2, 22, 28);
      g.fillStyle(0x1a3450, 1);
      g.fillRect(5, 2, 22, 4);
      g.fillStyle(0x00aadd, 0.6);
      g.fillRect(8, 8, 4, 4);
      g.fillRect(14, 8, 4, 4);
      g.fillRect(20, 8, 4, 4);
      g.fillRect(8, 15, 4, 4);
      g.fillRect(14, 15, 4, 4);
      g.fillRect(20, 15, 4, 4);
      g.fillRect(8, 22, 4, 4);
      g.fillRect(14, 22, 4, 4);
    });

    // Community hub / workforce center
    this.createTexture('hub', 32, (g) => {
      g.fillStyle(0x8a2040, 1);
      g.fillRect(4, 7, 24, 21);
      g.fillStyle(0x6a1830, 1);
      g.fillRect(4, 7, 24, 6);
      g.fillStyle(0xffc8c0, 1);
      g.fillRect(10, 16, 12, 8);
      g.fillStyle(0xffa090, 0.8);
      g.fillRect(14, 16, 4, 8);
    });

    // Market / employer
    this.createTexture('market', 32, (g) => {
      g.fillStyle(0x5a2880, 1);
      g.fillRect(4, 6, 24, 22);
      g.fillStyle(0x3e1a60, 1);
      g.fillRect(4, 6, 24, 6);
      g.fillStyle(0xd8b0ff, 1);
      g.fillRect(10, 14, 12, 10);
      g.fillStyle(0xf0d0ff, 0.6);
      g.fillRect(13, 14, 6, 10);
    });

    // Coffee shop
    this.createTexture('coffee', 32, (g) => {
      g.fillStyle(0x6b3a1f, 1);
      g.fillRect(5, 8, 22, 20);
      g.fillStyle(0x4a2812, 1);
      g.fillRect(5, 8, 22, 5);
      g.fillStyle(0xd4813a, 1);
      g.fillRect(11, 16, 10, 8);
      g.fillStyle(0xfff8f0, 0.9);
      g.fillCircle(16, 11, 4);
    });

    // Bar / nightlife
    this.createTexture('bar', 32, (g) => {
      g.fillStyle(0x1a1040, 1);
      g.fillRect(4, 6, 24, 22);
      g.fillStyle(0x2a1860, 1);
      g.fillRect(4, 6, 24, 6);
      g.fillStyle(0xff6040, 0.9);
      g.fillRect(8, 14, 4, 8);
      g.fillStyle(0x40ff80, 0.9);
      g.fillRect(14, 14, 4, 8);
      g.fillStyle(0xff40a0, 0.9);
      g.fillRect(20, 14, 4, 8);
    });

    // Government building
    this.createTexture('govt', 32, (g) => {
      g.fillStyle(0xe8d880, 1);
      g.fillRect(4, 8, 24, 20);
      g.fillStyle(0xc0b060, 1);
      g.fillRect(4, 8, 24, 5);
      // columns
      g.fillStyle(0xfff8e0, 1);
      g.fillRect(6, 10, 3, 18);
      g.fillRect(11, 10, 3, 18);
      g.fillRect(16, 10, 3, 18);
      g.fillRect(23, 10, 3, 18);
      // pediment
      g.fillStyle(0xd4c870, 1);
      g.fillTriangle(4, 8, 28, 8, 16, 2);
    });

    // Park / tree cluster
    this.createTexture('tree', 32, (g) => {
      g.fillStyle(0x5a3010, 1);
      g.fillRect(14, 20, 4, 10);
      g.fillStyle(0x2a7040, 1);
      g.fillRect(6, 4, 20, 18);
      g.fillStyle(0x1a5030, 1);
      g.fillRect(9, 7, 5, 5);
      g.fillRect(18, 8, 5, 5);
      g.fillRect(13, 14, 7, 5);
    });

    // Chamber of commerce
    this.createTexture('chamber', 32, (g) => {
      g.fillStyle(0x804020, 1);
      g.fillRect(4, 7, 24, 21);
      g.fillStyle(0x602010, 1);
      g.fillRect(4, 7, 24, 5);
      g.fillStyle(0xffc060, 1);
      g.fillRect(12, 14, 8, 10);
      // briefcase icon
      g.fillStyle(0x402010, 1);
      g.fillRect(13, 12, 6, 2);
    });

    // Agent sprites by archetype
    const agentColors: Record<string, number> = {
      default: p.ink,
      student: 0x0a3050,
      employer: 0x500820,
      senior_worker: 0x302010,
    };

    for (const [suffix, color] of Object.entries(agentColors)) {
      this.createTexture(`agent_${suffix}`, 32, (g) => {
        // body
        g.fillStyle(color, 1);
        g.fillRect(9, 4, 14, 22);
        // head circle
        g.fillStyle(0xf8d8b0, 1);
        g.fillCircle(16, 7, 6);
        // shirt
        g.fillStyle(0xffffff, 0.6);
        g.fillRect(11, 13, 10, 7);
        // feet
        g.fillStyle(0x303030, 1);
        g.fillRect(10, 24, 5, 4);
        g.fillRect(17, 24, 5, 4);
      });
    }

    // Follow arrow — glowing neon
    this.createTexture('follow-arrow', 32, (g) => {
      g.fillStyle(0x00d4ff, 1);
      g.fillTriangle(6, 28, 26, 28, 16, 6);
      g.fillStyle(0xffffff, 0.7);
      g.fillTriangle(10, 24, 22, 24, 16, 11);
    });

    // Interaction pulse circle
    this.createTexture('pulse', 32, (g) => {
      g.lineStyle(3, 0x00d4ff, 1);
      g.strokeCircle(16, 16, 13);
      g.lineStyle(1, 0x00d4ff, 0.4);
      g.strokeCircle(16, 16, 10);
    });
  }

  // ─── WORLD RENDER ──────────────────────────────────────────────────────────

  private makeWorld(): void {
    const worldWidth = dashboardWorld.width;
    const worldHeight = dashboardWorld.height;
    const p = palettes[this.theme];

    this.cameras.main.setBackgroundColor(p.board);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.currentZoom = this.cameraState.zoom || this.zoom;
    this.cameras.main.setZoom(this.currentZoom);
    if (this.cameraState.scrollX === undefined) {
      this.cameras.main.centerOn(dashboardWorld.focus[0], dashboardWorld.focus[1]);
    } else {
      this.cameras.main.setScroll(this.cameraState.scrollX, this.cameraState.scrollY ?? 0);
    }

    // Minimap
    const miniW = 244, miniH = 172;
    const miniX = 1280 - miniW - 18;
    const miniY = 860 - miniH - 18;
    const miniCamera = this.cameras.add(miniX, miniY, miniW, miniH);
    this.minimapCamera = miniCamera;
    miniCamera.setBounds(0, 0, worldWidth, worldHeight);
    miniCamera.setZoom(Math.min(miniW / worldWidth, miniH / worldHeight) * 0.98);
    miniCamera.centerOn(dashboardWorld.focus[0], dashboardWorld.focus[1]);
    miniCamera.setBackgroundColor(p.board);

    // Ground tiles
    const bg = this.add.tileSprite(worldWidth / 2, worldHeight / 2, worldWidth + 480, worldHeight + 320, 'grass');
    bg.setDepth(-12);

    // ─── WATERWAYS (OSM Grand River + tributaries) ──────────────────────────
    const waterGraphics = this.add.graphics().setDepth(-11);
    grOsmRoads.waterways.forEach((way) => {
      const pts = way.points as Array<[number, number]>;
      if (pts.length < 2) return;
      const isRiver = way.kind === 'river';
      waterGraphics.lineStyle(isRiver ? 120 : 30, p.water, isRiver ? 0.85 : 0.55);
      waterGraphics.beginPath();
      waterGraphics.moveTo(pts[0]![0], pts[0]![1]);
      for (let i = 1; i < pts.length; i++) waterGraphics.lineTo(pts[i]![0], pts[i]![1]);
      waterGraphics.strokePath();
    });
    // Shimmer overlay on rivers
    const shimmer = this.add.graphics().setDepth(-10);
    shimmer.lineStyle(20, this.theme === 'dark' ? 0x2a6090 : 0xaaddf0, 0.3);
    grOsmRoads.waterways
      .filter((w) => w.kind === 'river')
      .forEach((way) => {
        const pts = way.points as Array<[number, number]>;
        if (pts.length < 2) return;
        shimmer.beginPath();
        shimmer.moveTo(pts[0]![0], pts[0]![1]);
        for (let i = 1; i < pts.length; i++) shimmer.lineTo(pts[i]![0], pts[i]![1]);
        shimmer.strokePath();
      });

    // ─── WARD OVERLAYS ───────────────────────────────────────────────────────
    this.wardGraphics = this.add.graphics().setDepth(-9);
    GR_WARDS.forEach((ward) => {
      const [wx, wy, ww, wh] = ward.bounds;
      const color = Number.parseInt(ward.color.slice(1), 16);
      this.wardGraphics!.fillStyle(color, this.theme === 'dark' ? 0.06 : 0.04);
      this.wardGraphics!.fillRect(wx, wy, ww, wh);
      this.wardGraphics!.lineStyle(6, color, this.theme === 'dark' ? 0.25 : 0.18);
      this.wardGraphics!.strokeRect(wx, wy, ww, wh);
      // Ward label
      const cx = wx + ww / 2;
      const cy = wy + wh / 2;
      const label = this.add.text(cx, cy - 40, ward.name.toUpperCase(), {
        color: ward.color,
        fontFamily: 'DM Mono, monospace',
        fontSize: '96px',
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(-8).setAlpha(0.18);
      const sublabel = this.add.text(cx, cy + 60, ward.commissioners.join('  ·  '), {
        color: this.theme === 'dark' ? '#4a6080' : '#6a8090',
        fontFamily: 'DM Mono, monospace',
        fontSize: '52px',
      }).setOrigin(0.5).setDepth(-8).setAlpha(0.25);
      this.minimapCamera?.ignore([label, sublabel]);
    });

    // ─── DISTRICT OVERLAYS ───────────────────────────────────────────────────
    const districtGraphics = this.add.graphics().setDepth(-10);
    dashboardWorld.districts.forEach((d) => {
      const [x, y, w, h] = d.bounds;
      districtGraphics.fillStyle(Number.parseInt(d.color.slice(1), 16), 0.10);
      districtGraphics.fillRect(x, y, w, h);
      const labelText = this.add.text(x + w / 2, y + h / 2 - 80, d.name.toUpperCase(), {
        color: this.theme === 'dark' ? '#6ae0b0' : '#2a5a40',
        fontFamily: 'DM Mono, monospace',
        fontSize: '60px',
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(-8).setAlpha(0.35);
      this.minimapCamera?.ignore(labelText);
    });

    // ─── ROADS (real OSM Grand Rapids network) ───────────────────────────────
    // Road widths by type (in world-units, visible at 0.1× zoom)
    const roadWidths: Record<string, number> = {
      motorway: 160, trunk: 130, primary: 100, secondary: 70, tertiary: 46, residential: 28,
    };
    const roadOpacities: Record<string, number> = {
      motorway: 1.0, trunk: 1.0, primary: 0.95, secondary: 0.9, tertiary: 0.85, residential: 0.75,
    };
    const roadLineWidths: Record<string, number> = {
      motorway: 8, trunk: 6, primary: 5, secondary: 4, tertiary: 3, residential: 0,
    };

    // Draw residential + tertiary first (bottom), then secondaries, then primaries on top
    const tierGroups: Record<string, string[]> = {
      tier1: ['residential'],
      tier2: ['tertiary'],
      tier3: ['secondary'],
      tier4: ['primary', 'trunk', 'motorway'],
    };

    Object.entries(tierGroups).forEach(([tier, kinds], tierIdx) => {
      const roadG = this.add.graphics().setDepth(-6 + tierIdx);
      const lineG = this.add.graphics().setDepth(-5 + tierIdx);

      grOsmRoads.roads
        .filter((r) => kinds.includes(r.kind))
        .forEach((road) => {
          const pts = road.points as Array<[number, number]>;
          if (pts.length < 2) return;
          const w = roadWidths[road.kind] ?? 28;
          const op = roadOpacities[road.kind] ?? 0.8;
          const lw = roadLineWidths[road.kind] ?? 0;

          // Edge border drawn first (wider) so road surface sits on top
          const edgeColor = this.theme === 'light' ? 0x6688aa : 0x001833;
          const edgeAlpha = this.theme === 'light' ? 0.60 : 0.45;
          roadG.lineStyle(w + 12, edgeColor, edgeAlpha);
          roadG.beginPath();
          roadG.moveTo(pts[0]![0], pts[0]![1]);
          for (let i = 1; i < pts.length; i++) roadG.lineTo(pts[i]![0], pts[i]![1]);
          roadG.strokePath();

          // Road surface on top
          roadG.lineStyle(w, p.road, op);
          roadG.beginPath();
          roadG.moveTo(pts[0]![0], pts[0]![1]);
          for (let i = 1; i < pts.length; i++) roadG.lineTo(pts[i]![0], pts[i]![1]);
          roadG.strokePath();

          if (lw > 0) {
            lineG.lineStyle(lw, p.roadDash, 0.5);
            lineG.beginPath();
            lineG.moveTo(pts[0]![0], pts[0]![1]);
            for (let i = 1; i < pts.length; i++) lineG.lineTo(pts[i]![0], pts[i]![1]);
            lineG.strokePath();
          }
        });
    });

    // ─── ROAD CENTER DASHES (zoom-in fidelity) ───────────────────────────────
    // Only primary/secondary roads get dashes — visible when zoomed to street level
    const dashG = this.add.graphics().setDepth(-1);
    grOsmRoads.roads
      .filter((r) => ['primary', 'trunk', 'motorway', 'secondary'].includes(r.kind))
      .forEach((road) => {
        const pts = road.points as Array<[number, number]>;
        if (pts.length < 2) return;
        const dashColor = this.theme === 'dark' ? 0xffffff : 0xffdd44;
        const dashAlpha = this.theme === 'dark' ? 0.12 : 0.22;
        // Draw dashes by sampling segments at fixed intervals
        for (let i = 0; i < pts.length - 1; i++) {
          const [x1, y1] = pts[i]!;
          const [x2, y2] = pts[i + 1]!;
          const segLen = Math.hypot(x2 - x1, y2 - y1);
          const dashLen = 80;
          const gapLen = 120;
          const period = dashLen + gapLen;
          const count = Math.floor(segLen / period);
          for (let d = 0; d < count; d++) {
            const t0 = (d * period) / segLen;
            const t1 = (d * period + dashLen) / segLen;
            const dx0 = x1 + (x2 - x1) * t0;
            const dy0 = y1 + (y2 - y1) * t0;
            const dx1 = x1 + (x2 - x1) * Math.min(t1, 1);
            const dy1 = y1 + (y2 - y1) * Math.min(t1, 1);
            dashG.lineStyle(5, dashColor, dashAlpha);
            dashG.lineBetween(dx0, dy0, dx1, dy1);
          }
        }
      });

    // ─── HOMES ───────────────────────────────────────────────────────────────
    this.toRows.forEach((row) => {
      const house = this.add.image(row.home_x, row.home_y - 42, 'house').setScale(1.8).setDepth(1);
      this.minimapCamera?.ignore(house);
    });

    // ─── INSTITUTIONS ─────────────────────────────────────────────────────────
    dashboardWorld.institutions.forEach((inst, i) => {
      const textureMap: Record<string, string> = {hub: 'hub', market: 'market', tower: 'tower', house: 'house', tree: 'tree'};
      const texture = textureMap[inst.texture] ?? 'tower';
      const offsetIndex = i % 5;
      const offsetX = (offsetIndex - 2) * 86;
      const offsetY = (Math.floor(i / 5) % 2) * 70 - 35;
      const scale = inst.layer <= 2 ? 5.2 : 4.0;
      const sprite = this.add.image(inst.x, inst.y, texture).setScale(scale).setTint(Number.parseInt(inst.tint.slice(1), 16)).setDepth(2);
      this.minimapCamera?.ignore(sprite);

      // Label
      const labelColor = this.theme === 'dark' ? '#c0e8ff' : '#102a3a';
      const panelColor = this.theme === 'dark' ? 0x050e20 : 0xfff8f0;
      const borderColor = this.theme === 'dark' ? 0x00aadd : 0x336699;
      const text = this.add.text(inst.x + offsetX, inst.y + offsetY - 90, inst.name.toUpperCase(), {
        color: labelColor,
        fontFamily: 'DM Mono, monospace',
        fontSize: inst.layer <= 2 ? '50px' : '40px',
        fontStyle: 'bold',
      }).setOrigin(0.5, 1).setDepth(4).setLetterSpacing(1.5);
      const panel = this.add.rectangle(inst.x + offsetX, inst.y + offsetY - 85, text.width + 24, text.height + 16, panelColor, 0.90).setOrigin(0.5, 1).setDepth(3).setStrokeStyle(2, borderColor, 1);
      this.minimapCamera?.ignore([text, panel]);
    });

    // ─── SOCIAL VENUES (GR-specific) ─────────────────────────────────────────
    GR_VENUES.forEach((venue) => {
      const textureMap: Record<string, string> = {coffee: 'coffee', bar: 'bar', club: 'bar', network: 'hub', govt: 'govt', chamber: 'chamber', citycouncil: 'govt', education: 'tower', park: 'tree'};
      const texture = textureMap[venue.kind] ?? 'hub';
      const scale = venue.kind === 'govt' || venue.kind === 'chamber' ? 4.5 : 3.2;
      const color = VENUE_COLORS[venue.kind] ?? 0xffffff;
      const venueSprite = this.add.image(venue.x, venue.y, texture).setScale(scale).setTint(color).setDepth(2);
      this.minimapCamera?.ignore(venueSprite);

      // Venue glow dot on minimap
      const minimapDot = this.add.circle(venue.x, venue.y, 80, color, 0.5).setDepth(2);
      this.cameras.main.ignore(minimapDot);

      // Venue label
      const vIcon = venue.kind === 'coffee' ? '☕' : venue.kind === 'bar' ? '🍺' : venue.kind === 'club' ? '🎵' : venue.kind === 'chamber' ? '💼' : venue.kind === 'govt' ? '🏛' : '🤝';
      const labelColor = this.theme === 'dark' ? '#b8d4f0' : '#102a3a';
      const panelColor2 = this.theme === 'dark' ? 0x060e1a : 0xfff4e8;
      const vtext = this.add.text(venue.x, venue.y - 78, `${vIcon} ${venue.name}`, {
        color: labelColor,
        fontFamily: 'DM Mono, monospace',
        fontSize: '36px',
      }).setOrigin(0.5, 1).setDepth(4);
      const vpanel = this.add.rectangle(venue.x, venue.y - 74, vtext.width + 18, vtext.height + 12, panelColor2, 0.88).setOrigin(0.5, 1).setDepth(3).setStrokeStyle(2, color, 0.7);
      this.minimapCamera?.ignore([vtext, vpanel]);
    });

    // ─── TREES ───────────────────────────────────────────────────────────────
    dashboardWorld.districts.forEach((d, i) => {
      const [x, y, w, h] = d.bounds;
      for (let t = 0; t < 3; t++) {
        const tx = x + w * (0.15 + (i + t) * 0.22 % 0.7);
        const ty = y + h * (0.1 + t * 0.28);
        const tree = this.add.image(tx, ty, 'tree').setScale(2.8 + (t % 2) * 0.6).setDepth(1);
        this.minimapCamera?.ignore(tree);
      }
    });

    // ─── INTERACTION GRAPHICS LAYER ──────────────────────────────────────────
    this.interactionGraphics = this.add.graphics().setDepth(4);

    // ─── PARTICLE GRAPHICS ───────────────────────────────────────────────────
    this.particleGraphics = this.add.graphics().setDepth(12);

    // ─── AGENTS ──────────────────────────────────────────────────────────────
    this.toRows.forEach((row) => {
      const placement = placementForTime(row, this.displayTimeInWeek);
      const texture = 'agent_default';
      const sprite = this.add.sprite(placement.point.x, placement.point.y, texture);
      sprite.setScale(1.22);
      sprite.setTint(palettes[this.theme].statuses[row.status]);
      sprite.setDepth(6);
      sprite.setVisible(!placement.hidden);
      sprite.setData('agentId', row.agent_id);
      sprite.setInteractive(new Phaser.Geom.Rectangle(-14, -14, 28, 28), Phaser.Geom.Rectangle.Contains);
      sprite.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() < 8) {
          this.onAgentProfile(row);
          this.onAgentToggle(row, (pointer.event as MouseEvent).shiftKey);
          Sounds.playClick();
        }
      });
      sprite.on('pointerover', () => { sprite.setScale(1.5); this.input.setDefaultCursor('pointer'); });
      sprite.on('pointerout', () => { sprite.setScale(this.followedAgentIds.has(row.agent_id) ? 1.65 : 1.22); this.input.setDefaultCursor('grab'); });
      this.sprites.set(row.agent_id, sprite);
      this.agentRows.set(row.agent_id, row);

      const shadow = this.add.circle(placement.point.x, placement.point.y + 14, 10, 0x000000, 0.13);
      shadow.setDepth(5);
      shadow.setVisible(!placement.hidden);
      this.shadows.set(row.agent_id, shadow);
    });

    this.applyReplayFrame(this.displayTimeInWeek, 0);
    this.setFollowedAgents([...this.followedAgentIds]);

    // ─── INPUT ───────────────────────────────────────────────────────────────
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _: Phaser.GameObjects.GameObject[], _dx: number, deltaY: number) => {
      const factor = Phaser.Math.Clamp(Math.exp(-deltaY * 0.0008), 0.96, 1.04);
      this.zoomAt(pointer.x, pointer.y, this.currentZoom * factor);
    });
    this.input.setDefaultCursor('grab');
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      this.dragStart = {x: pointer.x, y: pointer.y, scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY};
      this.input.setDefaultCursor('grabbing');
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart || !pointer.isDown) return;
      const cam = this.cameras.main;
      cam.scrollX = this.dragStart.scrollX - (pointer.x - this.dragStart.x) / cam.zoom;
      cam.scrollY = this.dragStart.scrollY - (pointer.y - this.dragStart.y) / cam.zoom;
      this.cameraState.scrollX = cam.scrollX;
      this.cameraState.scrollY = cam.scrollY;
    });
    const endDrag = (pointer?: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[] = []) => {
      this.dragStart = null;
      this.input.setDefaultCursor('grab');
      if (pointer && pointer.getDistance() < 8 && !(pointer.event as MouseEvent).shiftKey && !over.some((o) => o.getData('agentId'))) {
        this.onClearFollow();
      }
    };
    this.input.on('pointerup', endDrag);
    this.input.on('pointerupoutside', () => endDrag());
  }

  // ─── VFX ───────────────────────────────────────────────────────────────────

  private emitBuildingFlash(point: Point, color: number): void {
    // Always compare against the live palette so theme changes don't break detection
    const isEmployment = color === palettes[this.theme].statuses.employed;
    // Rings need higher alpha in light mode — neon on pale green washes out at low opacity
    const ringAlpha1 = this.theme === 'light' ? 0.30 : 0.12;
    const ringAlpha2 = this.theme === 'light' ? 0.18 : 0.06;

    const core = this.add.circle(point.x, point.y, 80, color, 0.92).setDepth(9);
    const ring1 = this.add.circle(point.x, point.y, 140, color, ringAlpha1).setDepth(8).setStrokeStyle(14, color, 1);
    const ring2 = this.add.circle(point.x, point.y, 200, color, ringAlpha2).setDepth(7).setStrokeStyle(8, color, 0.85);

    this.tweens.add({targets: core, scale: 3.5, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => core.destroy()});
    this.tweens.add({targets: ring1, scale: 5.0, alpha: 0, duration: 850, ease: 'Cubic.easeOut', onComplete: () => ring1.destroy()});
    this.tweens.add({targets: ring2, scale: 7.0, alpha: 0, duration: 1000, ease: 'Cubic.easeOut', onComplete: () => ring2.destroy()});

    if (isEmployment) {
      const labelColor = this.theme === 'light' ? '#00aa44' : '#00ff88';
      const strokeColor = this.theme === 'light' ? '#ffffff' : '#003322';
      const label = this.add.text(point.x, point.y - 60, 'EMPLOYED!', {
        fontSize: '80px',
        fontFamily: 'Orbitron, Space Grotesk, sans-serif',
        color: labelColor,
        stroke: strokeColor,
        strokeThickness: 10,
      }).setOrigin(0.5).setDepth(12).setAlpha(0.98);
      this.tweens.add({
        targets: label,
        y: point.y - 280,
        alpha: 0,
        duration: 1600,
        ease: 'Cubic.easeOut',
        onComplete: () => label.destroy(),
      });
      this.spawnParticleBurst(point, color, 24);
      Sounds.playEmployed();
    } else {
      // Soft ping for entry/exit — hard throttle: max 1 sound per 600ms regardless of how
      // many agents transition simultaneously (prevents AudioContext node flood)
      const now = Date.now();
      if (now - this.lastAmbientSoundMs >= 600) {
        this.lastAmbientSoundMs = now;
        Sounds.playAware();
      }
    }
  }

  private spawnParticleBurst(center: Point, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 250 + Math.random() * 400;
      this.particles.push({
        x: center.x,
        y: center.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 120,
        life: 1.0 + Math.random() * 0.6,
        maxLife: 1.0 + Math.random() * 0.6,
        color,
        size: 10 + Math.random() * 14,
      });
    }
  }

  private spawnNetworkSpark(from: Point, to: Point): void {
    const mid = {x: (from.x + to.x) / 2 + (Math.random() - 0.5) * 80, y: (from.y + to.y) / 2 + (Math.random() - 0.5) * 80};
    // Brief connection line VFX
    const line = this.add.line(0, 0, from.x, from.y, to.x, to.y, 0x00d4ff, 0.4).setLineWidth(2).setDepth(7);
    this.tweens.add({targets: line, alpha: 0, duration: 600, ease: 'Cubic.easeOut', onComplete: () => line.destroy()});
    // Spark at midpoint
    const spark = this.add.circle(mid.x, mid.y, 8, 0x00d4ff, 0.9).setDepth(8);
    this.tweens.add({targets: spark, scale: 3, alpha: 0, duration: 400, ease: 'Cubic.easeOut', onComplete: () => spark.destroy()});
  }

  private updateParticles(delta: number): void {
    const dt = delta / 1000;
    const g = this.particleGraphics;
    if (!g) return;
    g.clear();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt; // gravity
      const alpha = Math.min(1, p.life / p.maxLife * 2);
      g.fillStyle(p.color, alpha * 0.85);
      g.fillCircle(p.x, p.y, p.size * (p.life / p.maxLife));
    }
  }

  // ─── FOLLOW MARKERS ────────────────────────────────────────────────────────

  setFollowedAgents(agentIds: string[]): void {
    this.followedAgentIds = new Set(agentIds);
    const palette = palettes[this.theme];

    // Remove stale markers
    this.followMarkers.forEach((container, agentId) => {
      if (!this.followedAgentIds.has(agentId)) {
        container.destroy();
        this.followMarkers.delete(agentId);
      }
    });

    this.sprites.forEach((sprite, agentId) => {
      const row = this.agentRows.get(agentId);
      const isFollowed = this.followedAgentIds.has(agentId);
      sprite.setScale(isFollowed ? 1.65 : 1.22);
      if (isFollowed) sprite.setTint(palette.accent);
      else if (row) sprite.setTint(palette.statuses[row.status]);

      if (isFollowed && !this.followMarkers.has(agentId)) {
        const arrow = this.add.image(0, -44, 'follow-arrow').setScale(1.2);
        const glow = this.add.circle(0, -44, 18, palette.accent, 0.18);
        const container = this.add.container(sprite.x, sprite.y, [glow, arrow]).setDepth(11);
        this.followMarkers.set(agentId, container);
        this.minimapCamera?.ignore(container);
      }
    });
  }

  setZoomLevel(zoom: number): void {
    if (Math.abs(zoom - this.currentZoom) < 0.001) return;
    this.zoomAt(this.cameras.main.width / 2, this.cameras.main.height / 2, zoom);
  }

  // ─── REPLAY FRAME ──────────────────────────────────────────────────────────

  private applyReplayFrame(timeInWeek: number, deltaHours: number): void {
    const placements = new Map<string, AgentPlacement>();
    const blockedAgents = new Set<string>();

    this.agentRows.forEach((row, agentId) => {
      const delay = this.trafficDelayHours.get(agentId) ?? 0;
      let placement = placementForTime(row, timeInWeek - delay);
      const previous = this.lastPlacements.get(agentId);

      if (placement.hidden) {
        this.trafficDelayHours.delete(agentId);
      } else if (placement.moving) {
        const stopDist = Math.min(24, placement.segmentLength * 0.12);
        const changedSegment = previous?.moving && previous.laneKey !== placement.laneKey;
        if (changedSegment && previous && !signalIsGreen(previous, timeInWeek)) {
          placement = withSegmentDistance(previous, previous.segmentLength - stopDist);
          blockedAgents.add(agentId);
        } else if (placement.segmentDistance >= placement.segmentLength - stopDist && !signalIsGreen(placement, timeInWeek)) {
          placement = withSegmentDistance(placement, placement.segmentLength - stopDist);
          blockedAgents.add(agentId);
        }
      }
      placements.set(agentId, placement);
    });

    // Lane queuing
    const lanes = new Map<string, AgentPlacement[]>();
    placements.forEach((placement) => {
      if (!placement.moving || placement.hidden) return;
      const lane = lanes.get(placement.laneKey) ?? [];
      lane.push(placement);
      lanes.set(placement.laneKey, lane);
    });

    lanes.forEach((lane) => {
      lane.sort((a, b) => b.segmentDistance - a.segmentDistance);
      let leaderDistance = Number.POSITIVE_INFINITY;
      lane.forEach((placement) => {
        const row = this.agentRows.get(placement.agentId);
        const gap = row?.mobility_mode === 'car' ? 38 : row?.mobility_mode === 'bike' ? 31 : 26;
        const allowed = leaderDistance - gap;
        if (placement.segmentDistance > allowed) {
          const prev = this.lastPlacements.get(placement.agentId);
          const queued = allowed < 0 && prev?.moving ? prev : withSegmentDistance(placement, Math.max(0, allowed));
          placements.set(placement.agentId, queued);
          blockedAgents.add(placement.agentId);
          leaderDistance = Math.max(0, allowed);
        } else {
          leaderDistance = placement.segmentDistance;
        }
      });
    });

    // Apply to sprites — also detect interactions for networking VFX
    placements.forEach((placement, agentId) => {
      const sprite = this.sprites.get(agentId);
      const shadow = this.shadows.get(agentId);
      const row = this.agentRows.get(agentId);
      if (!sprite || !shadow) return;
      const previous = this.lastPlacements.get(agentId);
      if (row && previous && previous.phase !== placement.phase) {
        const arriving = placement.phase === 'onsite' || placement.phase === 'home';
        const anchor = arriving ? placement.buildingAnchor : previous.buildingAnchor;
        const statusColor = palettes[this.theme].statuses[row.status];
        this.emitBuildingFlash(anchor, statusColor);
      }
      sprite.setPosition(placement.point.x, placement.point.y);
      shadow.setPosition(placement.point.x, placement.point.y + 14);
      sprite.setVisible(!placement.hidden);
      shadow.setVisible(!placement.hidden);
      const marker = this.followMarkers.get(agentId);
      if (marker) { marker.setPosition(placement.point.x, placement.point.y); marker.setVisible(!placement.hidden); }
      this.lastPlacements.set(agentId, placement);
    });

    // ─── SIGNAL LIGHTS at road intersections ──────────────────────────────────
    // Draw per-frame onto interactionGraphics so they update with traffic state
    if (this.interactionGraphics && this.frameCount % 2 === 0) {
      const ig = this.interactionGraphics;
      ig.clear();
      const p = palettes[this.theme];

      // Collect blocked intersection nodes
      const blockedNodes = new Set<string>();
      blockedAgents.forEach((agentId) => {
        const pl = placements.get(agentId);
        if (!pl) return;
        const key = `${pl.segmentEnd.x},${pl.segmentEnd.y}`;
        blockedNodes.add(key);
      });

      // Draw signal dots at ROAD_X × ROAD_Y intersections
      ROAD_X.forEach((x) => {
        ROAD_Y.forEach((y) => {
          const key = `${x},${y}`;
          const isBlocked = blockedNodes.has(key);
          const sigColor = isBlocked ? (p as {sigRed: number}).sigRed : (p as {sigGreen: number}).sigGreen;
          const alpha = isBlocked ? 0.92 : 0.55;
          const r = isBlocked ? 26 : 18;

          ig.fillStyle(sigColor, alpha);
          ig.fillCircle(x, y, r);

          // Glow halo
          ig.fillStyle(sigColor, isBlocked ? 0.22 : 0.10);
          ig.fillCircle(x, y, r * 2.4);

          // Pulsing outer ring for blocked (red)
          if (isBlocked) {
            ig.lineStyle(6, sigColor, 0.7);
            ig.strokeCircle(x, y, r * 3.5);
          }
        });
      });

      // Agent status glow rings — drawn in world space, scale with camera zoom naturally
      placements.forEach((placement, agentId) => {
        if (placement.hidden || placement.phase === 'home') return;
        const row = this.agentRows.get(agentId);
        if (!row) return;
        const statusColor = p.statuses[row.status];
        const isFollowed = this.followedAgentIds.has(agentId);
        if (!isFollowed && row.status === 'unaware') return; // skip unaware for perf

        const gAlpha = isFollowed ? 0.45 : (row.status === 'employed' ? 0.30 : row.status === 'training' ? 0.25 : 0.18);
        ig.lineStyle(isFollowed ? 10 : 6, statusColor, gAlpha);
        ig.strokeCircle(placement.point.x, placement.point.y, isFollowed ? 36 : 26);
      });
    }

    // Networking sparks — every 4 frames, randomly spark between nearby followed agents
    if (deltaHours > 0 && this.frameCount % 4 === 0 && this.followedAgentIds.size >= 2) {
      const followedPlacements = [...this.followedAgentIds]
        .map((id) => placements.get(id))
        .filter((p): p is AgentPlacement => !!p && !p.hidden);
      if (followedPlacements.length >= 2) {
        const a = followedPlacements[0]!;
        const b = followedPlacements[Math.floor(Math.random() * followedPlacements.length)]!;
        if (dist(a.point, b.point) < 2000) this.spawnNetworkSpark(a.point, b.point);
      }
    }

    if (deltaHours > 0) {
      blockedAgents.forEach((agentId) => {
        this.trafficDelayHours.set(agentId, (this.trafficDelayHours.get(agentId) ?? 0) + deltaHours);
      });
    }
  }

  // ─── PUBLIC API ────────────────────────────────────────────────────────────

  updateReplay(_week: number, day: number, hour: number, rows: AgentRow[]): void {
    rows.forEach((row) => {
      this.agentRows.set(row.agent_id, row);
      const sprite = this.sprites.get(row.agent_id);
      if (sprite) {
        sprite.setTint(
          this.followedAgentIds.has(row.agent_id)
            ? palettes[this.theme].accent
            : palettes[this.theme].statuses[row.status],
        );
      }
    });

    const targetTime = day * 24 + hour;
    if (!this.ready) { this.displayTimeInWeek = targetTime; return; }
    if (this.clockTweenTarget) this.tweens.killTweensOf(this.clockTweenTarget);
    if (targetTime < this.displayTimeInWeek || targetTime - this.displayTimeInWeek > 1) {
      this.displayTimeInWeek = targetTime;
      this.trafficDelayHours.clear();
      this.lastPlacements.clear();
      this.applyReplayFrame(targetTime, 0);
      return;
    }

    const clock = {value: this.displayTimeInWeek};
    this.clockTweenTarget = clock;
    let prev = this.displayTimeInWeek;
    this.tweens.add({
      targets: clock,
      value: targetTime,
      duration: Math.max(90, 130 / this.speedMultiplier),
      ease: 'Linear',
      onUpdate: () => {
        const dh = Math.max(0, clock.value - prev);
        this.displayTimeInWeek = clock.value;
        this.applyReplayFrame(clock.value, dh);
        prev = clock.value;
      },
      onComplete: () => { this.displayTimeInWeek = targetTime; this.clockTweenTarget = null; },
    });
  }

  // ─── LIFECYCLE ─────────────────────────────────────────────────────────────

  create(): void {
    this.makeTextures();
    this.makeWorld();
    this.ready = true;
  }

  update(_time: number, delta: number): void {
    this.frameCount++;

    // Bobbing follow markers
    this.followMarkers.forEach((container, agentId) => {
      const sprite = this.sprites.get(agentId);
      if (!sprite) return;
      container.setPosition(sprite.x, sprite.y + Math.sin(_time / 160) * 4);
    });

    // Update particles
    this.updateParticles(delta);

    // Smooth camera follow
    const followed = [...this.followedAgentIds]
      .map((id) => this.sprites.get(id))
      .filter((s): s is Phaser.GameObjects.Sprite => Boolean(s?.visible));

    if (followed.length === 0 || this.dragStart) return;

    const xs = followed.map((s) => s.x);
    const ys = followed.map((s) => s.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const cam = this.cameras.main;
    const spanX = Math.max(...xs) - Math.min(...xs) + 280;
    const spanY = Math.max(...ys) - Math.min(...ys) + 240;
    const fitZoom = followed.length > 1 ? Math.min(1280 / spanX, 860 / spanY, this.currentZoom) : this.currentZoom;
    const targetZoom = Phaser.Math.Clamp(fitZoom, 0.035, 3);
    const s = 1 - Math.exp(-delta / 180);
    cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, s));
    cam.scrollX = Phaser.Math.Linear(cam.scrollX, cx - cam.width / (2 * cam.zoom), s);
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, cy - cam.height / (2 * cam.zoom), s);
    this.cameraState.scrollX = cam.scrollX;
    this.cameraState.scrollY = cam.scrollY;
    this.cameraState.zoom = this.currentZoom;
  }
}

// ─── REACT WRAPPER ────────────────────────────────────────────────────────────

export function PhaserReplay({
  run, week, day, hour, followedAgentIds, speedMultiplier, theme, zoom, onZoomChange, onAgentToggle, onAgentProfile, onClearFollow,
}: {
  run: DashboardRun; week: number; day: number; hour: number;
  followedAgentIds: string[]; speedMultiplier: number; theme: ThemeMode;
  zoom: number; onZoomChange: (z: number) => void;
  onAgentToggle: (agent: AgentRow, additive: boolean) => void;
  onAgentProfile: (agent: AgentRow) => void;
  onClearFollow: () => void;
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<ReplayScene | null>(null);
  const prevStateRef = useRef<{runId: string; week: number} | null>(null);
  const cameraStateRef = useRef<CameraState>({zoom});

  useEffect(() => {
    if (!hostRef.current) return;
    const prev = prevStateRef.current?.runId === run.run_id ? prevStateRef.current : null;
    const fromWeek = prev?.week ?? week;
    const fromRows = run.agentRows.filter((r) => r.week === fromWeek);
    const toRows = run.agentRows.filter((r) => r.week === week);

    const scene = new ReplayScene(run, fromWeek, week, day, hour, fromRows, toRows, followedAgentIds, speedMultiplier, theme, zoom, cameraStateRef.current, onZoomChange, onAgentToggle, onAgentProfile, onClearFollow);
    sceneRef.current = scene;
    gameRef.current = new Phaser.Game({
      type: Phaser.CANVAS,
      parent: hostRef.current,
      width: 1280,
      height: 860,
      backgroundColor: theme === 'dark' ? '#081428' : '#b8c8b8',
      pixelArt: false,
      antialias: true,
      roundPixels: false,
      scene: [scene],
      input: {mouse: {preventDefaultWheel: true}},
    });
    prevStateRef.current = {runId: run.run_id, week};
    return () => { gameRef.current?.destroy(true); gameRef.current = null; sceneRef.current = null; };
  }, [run, speedMultiplier, theme, onAgentToggle, onAgentProfile, onClearFollow, onZoomChange]);

  useEffect(() => {
    sceneRef.current?.updateReplay(week, day, hour, run.agentRows.filter((r) => r.week === week));
    prevStateRef.current = {runId: run.run_id, week};
  }, [run, week, day, hour]);

  useEffect(() => { sceneRef.current?.setFollowedAgents(followedAgentIds); }, [followedAgentIds]);
  useEffect(() => { sceneRef.current?.setZoomLevel(zoom); }, [zoom]);

  const lighting = lightingForHour(hour);
  return (
    <div className="phaser-host" ref={hostRef} aria-label="Grand Rapids city simulation">
      <div className="daylight-overlay" style={lighting} aria-hidden="true" />
    </div>
  );
}
