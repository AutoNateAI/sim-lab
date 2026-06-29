#!/usr/bin/env python3
"""Invariant checks for the Mesa source model."""

from dataclasses import replace

from mesa_model import CITY_PROFILE, DESTINATIONS, INSTITUTIONS, MODE_SPEEDS, ROAD_X, ROAD_Y, WorkforceConfig, WorkforceModel, road_route, route_distance


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

spatial_model = WorkforceModel(baseline_config)
assert CITY_PROFILE["city"]["width"] * CITY_PROFILE["city"]["height"] == 100 * 2400 * 1600
assert len(CITY_PROFILE["school_districts"]) == 20
assert all(source["url"].startswith("https://") for source in CITY_PROFILE["sources"])
assert all(institution["x"] in ROAD_X and institution["y"] in ROAD_Y for institution in INSTITUTIONS.values())
for index, resident in enumerate(spatial_model.agents):
    assert resident.home_y in ROAD_Y
    assert 6 <= resident.day_start_hour <= 10
    assert 15 <= resident.day_end_hour <= 20
    assert resident.day_start_hour < resident.day_end_hour
    assert MODE_SPEEDS[resident.mobility_mode] * 0.85 <= resident.travel_speed <= MODE_SPEEDS[resident.mobility_mode] * 1.15
    assert resident.neighborhood_id in {neighborhood["id"] for neighborhood in CITY_PROFILE["neighborhoods"]}
    assert resident.resident_archetype in {archetype["id"] for archetype in CITY_PROFILE["resident_archetypes"]}
    assert resident.assigned_job_destination_id in INSTITUTIONS
    assert resident.assigned_program_id in INSTITUTIONS
    assert resident.assigned_training_id in INSTITUTIONS
    assert resident.assigned_food_id in INSTITUTIONS
    destination = DESTINATIONS[resident.destination_id()]
    route = road_route((resident.home_x, resident.home_y), destination)
    distance = route_distance(route)
    assert distance >= 0
    assert resident.commute_hours(index + 1) == round(distance / resident.travel_speed, 3)
    assert 0.15 <= resident.priority_score() <= 0.98
    assert 1 <= resident.active_days() <= 5
    assert 4 <= resident.weekly_time_budget() <= 52
    assert resident.action_time_hours(index + 1) >= 1
    assert 0.2 <= resident.time_access_score(index + 1) <= 1.15
    assert all(0 <= value <= 1 for value in (
        resident.hunger,
        resident.fatigue,
        resident.bathroom_pressure,
        resident.preparation_pressure,
        resident.stress,
        resident.social_energy,
        resident.energy,
        resident.peer_support,
    ))
    for start, end in zip(route, route[1:]):
        assert start[0] == end[0] or start[1] == end[1], "routes must remain orthogonal"
print("Mesa model invariants and deterministic comparison passed.")
