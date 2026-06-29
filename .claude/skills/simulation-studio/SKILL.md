---
name: simulation-studio
description: >
  Design and run workforce simulations, script cinematic episodes, perform and record
  scenes as Autonate, and replay captures as polished video. Use when the user wants to
  run the 3D studio, write a new scene script, record a performance, add an animation
  beat, tune the camera, extend Autonate's character, or wire new simulation data into
  the visualization.
---

# Simulation Studio

A Three.js + React app at `apps/woc-sim/` (port 5175). Connects Mesa agent simulations
to a 3D fantasy world (Eastbrook Vale) and a full machinima production pipeline:
write scripts → perform them as Autonate → record → replay as cinematic.

## Start the studio

```bash
npm run woc-sim:dev   # from repo root
# Open http://127.0.0.1:5175/
# Requires ../world-of-claudecraft checked out (KayKit GLBs + Three.js live there)
```

---

## Architecture — key files

```
apps/woc-sim/src/
  scene.ts          — WocScene class: terrain, buildings, agents, camera, render loop
  autonate.ts       — AutonateCharacter: dark-skin KayKit rogue, jaw lip sync, pointer cone
  scene_player.ts   — ScenePlayer: act-based scripted cinematics + DAY_ONE_SCENE
  recorder.ts       — RecordingSession + SessionPlayback: record performance, replay smooth
  main.tsx          — React shell: HUD, view toggle, recording controls, timeline, panels
  styles.css        — All UI styling
  vite.config.ts    — __WOC_PUBLIC__ alias, /@fs/ passthrough, Three.js alias
```

---

## View modes

### Spirit View (default)
Omniscient orbit camera (OrbitControls). Sim clock runs in compressed time.
Shows all 50 agents walking routes, status orbs, follow-cam, outcome panels.

### Human View
Player controls Autonate in real-time. Sim clock pauses (time relativity mechanic).
- **Arrow keys**: move / turn Autonate
- **WASD**: orbit camera yaw (A/D) and zoom (W/S)
- **Space**: jump
- **R**: toggle recording

Toggle via the header button or `scene.setViewMode('spirit' | 'human')`.

---

## Autonate character (`autonate.ts`)

Dark-melanated solopreneur AI consultant. Built on KayKit rogue rig.

```typescript
const char = new AutonateCharacter();
await char.load(loader, wocPublicPath);
scene.add(char.root);
char.play('Walking_A', true);       // loop a clip
char.setMouthOpen(0.6);             // lip sync: 0–1
char.setFacing(Math.PI);            // rotation.y
char.setPosition(x, y, z);
char.update(dt);                    // call every frame
```

**Skin**: `mat.map = null` + `color: #3B1A0A` on Head/Arm meshes (no atlas multiply).
**Glow**: neon teal emissive `#00CCAA` on clothing.
**Lip sync**: BoxGeometry jaw proxy child of head bone, X-rotation driven by `setMouthOpen`.
**Pointer cone**: bobs at y=2.8 in root space, renderOrder 999, depthTest:false.

### Available clips
`Idle`, `Walking_A`, `Running_A`, `Walking_Backwards`, `Spellcast_Raise`, `Spellcast_Shoot`,
`Spellcasting`, `Cheer`, `Hit_A`, `Jump_Idle`, `Sit_Floor_Down`, `Sit_Floor_Idle`,
`Lie_Idle`, `Block`, `1H_Melee_Attack_Chop`, `2H_Ranged_Shoot`, `Running_Strafe_Left`,
`Running_Strafe_Right`

---

## Scene Player — scripted cinematics (`scene_player.ts`)

Drives Autonate through a typed sequence of acts. Runs frame-by-frame via `update(dt)`.

### Act types

```typescript
{kind: 'wait';    seconds: number}
{kind: 'face';    angle: number}                           // absolute world angle (rad)
{kind: 'walk_to'; x: number; z: number; speed?: number}   // default 6 u/s
{kind: 'talk';    text: string; clip?: string}             // synthetic lip sync, auto-duration
{kind: 'gesture'; clip: string; duration: number; loop?: boolean}
{kind: 'cam';     relYaw?: number; yaw?: number; pitch?: number; dist?: number}
```

**`relYaw`** (preferred over `yaw`): camera angle relative to character facing.
- `Math.PI` = over-the-shoulder (behind)
- `0` = face shot (in front of character)
- `±0.4` = 3/4 angle (adds depth, alternates sides for variety)

### Adding a new scene

1. Add a new `export const MY_SCENE: SceneAct[]` to `scene_player.ts`
2. Call it: `scene.playScene(MY_SCENE, onSubtitle)` (update `playScene` signature if needed)

### Calling from scene.ts

```typescript
scene.playScene(onSubtitle);   // plays DAY_ONE_SCENE
scene.stopScene();
scene.isPlayingScene;          // boolean
```

