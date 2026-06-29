# Sim Lab

An open, executable library for learning how real-world systems behave — and a full machinima production studio for turning that research into narrative episodes.

**Two things in one repo:**
1. **Simulation engine** — Mesa agent models + 3D visualization of workforce, economic, and social systems
2. **Narrative engine** — script plots, perform them live as Autonate, replay as polished video

Live site: <https://sims.autonateai.com/>

---

## Quick start

```bash
# Python model
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm install --cache .npm-cache
npm run mesa:generate

# Docusaurus site
npm start          # → http://localhost:3000

# 2D replay dashboard
npm run dashboard:dev   # → http://127.0.0.1:5174

# 3D immersive studio ← start here
npm run woc-sim:dev     # → http://127.0.0.1:5175
```

The 3D studio requires the sibling repo `world-of-claudecraft` checked out at `../world-of-claudecraft` for KayKit character GLBs and Three.js.

---

## The Three Worlds

| World | Zone | Vantage point | Status |
|---|---|---|---|
| **Eastbrook Vale** | Medieval fantasy | Historical/systemic — how did we get here? | Live |
| **Grand Rapids** | Modern city | Present — real consulting work, real orgs | Planned |
| **Vision City** | Futuristic | Where AI-powered cities could go | Planned |

Each world is a research zone. City council data, power maps, and org research become episode content. The simulations model the underlying dynamics; the narrative makes them human.

---

## Autonate

The protagonist. A dark-skinned solopreneur AI consultant traveling city to city — researching orgs, building tools, networking, documenting the process. His mission in Eastbrook Vale: **5 consulting contracts in 30 days**.

Built on the KayKit rogue rig with:
- Rich melanated skin (`#3B1A0A`, no atlas texture)
- Neon teal emissive glow on clothing (`#00CCAA`)
- Procedural jaw proxy for lip sync (wired to future voice cloner)
- Bobbing pointer cone overhead

---

## Production pipeline

```
Research (city, org, data)
  → Episode concept (Claude)
  → Scene scripts (SceneAct[] JSON)
  → Perform each scene live in Human View (record with R key)
  → Replay as smooth cinematic (interpolated playback)
  → Voice cloning overlay (open-source, your voice)
  → ffmpeg: stitch scenes + music + SFX
  → MP4 → YouTube / sims.autonateai.com
```

---

## Simulation Studio (`apps/woc-sim`)

Three.js + React app running the Eastbrook Vale workforce simulation.

### Architecture

```
apps/woc-sim/src/
  scene.ts          WocScene: terrain, buildings, 50 agents, camera system
  autonate.ts       AutonateCharacter: protagonist avatar with lip sync
  scene_player.ts   ScenePlayer: scripted acts (walk_to, talk, gesture, cam)
  recorder.ts       RecordingSession + SessionPlayback: machinima capture/replay
  main.tsx          React shell: HUD, clock, timeline, outcome panels
```

### View modes

**Spirit View** — omniscient orbit camera, compressed sim time, follow any agent.

**Human View** — you ARE Autonate. Real-time control, sim clock pauses (time relativity mechanic).
- Arrow keys: move / turn
- WASD: orbit camera
- Space: jump
- **R**: start/stop recording

### Scene system

Write a plot as a `SceneAct[]` sequence — the engine drives Autonate through waypoints, faces, gestures, and dialogue with lip sync. Camera cuts use `relYaw` (relative to character facing) so angles are always correct regardless of where the scene takes place.

```typescript
// Acts available in scene_player.ts
{kind: 'walk_to', x, z, speed}
{kind: 'face',    angle}
{kind: 'talk',    text, clip}        // synthetic lip sync
{kind: 'gesture', clip, duration}
{kind: 'cam',     relYaw, pitch, dist}  // relYaw: PI=behind, 0=face shot
{kind: 'wait',    seconds}
```

### Machinima recorder

Press **R** in Human View to capture your performance at 24fps. Hit **▶ Replay** to play it back with smooth interpolation between frames. Hit **↓ Export** to save the raw frame data as JSON — usable as a scene script or for future post-processing.

### Built features

| Feature | Status |
|---|---|
| Mesa agent simulation (50 agents, 16 weeks) | ✓ Live |
| 3D terrain + buildings (Eastbrook Vale) | ✓ Live |
| Agent walk/idle animation, status orbs | ✓ Live |
| Follow-cam: click any agent, camera lerps | ✓ Live |
| Outcome modal + agent story panels | ✓ Live |
| Autonate protagonist avatar | ✓ Live |
| Human View (player control, time relativity) | ✓ Live |
| Scripted scene player (cinematic acts) | ✓ Live |
| Machinima recorder (record → replay → export) | ✓ Live |
| Cinematic camera (smoothed Y, relYaw angles) | ✓ Live |
| Voice cloning (your voice → Autonate) | Planned |
| Background music + SFX via ffmpeg | Planned |
| Scene stitching / video export | Planned |
| Grand Rapids zone (modern world) | Planned |
| Episode JSON schema (full pipeline) | Planned |
| Screeps-style behavior scripting (Spirit View) | Planned |

---

## Simulations

Each simulation ships with:
- Interactive browser model
- ODD (Overview, Design concepts, Details) protocol
- Readable source notes
- Screenshot-supported tutorial
- Reproducible PDF export path

### Eastbrook Vale Workforce Experiment

50 agents (8 employers + 42 job seekers), 16 weeks, 5 skill tracks (Combat, Crafting, Commerce, Nature, Healing). Models the path from unskilled → employed through training, social capital, and dynamic job openings.

Run: `npm run mesa:generate` — outputs `agent_states.csv` to the run directory.

---

## Quality checks

```bash
npm run check
npm run capture:first   # HEADLESS=true for unattended
```

## Publishing

Every push to `main` runs `.github/workflows/deploy.yml` → Docusaurus build → `gh-pages`.

## Discoverability contract

Every simulation must include `manifest.yaml`. Run `npm run registry:build` after adding or changing one. CI rejects stale registry data, broken tutorial images, invalid manifests, type errors, and failed site builds.
