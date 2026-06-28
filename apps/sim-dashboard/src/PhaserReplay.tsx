import {useEffect, useRef} from 'react';
import type React from 'react';
import Phaser from 'phaser';
import type {AgentRow, DashboardRun} from './data';

type Point = {x: number; y: number};
type ThemeMode = 'light' | 'dark';
type CameraState = {zoom: number; scrollX?: number; scrollY?: number};

const palettes = {
  light: {
    board: '#b8d1ad', grass: 0xb8d1ad, grassMark: 0x98bb8d, grassDot: 0x729f70,
    road: 0x304d5c, roadLine: 0xc83f55, roadDash: 0xf7cbd2, ink: 0x102a3a,
    panel: 0xffffff, panelLine: 0x9aabb9, accent: 0xe24d5f, tree: 0x284c63,
    statuses: {unaware: 0x7f8d9b, aware: 0x315b7d, training: 0xe24d5f, trained: 0x96394b, employed: 0x132f49},
  },
  dark: {
    board: '#125b37', grass: 0x125b37, grassMark: 0x1e7448, grassDot: 0x31a968,
    road: 0x26384b, roadLine: 0xff3158, roadDash: 0xff8399, ink: 0x050b12,
    panel: 0x101e2d, panelLine: 0xff3158, accent: 0xff3158, tree: 0x2f6680,
    statuses: {unaware: 0x71859a, aware: 0x37a4d8, training: 0xff3158, trained: 0xff7690, employed: 0x72d8ff},
  },
} satisfies Record<ThemeMode, Record<string, unknown>>;

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointOnPolyline(points: Point[], progress: number): Point {
  if (points.length === 0) return {x: 0, y: 0};
  if (points.length === 1) return points[0];

  const lengths = points.slice(1).map((point, index) => dist(points[index], point));
  const total = lengths.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return points[0];

  const target = total * ((progress % 1 + 1) % 1);
  let walked = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const segment = lengths[index];
    if (walked + segment >= target) {
      const local = (target - walked) / segment;
      return {
        x: lerp(points[index].x, points[index + 1].x, local),
        y: lerp(points[index].y, points[index + 1].y, local),
      };
    }
    walked += segment;
  }

  return points.at(-1) ?? points[0];
}

function routeForStatus(status: AgentRow['status']): Point[] {
  switch (status) {
    case 'unaware':
      return [
        {x: 140, y: 250},
        {x: 150, y: 420},
        {x: 470, y: 420},
        {x: 470, y: 260},
        {x: 240, y: 260},
        {x: 140, y: 250},
      ];
    case 'aware':
      return [
        {x: 220, y: 210},
        {x: 460, y: 210},
        {x: 460, y: 420},
        {x: 250, y: 420},
        {x: 220, y: 210},
      ];
    case 'training':
      return [
        {x: 530, y: 210},
        {x: 530, y: 420},
        {x: 720, y: 420},
        {x: 720, y: 230},
        {x: 530, y: 210},
      ];
    case 'trained':
      return [
        {x: 980, y: 220},
        {x: 980, y: 420},
        {x: 1260, y: 420},
        {x: 1260, y: 240},
        {x: 980, y: 220},
      ];
    case 'employed':
      return [
        {x: 1560, y: 570},
        {x: 1560, y: 420},
        {x: 1910, y: 420},
        {x: 1910, y: 930},
        {x: 1560, y: 930},
        {x: 1560, y: 570},
      ];
    default:
      return [{x: 0, y: 0}];
  }
}

function animatedPoint(row: AgentRow, week: number, speedMultiplier: number): Point {
  const route = routeForStatus(row.status);
  const hash = hashString(row.agent_id);
  const phase = (week * (0.08 + speedMultiplier * 0.03) + (hash % 113) / 113) % 1;
  const offset = ((hash >> 2) % 7) - 3;
  const point = pointOnPolyline(route, phase);

  return {
    x: point.x + offset * 3,
    y: point.y + ((hash >> 5) % 5 - 2) * 2,
  };
}

