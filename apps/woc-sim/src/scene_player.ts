// Scene Player — drives Autonate through a scripted sequence of acts.
// Each act runs frame-by-frame via update(dt). When the act completes it
// advances to the next one automatically.
//
// Usage:
//   const player = new ScenePlayer(controller, DAY_ONE_SCENE, onSubtitle);
//   // call player.update(dt) each frame; player.done === true when finished.

export interface SceneController {
  getPosition(): {x: number; y: number; z: number};
  getFacing(): number;
  setFacing(rad: number): void;
  setPosition(x: number, y: number, z: number): void;
  terrainHeight(x: number, z: number): number;
  playClip(name: string, loop: boolean): void;
  setMouthOpen(amp: number): void;
  setIsWalking(b: boolean): void;
  setCamYaw(rad: number): void;
  setCamPitch(rad: number): void;
  setCamDist(dist: number): void;
  getCamYaw(): number;
}

// ─── ACT TYPES ────────────────────────────────────────────────────────────────

export type SceneAct =
  | {kind: 'wait'; seconds: number}
  | {kind: 'face'; angle: number}
  | {kind: 'walk_to'; x: number; z: number; speed?: number}
  | {kind: 'talk'; text: string; clip?: string}
  | {kind: 'gesture'; clip: string; duration: number; loop?: boolean}
  // relYaw is relative to character's current facing (PI = behind, 0 = face shot).
  // yaw is absolute world angle (fallback if relYaw omitted).
  | {kind: 'cam'; relYaw?: number; yaw?: number; pitch?: number; dist?: number};

// ─── DEMO SCENE — "Day One in Eastbrook Vale" ─────────────────────────────────
// All cam acts use relYaw (relative to character facing) so angles are correct
// regardless of where Autonate is looking:
//   relYaw = PI   → over-the-shoulder (behind)
//   relYaw = 0    → face shot (in front)
//   relYaw = ±0.4 → 3/4 angle (adds depth)
//
// Building reference:
//   Inn body:      (0,  y, 0)
//   Training hall: (-14, y, 4)
//   Campfire:      (6,  y, 6)

export const DAY_ONE_SCENE: SceneAct[] = [
  {kind: 'wait', seconds: 0.4},

  // ── Establishing: wide over-shoulder shot looking toward village ──────────────
  {kind: 'cam', relYaw: Math.PI, pitch: 0.52, dist: 18},

  // ── Inn entrance: walk up, face inn, intro line ───────────────────────────────
  {kind: 'walk_to', x: 0, z: 10, speed: 6},
  {kind: 'face', angle: Math.PI},          // face -Z toward inn center
  {kind: 'gesture', clip: 'Spellcast_Raise', duration: 1.4},
  // 3/4 front-left: camera between Autonate and inn — we see face + inn behind
  {kind: 'cam', relYaw: 0.45, pitch: 0.2, dist: 8},
  {kind: 'talk', text: "Day one in Eastbrook Vale. I'm here to map the workforce and find my first consulting contract."},

  // ── Training hall: approach, face hall, reflect ───────────────────────────────
  {kind: 'walk_to', x: -14, z: 10, speed: 6},
  {kind: 'face', angle: Math.PI},          // face -Z toward hall at z=4
  // Opposite 3/4 angle for variety (front-right this time)
  {kind: 'cam', relYaw: -0.45, pitch: 0.2, dist: 8},
  {kind: 'gesture', clip: 'Spellcasting', duration: 1.5},
  {kind: 'talk', text: "The training hall is the key lever. Match the right people to skills, and we crack the employment gap."},

  // ── Campfire: intimate close-up, then hero pull-back on cheer ─────────────────
  {kind: 'walk_to', x: 6, z: 6, speed: 5},
  {kind: 'face', angle: Math.PI * 0.15},   // slight angle — not perfectly straight
  {kind: 'cam', relYaw: 0.35, pitch: 0.12, dist: 5.5},  // close low-angle face shot
  {kind: 'wait', seconds: 0.5},
  {kind: 'talk', text: "Thirty days. Five contracts. Let's build something real."},
  // Pull back to wide hero shot for the cheer
  {kind: 'cam', relYaw: Math.PI, pitch: 0.46, dist: 14},
  {kind: 'gesture', clip: 'Cheer', duration: 2.4},

  // ── Return to hub ─────────────────────────────────────────────────────────────
  {kind: 'walk_to', x: 4, z: 8, speed: 5},
  {kind: 'face', angle: -Math.PI / 6},
];

// ─── SCENE PLAYER ─────────────────────────────────────────────────────────────

export class ScenePlayer {
  done    = false;
  private _paused  = false;

  private actIdx   = 0;
  private actTimer = 0;
  private lipT     = 0;

  private prevClip  = 'Idle';
  private isTalking = false;

