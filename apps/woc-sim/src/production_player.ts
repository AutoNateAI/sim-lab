// ProductionPlayer — drives a ProductionBeat with auto camera-cutting.
//
// Design:
//   - Each beat declares its cast (characters + start positions) and a list
//     of ProductionActs. The player steps through them frame-by-frame.
//   - speech acts auto-cut the camera based on who is speaking:
//       Autonate speaking → camera on NPC's side, framing Autonate's face
//       NPC speaking      → camera behind Autonate, NPC visible over shoulder
//   - walk_to acts engage follow-lock so camera trails behind automatically.
//   - cam acts set explicit modes: follow, two_shot, wide.
//
// The intent: press record on a beat, the math handles framing.

// ─── ACT TYPES ───────────────────────────────────────────────────────────────

export type CamMode = 'follow' | 'two_shot' | 'wide';

export type ProductionAct =
  | {kind: 'walk_to'; x: number; z: number; speed?: number}
  | {kind: 'face'; angle: number}
  | {kind: 'gesture'; clip: string; duration: number; loop?: boolean}
  | {kind: 'wait'; seconds: number}
  | {kind: 'speech'; speaker: 'autonate' | string; speakerName: string; text: string; clip?: string}
  | {kind: 'cam'; mode: CamMode; npcId?: string};

// ─── BEAT DEFINITION ─────────────────────────────────────────────────────────

export type BeatCastMember = {
  id: 'autonate' | string; // 'autonate' or an EpisodeNpc id
  startX: number;
  startZ: number;
  facing: number;
};

export type ProductionBeat = {
  id: string;
  label: string;
  description: string;
  cast: BeatCastMember[];
  acts: ProductionAct[];
};

// ─── CONTROLLER INTERFACE ────────────────────────────────────────────────────

export interface ProductionController {
  // Autonate
  getPosition(): {x: number; y: number; z: number};
  getFacing(): number;
  setFacing(rad: number): void;
  setPosition(x: number, y: number, z: number): void;
  terrainHeight(x: number, z: number): number;
  playClip(name: string, loop: boolean): void;
  setMouthOpen(amp: number): void;
  setIsWalking(b: boolean): void;
  // NPC control
  getNpcPosition(npcId: string): {x: number; y: number; z: number} | null;
  playNpcClip(npcId: string, clip: string, loop: boolean): void;
  setNpcMouthOpen(npcId: string, amp: number): void;
  // Camera modes
  setCamFollowLocked(locked: boolean): void;
  setCamForSpeech(speaker: 'autonate' | 'npc', npcId: string): void;
  setCamTwoShot(npcId: string): void;
  setCamWide(npcId?: string): void;
  // Subtitle
  emitSubtitle(text: string | null): void;
}

// ─── PLAYER ──────────────────────────────────────────────────────────────────

export class ProductionPlayer {
  done = false;

  private actIdx        = 0;
  private actTimer      = 0;
  private speakStarted  = false;
  private lipT          = 0;
  private prevClip      = 'Idle';
  private activeNpcId: string | null;

  constructor(
    private readonly ctrl: ProductionController,
    private readonly beat: ProductionBeat,
    private readonly onSubtitle: (text: string | null) => void,
  ) {
    // Primary NPC partner = first non-autonate cast member
    this.activeNpcId = beat.cast.find(m => m.id !== 'autonate')?.id ?? null;
    // Start with follow cam
    this.ctrl.setCamFollowLocked(true);
  }

  update(dt: number): void {
    if (this.done) return;
    const act = this.beat.acts[this.actIdx];
    if (!act) { this.finish(); return; }

    const complete = this.stepAct(act, dt);
    if (complete) {
      this.actTimer    = 0;
      this.speakStarted = false;
      this.actIdx++;

      // Clean up after speech
      if (act.kind === 'speech') {
        if (act.speaker === 'autonate') {
          this.ctrl.setMouthOpen(0);
          this.ctrl.playClip('Idle', true);
        } else {
          this.ctrl.setNpcMouthOpen(act.speaker, 0);
          this.ctrl.playNpcClip(act.speaker, 'Idle', true);
        }
        this.ctrl.emitSubtitle(null);
      }
    }
  }

  stop(): void { this.finish(); }

