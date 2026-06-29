// Record + replay a Human View performance.
//
// Record: captures the full world state at 24fps while you play.
// Pause/Resume: freezes elapsed time — character stays put, no gap in timeline.
//   The first frame after a resume is marked isCut=true so playback can detect
//   the camera discontinuity and handle it cleanly.
// Replay: binary-searches frames and lerps between them.
//   Camera overrides (CamOverride[]) are applied as post-production keyframes —
//   between two overrides the camera interpolates smoothly; outside overrides
//   the original recorded camera is used.

import type {SceneController} from './scene_player';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type RecordFrame = {
  t:       number;
  isCut?:  boolean;  // first frame after a pause/resume — camera jump expected
  // Character
  px: number; py: number; pz: number;
  facing:  number;
  clip:    string;
  mouth:   number;
  // Camera
  camYaw:   number;
  camPitch: number;
  camDist:  number;
  // Optional subtitle marker (null = clear)
  subtitle: string | null;
};

export type RecordState = Omit<RecordFrame, 't' | 'isCut'>;

// Post-production camera keyframe — overrides recorded camera at time t.
export type CamOverride = {t: number; yaw: number; pitch: number; dist: number};

// ─── RECORDING SESSION ────────────────────────────────────────────────────────

const FRAME_DT = 1 / 24;

export class RecordingSession {
  private frames:     RecordFrame[]  = [];
  private elapsed     = 0;
  private nextCap     = 0;
  private _recording  = false;
  private _paused     = false;
  private _nextIsCut  = false;
  private _overrides: CamOverride[] = [];

  get isRecording(): boolean    { return this._recording; }
  get isPaused():    boolean    { return this._paused; }
  get hasFrames():   boolean    { return this.frames.length > 0; }
  get frameCount():  number     { return this.frames.length; }
  get duration():    number     { return this.frames.at(-1)?.t ?? 0; }
  get overrides():   CamOverride[] { return this._overrides; }

  start(): void {
    this.frames     = [];
    this.elapsed    = 0;
    this.nextCap    = 0;
    this._recording = true;
    this._paused    = false;
    this._nextIsCut = false;
    this._overrides = [];
  }

  stop(): RecordFrame[] {
    this._recording = false;
    this._paused    = false;
    return [...this.frames];
  }

  // Freeze elapsed time — character pauses, no timeline gap.
  pause(): void {
    if (this._recording && !this._paused) this._paused = true;
  }

  // Resume — marks the next captured frame as a cut point.
  resume(): void {
    if (this._recording && this._paused) {
      this._paused    = false;
      this._nextIsCut = true;
    }
  }

  // Call each frame with current world state; skips silently when paused.
  capture(dt: number, state: RecordState): void {
    if (!this._recording || this._paused) return;
    this.elapsed += dt;
    while (this.elapsed >= this.nextCap) {
      const isCut = this._nextIsCut;
      this._nextIsCut = false;
      const frame: RecordFrame = {t: this.nextCap, ...state};
      if (isCut) frame.isCut = true;
      this.frames.push(frame);
      this.nextCap += FRAME_DT;
    }
  }

  // Post-production: pin camera at time t. Sorted, deduplicated within 0.1s.
  addOverride(t: number, yaw: number, pitch: number, dist: number): void {
    this._overrides = this._overrides.filter(o => Math.abs(o.t - t) > 0.1);
    this._overrides.push({t, yaw, pitch, dist});
    this._overrides.sort((a, b) => a.t - b.t);
  }

  removeOverrideNear(t: number): void {
    this._overrides = this._overrides.filter(o => Math.abs(o.t - t) > 0.25);
  }

  clearOverrides(): void { this._overrides = []; }

  getFrames(): RecordFrame[] { return [...this.frames]; }

  toJSON(): string {
    return JSON.stringify({frames: this.frames, overrides: this._overrides, version: 2});
  }
}

// ─── PLAYBACK ─────────────────────────────────────────────────────────────────

export class SessionPlayback {
  done    = false;
  private elapsed      = 0;
  private _paused      = false;
  private prevClip     = '';
  private prevSubtitle: string | null = null;

  get isPaused():    boolean { return this._paused; }
  get currentTime(): number  { return this.elapsed; }

  constructor(
    private readonly frames:     RecordFrame[],
    private readonly ctrl:       SceneController,
    private readonly onSubtitle: (text: string | null) => void,
    private readonly overrides:  CamOverride[] = [],
  ) {}

  pause():  void { this._paused = true; }
  resume(): void { this._paused = false; }

