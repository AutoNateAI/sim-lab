// Record + replay a Human View performance.
//
// Record: captures the full world state at 24fps while you play.
// Replay: binary-searches frames and lerps between them — smooth
//         regardless of original frame rate.
//
// No Three.js dependency here: just data and math.

import type {SceneController} from './scene_player';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type RecordFrame = {
  t:        number;
  // Character
  px: number; py: number; pz: number;
  facing:   number;
  clip:     string;
  mouth:    number;
  // Camera
  camYaw:   number;
  camPitch: number;
  camDist:  number;
  // Optional subtitle marker (null = clear)
  subtitle: string | null;
};

export type RecordState = Omit<RecordFrame, 't'>;

// ─── RECORDING SESSION ────────────────────────────────────────────────────────

const FRAME_DT = 1 / 24;  // capture at 24fps

export class RecordingSession {
  private frames:    RecordFrame[] = [];
  private elapsed    = 0;
  private nextCap    = 0;
  private _recording = false;

  get isRecording(): boolean { return this._recording; }
  get hasFrames():   boolean { return this.frames.length > 0; }
  get frameCount():  number  { return this.frames.length; }
  get duration():    number  { return this.frames.at(-1)?.t ?? 0; }

  start(): void {
    this.frames    = [];
    this.elapsed   = 0;
    this.nextCap   = 0;
    this._recording = true;
  }

  stop(): RecordFrame[] {
    this._recording = false;
    return [...this.frames];
  }

  // Call each frame with current world state; snapshot at 24fps.
  capture(dt: number, state: RecordState): void {
    if (!this._recording) return;
    this.elapsed += dt;
    while (this.elapsed >= this.nextCap) {
      this.frames.push({t: this.nextCap, ...state});
      this.nextCap += FRAME_DT;
    }
  }

  getFrames(): RecordFrame[] { return [...this.frames]; }

  // Serialise to JSON string for saving/export.
  toJSON(): string { return JSON.stringify({frames: this.frames, version: 1}); }
}

// ─── PLAYBACK ─────────────────────────────────────────────────────────────────

export class SessionPlayback {
  done = false;

  private elapsed      = 0;
  private prevClip     = '';
  private prevSubtitle: string | null = null;

  constructor(
    private readonly frames:     RecordFrame[],
    private readonly ctrl:       SceneController,
    private readonly onSubtitle: (text: string | null) => void,
  ) {}

  update(dt: number): void {
    if (this.done || this.frames.length === 0) { this.finish(); return; }
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

    // Apply lerped state
    this.ctrl.setPosition(
      lerp(a.px, b.px, α),
      lerp(a.py, b.py, α),
      lerp(a.pz, b.pz, α),
    );
    this.ctrl.setFacing(  lerpAngle(a.facing,   b.facing,   α));
    this.ctrl.setCamYaw(  lerpAngle(a.camYaw,   b.camYaw,   α));
    this.ctrl.setCamPitch(lerp(     a.camPitch, b.camPitch, α));
    this.ctrl.setCamDist( lerp(     a.camDist,  b.camDist,  α));
    this.ctrl.setMouthOpen(lerp(    a.mouth,    b.mouth,    α));

    // Clip: fire only when the frame's clip changes (avoids re-triggering every tick)
    if (a.clip !== this.prevClip) {
      this.ctrl.playClip(a.clip, true);
      this.prevClip = a.clip;
    }

    // Subtitle: fire on any change (including null to clear)
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