function routeTweenDuration(from: Point, to: Point, speedMultiplier: number): number {
  return Math.max(260, Math.round((dist(from, to) * 1.35 + 420) / speedMultiplier));
}

class ReplayScene extends Phaser.Scene {
  private readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly shadows = new Map<string, Phaser.GameObjects.Arc>();
  private readonly previousPositions = new Map<string, Point>();
  private readonly agentRows = new Map<string, AgentRow>();
  private readonly followMarkers = new Map<string, Phaser.GameObjects.Image>();
  private followedAgentIds = new Set<string>();
  private minimapCamera: Phaser.Cameras.Scene2D.Camera | null = null;
  private currentZoom: number;
  private dragStart: {x: number; y: number; scrollX: number; scrollY: number} | null = null;

  constructor(
    private readonly run: DashboardRun,
    private readonly fromWeek: number,
    private readonly toWeek: number,
    private readonly fromRows: AgentRow[],
    private readonly toRows: AgentRow[],
    initialFollowedAgentIds: string[],
    private readonly speedMultiplier: number,
    private readonly theme: ThemeMode,
    private readonly zoom: number,
    private readonly cameraState: CameraState,
    private readonly onZoomChange: (zoom: number) => void,
    private readonly onAgentToggle: (agent: AgentRow, additive: boolean) => void,
    private readonly onClearFollow: () => void,
  ) {
    super('ReplayScene');
    this.currentZoom = zoom;
    this.followedAgentIds = new Set(initialFollowedAgentIds);
  }