  update(dt: number): void {
    if (this.done || this.frames.length === 0) { this.finish(); return; }
    if (this._paused) return;

    this.elapsed += dt;

    const last = this.frames.at(-1)!;
    if (this.elapsed >= last.t + 0.15) { this.finish(); return; }

    // Binary search for the surrounding frame pair
    let lo = 0, hi = this.frames.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid]!.t <= this.elapsed) lo = mid; else hi = mid;
    }
    const a = this.frames[lo]!;
    const b = this.frames[Math.min(hi, this.frames.length - 1)]!;
    const span = b.t - a.t;
    const α   = span > 0.0001 ? (this.elapsed - a.t) / span : 1;

    // Apply lerped character state
    this.ctrl.setPosition(
      lerp(a.px, b.px, α),
      lerp(a.py, b.py, α),
      lerp(a.pz, b.pz, α),
    );
    this.ctrl.setFacing(   lerpAngle(a.facing,   b.facing,   α));
    this.ctrl.setMouthOpen(lerp(     a.mouth,    b.mouth,    α));

    // Camera: post-prod overrides take priority; fall back to recorded values.
    // At a cut frame (isCut on b), the recorded camera jumps — that's intentional,
    // it represents the human's camera adjustment. Override keyframes smooth over them.
    let camYaw   = lerpAngle(a.camYaw,   b.camYaw,   b.isCut ? 1 : α);
    let camPitch = lerp(     a.camPitch, b.camPitch, b.isCut ? 1 : α);
    let camDist  = lerp(     a.camDist,  b.camDist,  b.isCut ? 1 : α);

    if (this.overrides.length > 0) {
      const ov = evalOverrides(this.overrides, this.elapsed, camYaw, camPitch, camDist);
      camYaw   = ov.yaw;
      camPitch = ov.pitch;
      camDist  = ov.dist;
    }

    this.ctrl.setCamYaw(camYaw);
    this.ctrl.setCamPitch(camPitch);
    this.ctrl.setCamDist(camDist);

    // Clip: fire only on change
    if (a.clip !== this.prevClip) {
      this.ctrl.playClip(a.clip, true);
      this.prevClip = a.clip;
    }

    // Subtitle: fire on any change
    if (a.subtitle !== this.prevSubtitle) {
      this.onSubtitle(a.subtitle);
      this.prevSubtitle = a.subtitle;
    }
  }

  stop(): void { this.finish(); }

  private finish(): void {
    this.done = true;
    this.onSubtitle(null);
  }
}

// ─── OVERRIDE EVALUATION ──────────────────────────────────────────────────────
// Overrides are camera keyframes. Between two overrides, camera interpolates.
// Outside the override range, recorded camera values are preserved.

function evalOverrides(
  overrides: CamOverride[],
  t: number,
  recYaw: number, recPitch: number, recDist: number,
): {yaw: number; pitch: number; dist: number} {
  if (overrides.length === 0) return {yaw: recYaw, pitch: recPitch, dist: recDist};

  // Find surrounding keyframes
  let prev: CamOverride | null = null;
  let next: CamOverride | null = null;
  for (const o of overrides) {
    if (o.t <= t) prev = o;
    else { next = o; break; }
  }

  // Blend radius: ramp override influence in over 0.5s from the keyframe
  const RAMP = 0.5;

  if (!prev && next) {
    // Before first override — blend from recorded toward override over RAMP
    const blend = Math.max(0, 1 - (next.t - t) / RAMP);
    return {
      yaw:   lerpAngle(recYaw,   next.yaw,   blend),
      pitch: lerp(     recPitch, next.pitch, blend),
      dist:  lerp(     recDist,  next.dist,  blend),
    };
  }
  if (prev && !next) {
    // After last override — hold override value, fading out after RAMP
    const fadeAge = t - prev.t;
    const blend = Math.min(1, fadeAge / RAMP);
    return {
      yaw:   lerpAngle(recYaw,   prev.yaw,   blend),
      pitch: lerp(     recPitch, prev.pitch, blend),
      dist:  lerp(     recDist,  prev.dist,  blend),
    };
  }
  if (prev && next) {
    // Between two overrides — interpolate directly between them
    const span = next.t - prev.t;
    const α = span > 0 ? (t - prev.t) / span : 1;
    return {
      yaw:   lerpAngle(prev.yaw,   next.yaw,   α),
      pitch: lerp(     prev.pitch, next.pitch, α),
      dist:  lerp(     prev.dist,  next.dist,  α),
    };
  }
  return {yaw: recYaw, pitch: recPitch, dist: recDist};
}

// ─── MATH HELPERS ─────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
