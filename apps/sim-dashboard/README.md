# Sim Dashboard

The Sim Dashboard is AutoNateAI's internal cockpit for studying reproducible simulation runs. It is a standalone Vite/React/Phaser application inside the Sim Lab monorepo.

```bash
npm run dashboard:dev
```

Open <http://127.0.0.1:5174/>. The dashboard intentionally uses a dedicated port because other AutoNateAI applications may already use `localhost:5173`.

![Dark simulation telemetry dashboard](../../simulations/assets/sim-dashboard-dark.png)

## Boundary

Mesa is the truth engine. The dashboard reads `runs/index.json`, per-step metrics, agent states, events, and narrative beats. Phaser is an observation and replay layer; model rules do not belong in this application.

## Current capabilities

- Whole-board replay, cursor-centered zoom, and drag panning.
- Single-agent follow and Shift-click multi-agent follow.
- Follow markers, automatic group framing, timeline scrubbing, and pause/resume.
- Scenario switching between checked-in Mesa run bundles.
- Expanded analytical report with configuration, metrics, narrative beats, and agent state.
- AutoNateAI sage light and default green/navy/neon-red dark themes.

## Direction

The cockpit will support board-generation skills, persistent homes, mobility modes and speeds, spatial constraints, observation notes, screenshots, recordings, and report drafting. See the public [research cockpit and world roadmap](../../simulations/vision.md) for the architectural intent and scaling rules.
