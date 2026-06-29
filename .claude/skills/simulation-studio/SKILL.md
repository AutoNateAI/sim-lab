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
apps/woc-sim/src/scene.ts          — WocScene class: terrain, characters, animation, follow mode
apps/woc-sim/src/main.tsx          — React shell: clock, scrubber, legend, outcome modal, story panel
apps/woc-sim/vite.config.ts        — Vite config (Three.js alias, /@fs/ asset paths)

simulations/workforce-development/eastbrook-vale-experiment/
  design/experiment-spec.md        — Full experiment design (population, mechanics, pipeline)
  design/skill-tracks.md           — 5 skill tracks, thresholds, archetype affinities
  design/dynamic-economy.md        — Job opening logic, workload formulas, wage structure

simulations/workforce-development/city-opportunity-simulator/
  generate_mesa_results.py         — Current Mesa model (basic, to be replaced)
  runs/workforce_001-baseline-seed42/agent_states.csv  — Current simulation output
```

## Approved Experiment Design (Eastbrook Vale)

**Population:** 50 agents — 8 employed workers + 42 job seekers  
**Duration:** 16 weeks  
**Key question:** What patterns of interaction, timing, and resource access drive unskilled → employed?

### 8 Employed Workers (Economic Anchors)

| Worker | Count | Creates jobs for |
|---|---|---|
| Innkeeper | 1 | Commerce track (Inn Helper, threshold 30) |
| Blacksmith | 1 | Crafting track (Apprentice, threshold 50) |
| Hunter | 2 | Nature track (Apprentice, threshold 40) |
| Merchant | 2 | Commerce + Combat (Merchant Asst 45, Scout 45) |
| Guard Captain | 2 | Combat track (Apprentice, threshold 40) |

### 5 Skill Tracks (Specialization — one per agent, assigned at spawn)

| Track | Jobs | Threshold | Trainer | Key mechanic |
|---|---|---|---|---|
| Combat | Guard Apprentice, Scout | 40–45 | Guard Captain | Physical energy drain, fast mentor access |
| Crafting | Apprentice Blacksmith | 50 | Blacksmith | Only 1 slot ever — most competitive |
| Commerce | Inn Helper, Merchant Asst | 30–45 | Innkeeper/Merchant | Fastest first job, lowest threshold |
| Nature | Farm Hand, Hunter Apprentice | 35–40 | Hunter | Commute disadvantage, food foraging bonus |
| Healing | Herbalist Apprentice | 45 | Herbalist NPC | Slowest path, highest social capital payoff |

### Agent Attributes

```
energy:         0–100   (depleted by activities, restored by sleep + food)
money:          float   (income minus food/shelter; can go negative → survival mode)
stress:         0–100   (job rejection +20, successful training −5, hire −40)
skill_level:    0–100   (track-specific, gains modified by energy × stress)
social_capital: 0–100   (hidden variable — speeds hiring via referral path at >60)
```

### Dynamic Job Openings

Jobs only open when an employer's workload > threshold (no fixed schedule).
Workload is driven by how many seekers are in town creating demand (food, tools, protection).
More seekers → more demand → more jobs open — but rate-limited by employer capacity.

First 3 weeks are critical: if early burnouts cascade, demand drops and job openings delay.

### Status Pipeline

```
Unaware → Aware → Training → Trained → Employed
```
- **Unaware→Aware**: Hub visit (p=0.15 + social_capital×0.003) or gossip from neighbor
- **Aware→Training**: Enroll in track session (requires energy>40, money≥0, open slot)
- **Training→Trained**: skill_level crosses threshold + 4 completed sessions minimum
- **Trained→Employed**: Job posting exists + `p = 0.4 + skill/200 + social/300`; referral path: social>60 → p=0.75

### Key Patterns to Follow (Story Mode)

| Story | Who | Watch for |
|---|---|---|
| Fast mover | Student, Commerce, near Hub | Hired Week 2–3 |
| Late bloomer | Senior Worker, Crafting | Burnout then recovery, Week 6 slot |
| Social connector | Veteran, high social_capital | Referral hire despite slow skill |
| Isolated grinder | Young Professional, far from Hub | Skill capped, no social capital, stuck |
| Dropout | Parent/Caregiver, money crisis | Survival mode Week 5 |
| Catalyst | Any first hire | Their hire reduces workload → opens 2nd slot |

## World Constants

- Zone: Eastbrook Vale, `±180 yards` in x/z
- Hub: `{x:0, z:0}` — Eastbrook Inn + training hall
- World seed: `20061`
- Agent cap: 50 (configurable via `parseAgents(csv, week, maxAgents)`)

## Character Models

KayKit rigged GLBs from `world-of-claudecraft/public/models/chars/players/`.
Models use Meshopt compression — `GLTFLoader` always needs `setMeshoptDecoder(MeshoptDecoder)`.

| Archetype | Model | Skill track affinity |
|---|---|---|
| student | rogue | Any (equal weights) |
| young_professional | mage | Commerce, Crafting |
| parent_caregiver | druid | Healing, Nature |
| senior_worker | knight | Crafting, Nature |
| veteran_job_seeker | barbarian | Combat |
| employer | paladin | Commerce |

## Follow Mode

- `scene.toggleFollow(agentId)` → glowing cyan arrow above agent, camera lerps to centroid
- `scene.clearFollows()` → removes all follow arrows
- `scene.getFollowedIds()` → ReadonlySet<string>
- Camera: `zoomToCursor = true`, `screenSpacePanning = true` for natural trackpad navigation

## React StrictMode Note

Always call `scene.setAgents()` inside the scene-creation effect (not in a separate `isReady`-guarded effect) so each StrictMode re-mount gets its agents.

## Common Pitfalls

- **Missing MeshoptDecoder** → characters invisible, legend counts correct
- **Wrong `/@fs/` path** → GLTFLoader 404; check `__WOC_PUBLIC__` in vite.config.ts
- **StrictMode double-mount** → agents never loaded; see React StrictMode note above
- **Status counts all zero** → `this.agents` empty; `setAgents` not called on active scene
