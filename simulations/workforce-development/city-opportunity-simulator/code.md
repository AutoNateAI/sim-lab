---
title: Code
sidebar_position: 3
---

# Code notes

The simulation is intentionally small enough to read in one sitting.

- [`simulation.ts`](https://github.com/AutoNateAI/sim-lab/blob/main/simulations/workforce-development/city-opportunity-simulator/simulation.ts) is a pure TypeScript model with no browser dependency.
- [`CityOpportunitySimulator.tsx`](https://github.com/AutoNateAI/sim-lab/blob/main/simulations/workforce-development/city-opportunity-simulator/CityOpportunitySimulator.tsx) supplies controls, metrics, and the SVG time-series chart.
- [`capture-actual-app.mjs`](https://github.com/AutoNateAI/sim-lab/blob/main/simulations/workforce-development/city-opportunity-simulator/capture-actual-app.mjs) captures reproducible screenshots from the real site with Playwright.

## Determinism

`runSimulation(config)` creates a Mulberry32 pseudorandom generator from `config.seed`. It never calls `Math.random()`. This means a parameter comparison can be reproduced exactly.

```ts
const baseline = runSimulation({...defaultConfig, seed: 42});
const expanded = runSimulation({...defaultConfig, seed: 42, trainingSeats: 60});
```

Only the changed parameter differs between those runs.

## Extending the model

Add new resident state to the `Resident` interface, initialize it in `runSimulation`, then make its effect explicit in one submodel. For example, transportation access could reduce enrollment or job matching without changing awareness.

Keep three rules:

1. document every new behavior in the [ODD protocol](./odd.md);
2. preserve seeded randomness;
3. add a metric that makes the behavior observable.