The scene auto-enters Human View and enables cinematic camera lerp (×2.5 vs ×5 manual).

### Talk act timing

Duration = `Math.max(2, text.length / 15)` seconds, capped at 8.
Jaw proxy drives a sin wave with fade-in/fade-out envelope.

---

## Performance Recorder (`recorder.ts`)

Record your own Human View performance, then replay it as a polished cinematic.

### Workflow

```
Human View → R to record → walk/interact → R to stop
→ ▶ Replay (smooth interpolated playback)
→ ↓ Export (JSON frame dump for future scripting)
```

### API from scene.ts

```typescript
scene.startRecording();            // enters Human View, begins capture
scene.stopRecording();             // ends capture
scene.playRecording(onSubtitle);   // interpolated replay, cinematic lerp
scene.stopPlayback();
scene.exportRecording();           // → JSON string

scene.isRecording;    // boolean
scene.hasRecording;   // boolean
scene.isPlayingBack;  // boolean
scene.recordingDuration; // seconds
```

### RecordFrame schema (JSON export)

```typescript
{
  t:        number;   // timestamp (seconds from start)
  px, py, pz: number; // character world position
  facing:   number;   // rotation.y (radians)
  clip:     string;   // animation clip name
  mouth:    number;   // jaw open 0–1
  camYaw, camPitch, camDist: number;
  subtitle: string | null;
}
```

Frame rate: 24fps capture. Playback binary-searches + lerps between frames.
Angle lerp uses shortest-arc to prevent camera spin-throughs.

---

## Camera system (`scene.ts`)

### Fields
- `camYaw` — horizontal orbit angle (world space, radians)
- `camPitch` — vertical angle above horizontal (default 0.42 rad ≈ 24°)
- `camDist` — distance from character (4–22 u manual, no limit in scenes)
- `smoothedCharY` — lerped terrain Y (×3/s) — absorbs bumps so camera doesn't bob

### `updateChaseCamera(dt, cinematic = false)`
- Manual mode: position lerp ×5/s (snappy, responsive)
- Cinematic mode: position lerp ×2.5/s (graceful dolly feel)
- Both use `smoothedCharY` for vertical tracking

### Camera on enter Human View
`snapHumanCamera()`: sets camYaw = autonateFacing + π (directly behind),
then lerps to final position in first frames.

---

## World reference (Eastbrook Vale)

```
Hub inn body:      (0,   hubY+5,  0)    — center of hub
Training hall:     (-14, hubY+3.5, 4)
Well:              (8,   hubY+1,  -8)
Campfire:          (6,   hubY+2.5, 6)
Hub Y (ground):    terrainHeight(0, 0) ≈ 1.5
```

**`terrainHeight(x, z)`** — always use this before placing anything on the ground.
World seed: 20061. Zone: ±180 world units.

POIs and road lines are defined as constants at the top of `scene.ts` — extend there
when adding new locations.

---

## Simulation data flow

```
Mesa model (Python) → agent_states.csv
  ↓ parseAgents(csv, week)
  ↓ scene.setAgents(agents)
  ↓ spawnCharacter() per agent → KayKit GLB clone, AnimationMixer, status orb
  ↓ scene.update(timeInWeek) → agentPosAtTime(), idle ↔ walk crossfade
```

Agent status colors: unaware=#3a5068, aware=#00aaee, training=#ffaa00,
trained=#aa55ff, employed=#00ee88, dropout=#882222.

---

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Characters invisible | Missing MeshoptDecoder | `loader.setMeshoptDecoder(MeshoptDecoder)` |
| 404 on GLB load | Wrong `__WOC_PUBLIC__` | Check vite.config.ts `fs.allow` |
| Skin shows peach tones | Atlas texture multiplying through | `mat.map = null` on Head/Arm meshes |
| Camera bobs over terrain | Using raw `ap.y` | Use `smoothedCharY` in chase camera |
| Scene cam angles wrong | Absolute yaw guessing | Use `relYaw` (relative to facing) |
| StrictMode double-mount | Agents not loaded | Call `setAgents` inside scene-creation effect |
| Jump doesn't land cleanly | `jumpY` not reset | Set `jumpY = 0` and `isJumping = false` in arc end |

---

## Episode production pipeline (future)

```
Episode JSON spec (plot, locations, dialogue)
  → Claude generates SceneAct[] scripts per scene
  → Human performs each scene in Human View (R to record)
  → Replay captures polished performance
  → Voice cloner overlays Autonate's voice on talk acts
  → ffmpeg stitches scenes + adds music/SFX
  → Final MP4 → YouTube / sims.autonateai.com
```

Scenes live in `scene_player.ts`. New cities/zones drop in as additional terrain modules.