  private stepAct(act: ProductionAct, dt: number): boolean {
    this.actTimer += dt;
    switch (act.kind) {
      case 'wait':    return this.actTimer >= act.seconds;
      case 'face':    this.ctrl.setFacing(act.angle); return true;
      case 'walk_to': return this.stepWalkTo(act, dt);
      case 'gesture': return this.stepGesture(act, dt);
      case 'speech':  return this.stepSpeech(act, dt);
      case 'cam':     return this.stepCam(act);
    }
  }

  private stepWalkTo(act: Extract<ProductionAct, {kind: 'walk_to'}>, dt: number): boolean {
    const speed = act.speed ?? 6;
    const pos   = this.ctrl.getPosition();
    const dx    = act.x - pos.x;
    const dz    = act.z - pos.z;
    const dist  = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.3) {
      this.ctrl.setIsWalking(false);
      this.ctrl.playClip('Idle', true);
      this.ctrl.setCamFollowLocked(false); // release follow on arrival
      return true;
    }

    this.ctrl.setCamFollowLocked(true);

    const angle = Math.atan2(dx, dz);
    this.ctrl.setFacing(angle);

    const step = Math.min(speed * dt, dist);
    const nx   = pos.x + (dx / dist) * step;
    const nz   = pos.z + (dz / dist) * step;
    const ny   = this.ctrl.terrainHeight(nx, nz);
    this.ctrl.setPosition(nx, ny, nz);
    this.ctrl.setIsWalking(true);

    if (this.prevClip !== 'Walking_A') {
      this.ctrl.playClip('Walking_A', true);
      this.prevClip = 'Walking_A';
    }
    return false;
  }

  private stepGesture(act: Extract<ProductionAct, {kind: 'gesture'}>, dt: number): boolean {
    if (this.actTimer <= dt) {
      this.ctrl.playClip(act.clip, act.loop ?? false);
      this.ctrl.setIsWalking(false);
      this.prevClip = act.clip;
    }
    return this.actTimer >= act.duration;
  }

  private stepSpeech(act: Extract<ProductionAct, {kind: 'speech'}>, dt: number): boolean {
    if (!this.speakStarted) {
      this.speakStarted = true;
      this.lipT = 0;
      this.ctrl.emitSubtitle(`${act.speakerName}: ${act.text}`);

      // Auto-cut camera to frame the speaker appropriately
      const npcId = this.activeNpcId;
      if (npcId) {
        if (act.speaker === 'autonate') {
          // Camera on NPC's side → sees Autonate's face
          this.ctrl.setCamForSpeech('autonate', npcId);
        } else {
          // Camera behind Autonate → NPC visible over shoulder
          this.ctrl.setCamForSpeech('npc', act.speaker);
        }
      }

      // Start animation for speaker
      if (act.speaker === 'autonate') {
        this.ctrl.playClip(act.clip ?? 'Idle', true);
        this.ctrl.setIsWalking(false);
        this.prevClip = act.clip ?? 'Idle';
      } else {
        this.ctrl.playNpcClip(act.speaker, act.clip ?? 'Idle', true);
      }
    }

    // Lip sync: envelope-shaped sine wave
    this.lipT += dt;
    const duration = talkDuration(act.text);
    const fade = Math.min(this.lipT / 0.2, 1) * Math.min((duration - this.lipT) / 0.3, 1);
    const amp  = Math.max(0, Math.sin(this.lipT * 9) * 0.45 + 0.35) * fade;

    if (act.speaker === 'autonate') {
      this.ctrl.setMouthOpen(amp);
    } else {
      this.ctrl.setNpcMouthOpen(act.speaker, amp);
    }

    return this.actTimer >= duration;
  }

  private stepCam(act: Extract<ProductionAct, {kind: 'cam'}>): boolean {
    const npcId = act.npcId ?? this.activeNpcId ?? '';
    switch (act.mode) {
      case 'follow':   this.ctrl.setCamFollowLocked(true); break;
      case 'two_shot': this.ctrl.setCamTwoShot(npcId);     break;
      case 'wide':     this.ctrl.setCamWide(npcId);        break;
    }
    return true;
  }

  private finish(): void {
    this.done = true;
    this.ctrl.emitSubtitle(null);
    this.ctrl.setMouthOpen(0);
    this.ctrl.setIsWalking(false);
    this.ctrl.playClip('Idle', true);
  }
}

function talkDuration(text: string): number {
  return Math.min(8, Math.max(2, text.length / 15));
}