  private zoomAt(screenX: number, screenY: number, requestedZoom: number): void {
    const camera = this.cameras.main;
    const nextZoom = Phaser.Math.Clamp(requestedZoom, 0.38, 3);
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

  private createTexture(key: string, draw: (graphics: Phaser.GameObjects.Graphics) => void): void {
    const graphics = this.add.graphics();
    draw(graphics);
    graphics.generateTexture(key, 32, 32);
    graphics.destroy();
  }

  private tileRoad(x: number, y: number, w: number, h: number, depth = -2): void {
    for (let yy = 0; yy < h; yy += 32) {
      for (let xx = 0; xx < w; xx += 32) {
        this.add.image(x + xx, y + yy, 'road').setOrigin(0, 0).setDepth(depth);
      }
    }
  }

  private makeWorld(): void {
    const worldWidth = 2400;
    const worldHeight = 1600;

    const palette = palettes[this.theme];
    const boardBg = palette.board;

    this.cameras.main.setBackgroundColor(boardBg);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.currentZoom = this.cameraState.zoom || this.zoom;
    this.cameras.main.setZoom(this.currentZoom);
    if (this.cameraState.scrollX === undefined || this.cameraState.scrollY === undefined) {
      this.cameras.main.centerOn(worldWidth / 2, worldHeight / 2);
    } else {
      this.cameras.main.setScroll(this.cameraState.scrollX, this.cameraState.scrollY);
    }

    const miniWidth = 244;
    const miniHeight = 172;
    const miniX = 1280 - miniWidth - 18;
    const miniY = 860 - miniHeight - 18;
    const miniCamera = this.cameras.add(miniX, miniY, miniWidth, miniHeight);
    this.minimapCamera = miniCamera;
    miniCamera.setBounds(0, 0, worldWidth, worldHeight);
    miniCamera.setZoom(Math.min(miniWidth / worldWidth, miniHeight / worldHeight) * 0.98);
    miniCamera.centerOn(worldWidth / 2, worldHeight / 2);
    miniCamera.setBackgroundColor(boardBg);

    this.createTexture('grass', (graphics) => {
      graphics.fillStyle(palette.grass, 1);
      graphics.fillRect(0, 0, 32, 32);
      graphics.fillStyle(palette.grassMark, 1);
      graphics.fillRect(2, 4, 4, 4);
      graphics.fillRect(19, 7, 3, 3);
      graphics.fillRect(12, 18, 4, 4);
      graphics.fillRect(25, 22, 2, 2);
      graphics.fillStyle(palette.grassDot, 1);
      graphics.fillRect(7, 15, 2, 2);
      graphics.fillRect(21, 19, 2, 2);
    });
    this.createTexture('road', (graphics) => {
      graphics.fillStyle(palette.road, 1);
      graphics.fillRect(0, 0, 32, 32);
      graphics.fillStyle(palette.roadLine, 1);
      graphics.fillRect(1, 10, 30, 5);
      graphics.fillRect(1, 17, 30, 5);
      graphics.fillStyle(palette.roadDash, 1);
      graphics.fillRect(2, 12, 5, 1);
      graphics.fillRect(12, 12, 5, 1);
      graphics.fillRect(22, 12, 5, 1);
      graphics.fillRect(2, 19, 5, 1);
      graphics.fillRect(12, 19, 5, 1);
      graphics.fillRect(22, 19, 5, 1);
    });
    this.createTexture('house', (graphics) => {
      graphics.fillStyle(0xf4dbc0, 1);
      graphics.fillRect(5, 10, 22, 16);
      graphics.fillStyle(0xc46f54, 1);
      graphics.fillRect(4, 5, 24, 8);
      graphics.fillStyle(0x8e4d3b, 1);
      graphics.fillRect(12, 16, 8, 10);
    });
    this.createTexture('tower', (graphics) => {
      graphics.fillStyle(0x93d3c3, 1);
      graphics.fillRect(6, 4, 20, 24);
      graphics.fillStyle(0x4c8f81, 1);
      graphics.fillRect(6, 4, 20, 5);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillRect(10, 11, 3, 4);
      graphics.fillRect(18, 11, 3, 4);
      graphics.fillRect(10, 19, 11, 3);
    });
    this.createTexture('market', (graphics) => {
      graphics.fillStyle(0xb06ad8, 1);
      graphics.fillRect(5, 7, 22, 19);
      graphics.fillStyle(0x7c3ea3, 1);
      graphics.fillRect(5, 7, 22, 5);
      graphics.fillStyle(0xf1d3ff, 1);
      graphics.fillRect(11, 14, 10, 8);
    });
    this.createTexture('hub', (graphics) => {
      graphics.fillStyle(0xe06a64, 1);
      graphics.fillRect(4, 6, 24, 22);
      graphics.fillStyle(0x9e3028, 1);
      graphics.fillRect(4, 6, 24, 6);
      graphics.fillStyle(0xffd0cb, 1);
      graphics.fillRect(10, 15, 12, 8);
    });
    this.createTexture('tree', (graphics) => {
      graphics.fillStyle(0x7a4e28, 1);
      graphics.fillRect(13, 19, 6, 11);
      graphics.fillStyle(0x4d9250, 1);
      graphics.fillRect(6, 4, 20, 18);
      graphics.fillStyle(0x2d6f3a, 1);
      graphics.fillRect(9, 7, 4, 4);
      graphics.fillRect(18, 8, 4, 4);
      graphics.fillRect(12, 14, 8, 4);
    });
    this.createTexture('agent', (graphics) => {
      graphics.fillStyle(palette.ink, 1);
      graphics.fillRect(9, 4, 14, 23);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillRect(11, 7, 3, 3);
      graphics.fillRect(18, 7, 3, 3);
      graphics.fillStyle(0xe7ecef, 1);
      graphics.fillRect(12, 13, 8, 6);
      graphics.fillStyle(0x2a3641, 1);
      graphics.fillRect(12, 19, 8, 2);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillRect(10, 24, 5, 3);
      graphics.fillRect(17, 24, 5, 3);
    });
    this.createTexture('follow-arrow', (graphics) => {
      graphics.fillStyle(palette.accent, 1);
      graphics.fillTriangle(3, 2, 29, 2, 16, 22);
      graphics.lineStyle(2, this.theme === 'dark' ? 0xffffff : 0x102a3a, 1);
      graphics.strokeTriangle(3, 2, 29, 2, 16, 22);
    });

    const bg = this.add.tileSprite(worldWidth / 2, worldHeight / 2, worldWidth + 480, worldHeight + 320, 'grass');
    bg.setDepth(-12);

    for (let y = 0; y < worldHeight; y += 64) {
      for (let x = 0; x < worldWidth; x += 64) {
        if ((x / 64 + y / 64) % 5 === 0) {
          const sparkle = this.add.circle(x + 22, y + 22, 2, palette.grassDot, 0.28);
          sparkle.setDepth(-11);
        }
      }
    }

    this.tileRoad(120, 412, 2064, 32);
    this.tileRoad(456, 88, 32, 1328);
    this.tileRoad(312, 248, 900, 32);
    this.tileRoad(960, 248, 32, 812);
    this.tileRoad(1240, 636, 820, 32);
    this.tileRoad(1560, 900, 32, 420);

    [
      {x: 176, y: 196, texture: 'house', scale: 3.2, tint: 0xd8b6f3},
      {x: 236, y: 244, texture: 'house', scale: 2.6, tint: 0xecc8b8},
      {x: 560, y: 166, texture: 'tower', scale: 3.4, tint: 0xffdf93},
      {x: 744, y: 208, texture: 'tower', scale: 2.4, tint: 0x90cde0},
      {x: 1180, y: 188, texture: 'tower', scale: 3.2, tint: 0x9bd8a7},
      {x: 1538, y: 574, texture: 'market', scale: 3.3, tint: 0xffffff},
      {x: 1910, y: 788, texture: 'hub', scale: 3.8, tint: 0xffffff},
      {x: 1540, y: 1030, texture: 'hub', scale: 2.8, tint: 0xc39be8},
    ].forEach((building) => {
      const sprite = this.add.image(building.x, building.y, building.texture);
      sprite.setScale(building.scale);
      sprite.setTint(building.tint);
      sprite.setDepth(2);
    });

    [
      {x: 286, y: 90},
      {x: 336, y: 1168},
      {x: 756, y: 948},
      {x: 1416, y: 356},
      {x: 1888, y: 1120},
      {x: 2144, y: 520},
    ].forEach((tree) => {
      this.add.image(tree.x, tree.y, 'tree').setScale(1.8).setDepth(1);
    });

    const fromRowsById = new Map(this.fromRows.map((row) => [row.agent_id, row]));

    this.toRows.forEach((toRow) => {
      const fromRow = fromRowsById.get(toRow.agent_id) ?? toRow;
      const start = animatedPoint(fromRow, this.fromWeek, this.speedMultiplier);
      const end = animatedPoint(toRow, this.toWeek, this.speedMultiplier);
      const route = routeForStatus(toRow.status);
      const midA = pointOnPolyline(route, ((hashString(toRow.agent_id) % 17) / 17 + this.fromWeek * 0.03) % 1);
      const midB = pointOnPolyline(route, ((hashString(toRow.agent_id) % 29) / 29 + this.toWeek * 0.03) % 1);

      const sprite = this.add.sprite(start.x, start.y, 'agent');
      sprite.setScale(1.18);
      sprite.setTint(palette.statuses[toRow.status]);
      sprite.setDepth(5);
      sprite.setData('agentId', toRow.agent_id);
      sprite.setInteractive(new Phaser.Geom.Rectangle(-12, -12, 24, 24), Phaser.Geom.Rectangle.Contains);
      sprite.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        if (pointer.getDistance() < 8) this.onAgentToggle(toRow, (pointer.event as MouseEvent).shiftKey);
      });
      this.sprites.set(toRow.agent_id, sprite);
      this.agentRows.set(toRow.agent_id, toRow);
      this.previousPositions.set(toRow.agent_id, start);

      const shadow = this.add.circle(start.x, start.y + 12, 11, 0x000000, 0.11);
      shadow.setDepth(4);
      this.shadows.set(toRow.agent_id, shadow);

      const pathPoints = [start, midA, midB, end];
      const duration = routeTweenDuration(start, end, this.speedMultiplier);

      this.tweens.add({
        targets: sprite,
        x: pathPoints[3].x,
        y: pathPoints[3].y,
        duration,
        ease: 'Sine.easeInOut',
      });

      this.tweens.add({
        targets: shadow,
        x: pathPoints[3].x,
        y: pathPoints[3].y + 12,
        duration,
        ease: 'Sine.easeInOut',
      });
    });

