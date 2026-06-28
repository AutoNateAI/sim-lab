---
title: Code
sidebar_position: 3
---

# Code notes

The Mesa simulation is intentionally small enough to read in one sitting.

- [`mesa_model.py`](https://github.com/AutoNateAI/sim-lab/blob/main/simulations/workforce-development/city-opportunity-simulator/mesa_model.py) defines the Mesa `Model`, resident `Agent`, schedule, and `DataCollector`.
- [`generate_mesa_results.py`](https://github.com/AutoNateAI/sim-lab/blob/main/simulations/workforce-development/city-opportunity-simulator/generate_mesa_results.py) runs the documented scenarios into `mesa-results.json`.
- [`CityOpportunitySimulator.tsx`](https://github.com/AutoNateAI/sim-lab/blob/main/simulations/workforce-development/city-opportunity-simulator/CityOpportunitySimulator.tsx) visualizes those checked-in Mesa outputs; it does not reimplement the model in TypeScript.
- [`capture-actual-app.mjs`](https://github.com/AutoNateAI/sim-lab/blob/main/simulations/workforce-development/city-opportunity-simulator/capture-actual-app.mjs) captures reproducible screenshots from the real site with Playwright.

## Determinism

`WorkforceModel` creates independent seeded random streams for initialization, awareness, enrollment, completion, and matching. This means a parameter comparison can be reproduced exactly, and a downstream setting cannot perturb an upstream random sequence.

```ts
baseline = WorkforceModel(WorkforceConfig(seed=42))
expanded = WorkforceModel(WorkforceConfig(seed=42, training_seats=60))
```

Only the changed parameter differs between those runs.

## Extending the model

Add new resident state to the `Resident` agent, initialize it in `WorkforceModel`, then make its effect explicit in one submodel. For example, transportation access could reduce enrollment or job matching without changing awareness.

Keep three rules:

1. document every new behavior in the [ODD protocol](./odd.md);
2. preserve seeded randomness;
3. add a metric that makes the behavior observable.
