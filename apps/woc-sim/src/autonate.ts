// AutonateCharacter: the protagonist avatar — solopreneur AI consultant.
//
// Built on the KayKit rogue rig from world-of-claudecraft/public.
// Limbs: full KayKit skeleton (upperarm/lowerarm/wrist/hand × 2,
//   upperleg/lowerleg/foot/toes × 2) — all 21 clips available.
// Lip sync: KayKit has no jaw bone and no morph targets. We add a thin
//   BoxGeometry "jaw proxy" as a child of the `head` bone and drive its
//   X-rotation from an amplitude value (0-1). Wire to Web Audio API analyser
//   for real-time lip sync, or drive procedurally from script timing.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

// ─── PALETTE ─────────────────────────────────────────────────────────────────

// Rich warm melanated skin — dark brown with subtle warmth
const SKIN_COLOR    = new THREE.Color(0x3B1A0A);
const SKIN_EMISSIVE = new THREE.Color(0x0D0705);

// Black-light / tech aesthetic — neon cyan-teal glow on clothing
const GLOW_COLOR     = new THREE.Color(0x00CCAA);
const GLOW_INTENSITY = 0.16;

// Max jaw rotation for fully-open mouth (radians)
const JAW_MAX_ROTATION = Math.PI / 6;

// KayKit clip names available on the rogue rig
export type AutonateClip =
  | 'Idle'
  | 'Walking_A'
  | 'Running_A'
  | 'Walking_Backwards'
  | 'Spellcast_Raise'      // pointing / presenting
  | 'Spellcast_Shoot'      // launching something
  | 'Spellcasting'         // focused channel — good for "thinking"
  | 'Cheer'                // celebration
  | 'Hit_A'                // react with surprise
  | 'Death_A'
  | 'Jump_Idle'
  | 'Sit_Floor_Down'
  | 'Sit_Floor_Idle'
  | 'Lie_Idle'
  | 'Block'
  | '1H_Melee_Attack_Chop'
  | '1H_Melee_Attack_Slice_Diagonal'
  | '2H_Ranged_Shoot'
  | 'Running_Strafe_Left'
  | 'Running_Strafe_Right';

export class AutonateCharacter {
  /** Add this to the THREE.Scene; pivot at feet, faces +Z. */
  readonly root = new THREE.Group();

  private mixer: THREE.AnimationMixer | null = null;
  private clips   = new Map<string, THREE.AnimationClip>();
  private current: THREE.AnimationAction | null = null;

  /** Reference to `head` bone — null until load() resolves. */
  private headBone: THREE.Object3D | null = null;
  /** Procedural jaw proxy parented to headBone for lip sync. */
  private jaw: THREE.Mesh | null = null;
  /** Floating pointer cone above the avatar — added to root so it moves automatically. */
  private pointer: THREE.Mesh | null = null;
  private elapsed = 0;

  // ─── LOAD ────────────────────────────────────────────────────────────────

