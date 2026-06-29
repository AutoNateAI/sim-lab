---
name: simulation-studio
description: >
  Design and run workforce simulation experiments, visualize agent stories in the
  WoC 3D world, and produce cinematic captures. Use when the user describes an
  experiment idea, wants to change simulation parameters, filter for specific agent
  stories, or produce a video of agents navigating Eastbrook Vale.
---

# Simulation Studio

The Simulation Studio connects conversational experiment design (Claude Code CLI) to the
3D visualization running at `http://127.0.0.1:5175/`. No integration layer is needed —
changes to code and data files appear immediately in the browser via Vite HMR.

## Apps

| App | Port | Start command |
|---|---|---|
| WoC Sim (3D studio) | 5175 | `npm run woc-sim:dev` |
| Sim Dashboard (2D replay) | 5174 | `npm run dashboard:dev` |
| Docusaurus site | 3000 | `npm start` |

## Key files

```
apps/woc-sim/src/scene.ts          — WocScene class: terrain, characters, animation
apps/woc-sim/src/main.tsx          — React shell: clock, scrubber, legend, camera
apps/woc-sim/vite.config.ts        — Vite config (Three.js alias, /@fs/ asset paths)

simulations/workforce-development/city-opportunity-simulator/
  generate_mesa_results.py         — Mesa headless runner (produces agent_states.csv)
  runs/workforce_001-baseline-seed42/agent_states.csv  — simulation output
```

## World constants

- Zone: Eastbrook Vale, `±180 yards` in x/z
- Hub: `{x:0, z:0}` — Eastbrook Inn + training hall
- Coordinate mapping: GR `(0-24000 × 0-16000)` → WoC `(±120 yards)`
- World seed: `20061`
- Agent cap: 50 (configurable via `parseAgents(csv, week, maxAgents)`)

## Character models

KayKit rigged GLBs served from `world-of-claudecraft/public/models/chars/players/`.
Archetype → model mapping (in `ARCHETYPE_MODELS` table in `scene.ts`):

| Workforce archetype | WoC class |
|---|---|
| student | rogue |
| young_professional | mage |
| parent_caregiver | druid |
| senior_worker | knight |
| veteran_job_seeker | barbarian |
| employer | paladin |
| (default) | ranger |

Models use Meshopt compression — `GLTFLoader` is always initialized with
`MeshoptDecoder` from `three/examples/jsm/libs/meshopt_decoder.module.js`.

Animation clips: `Idle`, `Walking_A`. Crossfade triggered by `agent.moving` flag.

## Workflow: design an experiment

1. Describe the experiment (population, constraints, goals) in the CLI.
2. Edit `generate_mesa_results.py` or the Mesa model to match.
3. Run `npm run mesa:generate` to produce a fresh `agent_states.csv`.
4. The 3D world auto-reloads via Vite HMR; characters update on next week scrub.

## Workflow: follow an agent story

1. Identify an agent of interest by ID from `agent_states.csv` or the legend.
2. Add a `followAgentId` prop to `WocScene` and implement smooth camera lerp
   toward that agent's `group.position` in the render loop.
3. Toggle god-view ↔ follow-cam from a UI button.

## Workflow: capture a cinematic

1. Implement `MediaRecorder` on the `<canvas>` element in `main.tsx`.
2. Start recording, let the clock advance through the story arc.
3. Stop recording; download the `.webm`.
4. For a multi-clip production, stitch with `ffmpeg`.

## React StrictMode note

React 18 StrictMode double-mounts effects in dev. Always call `scene.setAgents()`
**inside the scene-creation effect** (not in a separate `isReady`-guarded effect)
so each new scene instance receives its agents after StrictMode re-mount.

## Common pitfalls

- **Missing MeshoptDecoder** → all characters invisible, legend counts correct
- **Wrong `/@fs/` path** → GLTFLoader 404; check `__WOC_PUBLIC__` in vite.config.ts
- **StrictMode double-mount** → agents never loaded; see React StrictMode note above
- **Status counts all zero** → `this.agents` empty; `setAgents` not called on active scene
