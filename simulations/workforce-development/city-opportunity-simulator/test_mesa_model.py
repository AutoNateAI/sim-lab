#!/usr/bin/env python3
"""Invariant checks for the Mesa source model."""

from dataclasses import replace

from mesa_model import WorkforceConfig, WorkforceModel


def run(config: WorkforceConfig):
    model = WorkforceModel(config)
    model.run()
    return model.records()


baseline_config = WorkforceConfig()
baseline = run(baseline_config)
assert baseline == run(baseline_config), "same Mesa seed and inputs must reproduce"
assert len(baseline) == baseline_config.weeks + 1
for record in baseline:
    assert sum(record[key] for key in ("unaware", "aware", "training", "trained", "employed")) == baseline_config.population
    assert record["budgetRemaining"] >= 0

training = run(replace(baseline_config, training_seats=72))
demand = run(replace(baseline_config, training_seats=72, job_openings=160))
training_completed = training[-1]["trained"] + training[-1]["employed"]
demand_completed = demand[-1]["trained"] + demand[-1]["employed"]
assert training_completed == demand_completed, "demand cannot perturb upstream Mesa completion"
print("Mesa model invariants and deterministic comparison passed.")