  async load(loader: GLTFLoader, wocPublic: string): Promise<void> {
    const gltf   = await loader.loadAsync(`${wocPublic}/models/chars/players/rogue.glb`);
    const model  = SkeletonUtils.clone(gltf.scene) as THREE.Group;

    // Apply dark skin + neon glow per mesh
    model.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      const isSkin = /Head|Arm/i.test(mesh.name);
      const src    = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      const mat    = src.clone() as THREE.MeshStandardMaterial;

      if (isSkin) {
        // Deep melanated skin: drop atlas texture, use flat colour only
        mat.map = null;
        mat.color.copy(SKIN_COLOR);
        mat.emissive.copy(SKIN_EMISSIVE);
        mat.emissiveIntensity = 1;
        mat.roughness  = 0.82;
        mat.metalness  = 0.05;
        mat.needsUpdate = true;
      } else {
        // Clothing: keep original atlas colour, layer neon teal emissive
        mat.emissive.copy(GLOW_COLOR);
        mat.emissiveIntensity = GLOW_INTENSITY;
      }

      mesh.material  = mat;
      mesh.castShadow = true;
    });

    // Locate head bone
    model.traverse((obj) => {
      if (obj.name === 'head') this.headBone = obj;
    });

    // Attach jaw proxy to head bone
    // Box dimensions are in KayKit model space (~1-2 m native height).
    // At CHARACTER_SCALE = 1.8 the proxy is ~0.32 × 0.11 × 0.25 world units —
    // roughly chin-sized on a ~1.8 wu character.
    if (this.headBone) {
      const jawGeo = new THREE.BoxGeometry(0.18, 0.06, 0.14);
      const jawMat = new THREE.MeshStandardMaterial({
        color: SKIN_COLOR, emissive: SKIN_EMISSIVE, emissiveIntensity: 1, roughness: 0.82,
      });
      this.jaw = new THREE.Mesh(jawGeo, jawMat);
      this.jaw.position.set(0, -0.24, 0.09);   // chin position in head-bone local space
      this.jaw.castShadow = false;
      this.headBone.add(this.jaw);
    }

    // Animation
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) this.clips.set(clip.name, clip);

    this.root.scale.setScalar(1.8);
    this.root.add(model);

    // Floating pointer cone — tip points down, bobs in update().
    // Position is in root local space (pre-scale): 2.8 × 1.8 = ~5 world units above feet.
    const pGeo = new THREE.ConeGeometry(0.44, 1.4, 6);
    const pMat = new THREE.MeshStandardMaterial({
      color: 0x00CCAA, emissive: 0x00CCAA, emissiveIntensity: 3,
      roughness: 0, transparent: true, opacity: 0.92, depthTest: false,
    });
    this.pointer = new THREE.Mesh(pGeo, pMat);
    this.pointer.rotation.x = Math.PI;   // tip faces down
    this.pointer.position.y = 2.8;
    this.pointer.renderOrder = 999;
    this.root.add(this.pointer);

    this.play('Idle', true);
  }

  // ─── ANIMATION ───────────────────────────────────────────────────────────

  /** Play a clip by name. Pass loop=false for one-shots (cheer, attack, etc.). */
  play(clipName: string, loop = true, fadeSec = 0.25): void {
    const clip = this.clips.get(clipName);
    if (!clip || !this.mixer) return;

    const next = this.mixer.clipAction(clip);
    if (this.current && this.current !== next) this.current.fadeOut(fadeSec);

    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    next.fadeIn(fadeSec).play();
    this.current = next;
  }

  /** All clip names available on this rig. */
  get availableClips(): string[] {
    return [...this.clips.keys()];
  }

  // ─── LIP SYNC ────────────────────────────────────────────────────────────

  /**
   * Drive the jaw proxy open amount.
   * @param amplitude 0 = fully closed, 1 = fully open
   *
   * Wire to Web Audio API:
   *   analyser.getByteTimeDomainData(buffer);
   *   const rms = Math.sqrt(buffer.reduce((s,v) => s + (v-128)**2, 0) / buffer.length);
   *   autonate.setMouthOpen(Math.min(1, rms / 40));
   */
  private _mouthOpen = 0;

  setMouthOpen(amplitude: number): void {
    this._mouthOpen = Math.max(0, Math.min(1, amplitude));
    if (!this.jaw) return;
    this.jaw.rotation.x = JAW_MAX_ROTATION * this._mouthOpen;
  }

  get mouthOpen(): number { return this._mouthOpen; }

  // ─── TRANSFORM ───────────────────────────────────────────────────────────

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setFacing(radians: number): void {
    this.root.rotation.y = radians;
  }

  // ─── PER-FRAME ───────────────────────────────────────────────────────────

  update(dt: number): void {
    this.mixer?.update(dt);
    this.elapsed += dt;
    if (this.pointer) {
      this.pointer.position.y = 2.8 + Math.sin(this.elapsed * 3) * 0.15;
    }
  }

  // ─── LIP SYNC CAPABILITY REPORT ──────────────────────────────────────────

  /** True once load() has resolved and the jaw proxy is attached. */
  get lipSyncReady(): boolean {
    return this.jaw !== null;
  }
}
