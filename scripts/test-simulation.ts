import assert from 'node:assert/strict';
import {defaultConfig, runSimulation} from '../simulations/workforce-development/city-opportunity-simulator/simulation';

const baseline = runSimulation(defaultConfig);
const repeated = runSimulation(defaultConfig);
assert.deepEqual(repeated, baseline, 'same inputs and seed must reproduce the same run');
assert.equal(baseline.length, defaultConfig.weeks + 1, 'run includes initialization plus every week');

for (const week of baseline) {
  const population = week.unaware + week.aware + week.training + week.trained + week.employed;
  assert.equal(population, defaultConfig.population, `population must be conserved in week ${week.week}`);
  assert.ok(week.budgetRemaining >= 0, `budget cannot be negative in week ${week.week}`);
}

const expanded = runSimulation({...defaultConfig, trainingSeats: 72});
assert.notDeepEqual(expanded, baseline, 'changing capacity should change the trajectory');
assert.ok(expanded.at(-1)!.trained + expanded.at(-1)!.employed >= baseline.at(-1)!.trained + baseline.at(-1)!.employed, 'expanded capacity should not reduce completions in the fixed scenario');
console.log('Simulation invariants and deterministic comparison passed.');