  get isPaused(): boolean { return this._paused; }

  pause():  void { this._paused = true; }
  resume(): void { this._paused = false; }

  constructor(
    private readonly ctrl: SceneController,
    private readonly acts: SceneAct[],
    private readonly onSubtitle: (text: string | null) => void,
  ) {}

  update(dt: number): void {
    if (this.done || this._paused) return;

    const act = this.acts[this.actIdx];
    if (!act) {
      this.finish();
      return;
    }

    const complete = this.stepAct(act, dt);
    if (complete) {
      this.actTimer = 0;
      this.actIdx++;

      // Clean up talk state when act ends
      if (act.kind === 'talk') {
        this.isTalking = false;
        this.ctrl.setMouthOpen(0);
        this.ctrl.playClip('Idle', true);
      }
    }
  }

  private stepAct(act: SceneAct, dt: number): boolean {
    this.actTimer += dt;

    switch (act.kind) {
      case 'wait':
        return this.actTimer >= act.seconds;

      case 'face':
        this.ctrl.setFacing(act.angle);
        return true;

      case 'cam': {
        // relYaw is relative to character facing (PI = behind, 0 = face shot).
        // This makes scenes portable regardless of which direction Autonate faces.
        if (act.relYaw !== undefined) this.ctrl.setCamYaw(this.ctrl.getFacing() + act.relYaw);
        else if (act.yaw !== undefined) this.ctrl.setCamYaw(act.yaw);
        if (act.pitch !== undefined) this.ctrl.setCamPitch(act.pitch);
        if (act.dist  !== undefined) this.ctrl.setCamDist(act.dist);
        return true;
      }

      case 'walk_to':
        return this.stepWalkTo(act, dt);

      case 'talk':
        return this.stepTalk(act, dt);

      case 'gesture':
        return this.stepGesture(act, dt);
    }
  }

  private stepWalkTo(act: Extract<SceneAct, {kind: 'walk_to'}>, dt: number): boolean {
    const speed = act.speed ?? 6;
    const pos   = this.ctrl.getPosition();
    const dx    = act.x - pos.x;
    const dz    = act.z - pos.z;
    const dist  = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.3) {
      this.ctrl.setIsWalking(false);
      this.ctrl.playClip('Idle', true);
      return true;
    }

    // Face direction of travel
    const angle = Math.atan2(dx, dz);
    this.ctrl.setFacing(angle);

    // Move toward target
    const step  = Math.min(speed * dt, dist);
    const nx    = pos.x + (dx / dist) * step;
    const nz    = pos.z + (dz / dist) * step;
    const ny    = this.ctrl.terrainHeight(nx, nz);
    this.ctrl.setPosition(nx, ny, nz);
    this.ctrl.setIsWalking(true);

    if (this.prevClip !== 'Walking_A') {
      this.ctrl.playClip('Walking_A', true);
      this.prevClip = 'Walking_A';
    }

    return false;
  }

  private stepTalk(act: Extract<SceneAct, {kind: 'talk'}>, dt: number): boolean {
    // First frame: announce subtitle, start clip
    if (!this.isTalking) {
      this.isTalking = true;
      this.onSubtitle(act.text);
      this.ctrl.playClip(act.clip ?? 'Idle', true);
      this.ctrl.setIsWalking(false);
      this.prevClip = act.clip ?? 'Idle';
      this.lipT = 0;
    }

    // Synthetic lip sync: natural-ish sin wave with envelope
    this.lipT += dt;
    const duration = talkDuration(act.text);
    // Amplitude fades in for 0.2s, holds, fades out for 0.3s
    const fade = Math.min(this.lipT / 0.2, 1) * Math.min((duration - this.lipT) / 0.3, 1);
    const amp  = Math.max(0, Math.sin(this.lipT * 9) * 0.45 + 0.35) * fade;
    this.ctrl.setMouthOpen(amp);

    return this.actTimer >= duration;
  }

  private stepGesture(act: Extract<SceneAct, {kind: 'gesture'}>, dt: number): boolean {
    if (this.actTimer <= dt) {
      // First frame: play the clip
      this.ctrl.playClip(act.clip, act.loop ?? false);
      this.ctrl.setIsWalking(false);
      this.prevClip = act.clip;
    }
    return this.actTimer >= act.duration;
  }

  private finish(): void {
    this.done = true;
    this.onSubtitle(null);
    this.ctrl.setMouthOpen(0);
    this.ctrl.setIsWalking(false);
    this.ctrl.playClip('Idle', true);
  }

  stop(): void {
    this.finish();
  }
}

// Average reading/speech rate ~15 chars/sec; min 2s, max 8s
function talkDuration(text: string): number {
  return Math.min(8, Math.max(2, text.length / 15));
}
