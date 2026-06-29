---
title: Code
sidebar_position: 3
---

# Code notes

The Mesa simulation is intentionally small enough to read in one sitting.

- [`mesa_model.py`](https://github.com/AutoNateAI/sim-lab/blob/main/simulations/workforce-development/city-opportunity-simulator/mesa_model.py) defines the Mesa `Model`, resident `Agent`, schedule, and `DataCollector`.
- [`generate_mesa_results.py`](https://github.com/AutoNateAI/sim-lab/blob/main/simulations/workforce-development/city-opportunity-simulator/generate_mesa_results.py) runs the documented scenarios into per-run folders under `runs/` and writes `runs/index.json` plus the compatibility `mesa-results.json`.
- [`CityOpportunitySimulator.tsx`](https://github.com/AutoNateAI/sim-lab/blob/main/simulations/workforce-development/city-opportunity-simulator/CityOpportunitySimulator.tsx) visualizes the run index and selected run summaries; it does not reimplement the model in TypeScript.
- [`capture-actual-app.mjs`](https://github.com/AutoNateAI/sim-lab/blob/main/simulations/workforce-development/city-opportunity-simulator/capture-actual-app.mjs) captures reproducible screenshots from the real site with Playwright.

## Determinism

`WorkforceModel` creates independent seeded random streams for initialization, awareness, enrollment, completion, and matching. This means a parameter comparison can be reproduced exactly, and a downstream setting cannot perturb an upstream random sequence.

```ts
baseline = WorkforceModel(WorkforceConfig(seed=42))
expanded = WorkforceModel(WorkforceConfig(seed=42, training_seats=60))
```

Only the changed parameter differs between those runs.

Each run also writes a structured artifact bundle:

- `config.yaml`
- `summary.json`
- `metrics_by_step.csv`
- `agent_states.csv`
- `events.jsonl`
- `narrative_beats.json`

## Extending the model

Add new resident state to the `Resident` agent, initialize it in `WorkforceModel`, then make its effect explicit in one submodel. For example, transportation access could reduce enrollment or job matching without changing awareness.

Keep three rules:

1. document every new behavior in the [ODD protocol](./odd.md);
2. preserve seeded randomness;
3. add a metric that makes the behavior observable.
## Time-aware city and mobility contract

Mesa owns the spatial inputs used by the Phaser replay. `world.json` defines the street grid, residential area, education corridor, business district, destinations, mobility speeds, and 24-hour clock. Each resident receives a seeded home on a street, an individual start and end hour, a walk/bike/car mode, a varied finite travel speed, and an orthogonal route to the destination implied by the resident's weekly status.

`grand_rapids_profile.yaml` is the reusable, source-backed city contract. It defines a 24,000 × 16,000 schematic world—100 times the original board area—plus named neighborhoods, road geometry, institutions, school districts, occupation families, resident archetypes, demographic calibration targets, needs, sources, and explicit assumptions. `world.json` is its browser-ready projection.

`hourly_clock.csv` provides the checked-in hourly timestamps across the 16-week run. Every agent row also carries a seven-day schedule with separate road routes for work, school, training, workforce programs, food, and community activity. The browser advances in 15-minute substeps and computes every intermediate position from those Mesa-authored routes. Directional lane offsets, traffic signals, following gaps, and building occupancy turn dense edges into queues without grass-cutting or visible indoor agents.

Each row stores profile, job, wage, neighborhood, needs, energy, peer interactions, route distance, commute hours, priority, available weekly hours, required action hours, and time access. Pipeline transitions remain weekly, but every transition probability is multiplied by time access and shaped by work, caregiving, preparation, energy, stress, and local peer support. Location, schedules, travel, traffic delay, and lighting advance at 15-minute resolution between those decisions.