    this.setFollowedAgents([...this.followedAgentIds]);

    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, deltaY: number) => {
      const factor = Phaser.Math.Clamp(Math.exp(-deltaY * 0.0008), 0.96, 1.04);
      this.zoomAt(pointer.x, pointer.y, this.currentZoom * factor);
    });

    this.input.setDefaultCursor('grab');
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown()) return;
      this.dragStart = {
        x: pointer.x,
        y: pointer.y,
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY,
      };
      this.input.setDefaultCursor('grabbing');
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragStart || !pointer.isDown) return;
      const camera = this.cameras.main;
      camera.scrollX = this.dragStart.scrollX - (pointer.x - this.dragStart.x) / camera.zoom;
      camera.scrollY = this.dragStart.scrollY - (pointer.y - this.dragStart.y) / camera.zoom;
      this.cameraState.scrollX = camera.scrollX;
      this.cameraState.scrollY = camera.scrollY;
    });
    const endDrag = (pointer?: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[] = []) => {
      this.dragStart = null;
      this.input.setDefaultCursor('grab');
      const additive = pointer ? (pointer.event as MouseEvent).shiftKey : false;
      if (pointer && !additive && pointer.getDistance() < 8 && !currentlyOver.some((object) => object.getData('agentId'))) {
        this.onClearFollow();
      }
    };
    this.input.on('pointerup', endDrag);
    this.input.on('pointerupoutside', () => endDrag());
  }

  setFollowedAgents(agentIds: string[]): void {
    this.followedAgentIds = new Set(agentIds);
    const palette = palettes[this.theme];
    this.followMarkers.forEach((marker, agentId) => {
      if (!this.followedAgentIds.has(agentId)) {
        marker.destroy();
        this.followMarkers.delete(agentId);
      }
    });
    this.sprites.forEach((sprite, agentId) => {
      const row = this.agentRows.get(agentId);
      const isFollowed = this.followedAgentIds.has(agentId);
      sprite.setScale(isFollowed ? 1.58 : 1.18);
      if (isFollowed) sprite.setTint(palette.accent);
      else if (row) sprite.setTint(palette.statuses[row.status]);
      if (isFollowed && !this.followMarkers.has(agentId)) {
        const marker = this.add.image(sprite.x, sprite.y - 38, 'follow-arrow').setDepth(10).setScale(1.15);
        this.followMarkers.set(agentId, marker);
        this.minimapCamera?.ignore(marker);
      }
    });
  }

  setZoomLevel(zoom: number): void {
    if (Math.abs(zoom - this.currentZoom) < 0.001) return;
    this.zoomAt(this.cameras.main.width / 2, this.cameras.main.height / 2, zoom);
  }

  updateReplay(week: number, rows: AgentRow[]): void {
    rows.forEach((row) => {
      const sprite = this.sprites.get(row.agent_id);
      const shadow = this.shadows.get(row.agent_id);
      if (!sprite || !shadow) return;
      this.agentRows.set(row.agent_id, row);

      const end = animatedPoint(row, week, this.speedMultiplier);
      const duration = Math.max(500, 1050 / this.speedMultiplier);
      this.tweens.killTweensOf(sprite);
      this.tweens.killTweensOf(shadow);
      sprite.setTint(this.followedAgentIds.has(row.agent_id) ? palettes[this.theme].accent : palettes[this.theme].statuses[row.status]);
      this.tweens.add({targets: sprite, x: end.x, y: end.y, duration, ease: 'Sine.easeInOut'});
      this.tweens.add({targets: shadow, x: end.x, y: end.y + 12, duration, ease: 'Sine.easeInOut'});
    });
  }

  create(): void {
    this.makeWorld();
  }

  update(_time: number, delta: number): void {
    this.followMarkers.forEach((marker, agentId) => {
      const sprite = this.sprites.get(agentId);
      if (!sprite) return;
      marker.setPosition(sprite.x, sprite.y - 38 + Math.sin(_time / 150) * 3);
    });
    const followed = [...this.followedAgentIds]
      .map((agentId) => this.sprites.get(agentId))
      .filter((sprite): sprite is Phaser.GameObjects.Sprite => Boolean(sprite));
    if (followed.length === 0 || this.dragStart) return;

    const xs = followed.map((sprite) => sprite.x);
    const ys = followed.map((sprite) => sprite.y);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const camera = this.cameras.main;
    const spanX = Math.max(...xs) - Math.min(...xs) + 260;
    const spanY = Math.max(...ys) - Math.min(...ys) + 220;
    const fitZoom = followed.length > 1 ? Math.min(1280 / spanX, 860 / spanY, this.currentZoom) : this.currentZoom;
    const targetZoom = Phaser.Math.Clamp(fitZoom, 0.38, 3);
    const smoothing = 1 - Math.exp(-delta / 180);
    camera.setZoom(Phaser.Math.Linear(camera.zoom, targetZoom, smoothing));
    const targetScrollX = centerX - camera.width / (2 * camera.zoom);
    const targetScrollY = centerY - camera.height / (2 * camera.zoom);
    camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetScrollX, smoothing);
    camera.scrollY = Phaser.Math.Linear(camera.scrollY, targetScrollY, smoothing);
    this.cameraState.scrollX = camera.scrollX;
    this.cameraState.scrollY = camera.scrollY;
    this.cameraState.zoom = this.currentZoom;
  }
}

export function PhaserReplay({
  run,
  week,
  followedAgentIds,
  speedMultiplier,
  theme,
  zoom,
  onZoomChange,
  onAgentToggle,
  onClearFollow,
}: {
  run: DashboardRun;
  week: number;
  followedAgentIds: string[];
  speedMultiplier: number;
  theme: ThemeMode;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onAgentToggle: (agent: AgentRow, additive: boolean) => void;
  onClearFollow: () => void;
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<ReplayScene | null>(null);
  const previousStateRef = useRef<{runId: string; week: number} | null>(null);
  const cameraStateRef = useRef<CameraState>({zoom});

  useEffect(() => {
    if (!hostRef.current) return;

    const previous = previousStateRef.current?.runId === run.run_id ? previousStateRef.current : null;
    const fromWeek = previous?.week ?? week;
    const fromRows = run.agentRows.filter((row) => row.week === fromWeek);
    const toRows = run.agentRows.filter((row) => row.week === week);

    const scene = new ReplayScene(run, fromWeek, week, fromRows, toRows, followedAgentIds, speedMultiplier, theme, zoom, cameraStateRef.current, onZoomChange, onAgentToggle, onClearFollow);
    sceneRef.current = scene;
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: 1280,
      height: 860,
      backgroundColor: '#f2f7fb',
      pixelArt: true,
      antialias: false,
      roundPixels: true,
      scene: [scene],
      input: {mouse: {preventDefaultWheel: true}},
    });

    previousStateRef.current = {runId: run.run_id, week};

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [run, speedMultiplier, theme, onAgentToggle, onClearFollow, onZoomChange]);

  useEffect(() => {
    sceneRef.current?.updateReplay(week, run.agentRows.filter((row) => row.week === week));
    previousStateRef.current = {runId: run.run_id, week};
  }, [run, week]);

  useEffect(() => {
    sceneRef.current?.setFollowedAgents(followedAgentIds);
  }, [followedAgentIds]);

  useEffect(() => {
    sceneRef.current?.setZoomLevel(zoom);
  }, [zoom]);

  return <div className="phaser-host" ref={hostRef} aria-label="Phaser replay board" />;
}
