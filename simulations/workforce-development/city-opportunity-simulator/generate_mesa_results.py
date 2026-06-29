#!/usr/bin/env python3
"""Build run-folder artifacts for the documented Mesa scenarios."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, replace
from pathlib import Path
from typing import Any

import pandas as pd
import mesa
import yaml

from mesa_model import WorkforceConfig, WorkforceModel, DESTINATIONS, INSTITUTIONS, city_world, road_route, route_distance


HERE = Path(__file__).resolve().parent
RUNS_DIR = HERE / "runs"
INDEX_OUTPUT = RUNS_DIR / "index.json"
LEGACY_OUTPUT = HERE / "mesa-results.json"
WORLD_OUTPUT = HERE / "world.json"
CLOCK_OUTPUT = HERE / "hourly_clock.csv"

SCENARIOS = [
    ("baseline", "Baseline", {}),
    ("expanded-outreach", "Outreach 16%", {"outreach_rate": 0.16}),
    ("expanded-training", "Training seats 72", {"training_seats": 72}),
    ("expanded-employer-demand", "Openings 160", {"training_seats": 72, "job_openings": 160}),
]

def write_yaml(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(yaml.safe_dump(payload, sort_keys=False))


def build_daily_schedule(resident, agent_number: int) -> list[dict[str, Any]]:
    schedule: list[dict[str, Any]] = []

    def add_home(day: int, kind: str, start: float, end: float) -> None:
        schedule.append({"day": day, "kind": kind, "start": start, "end": end, "at_home": True})

    def add_trip(day: int, kind: str, destination_id: str, start: float, end: float) -> None:
        destination = DESTINATIONS[destination_id]
        route = road_route((resident.home_x, resident.home_y), destination)
        schedule.append({
            "day": day,
            "kind": kind,
            "start": round(start, 2),
            "end": round(end, 2),
            "at_home": False,
            "destination_id": destination_id,
            "destination_x": destination[0],
            "destination_y": destination[1],
            "route": route,
            "commute_hours": round(route_distance(route) / resident.travel_speed, 3),
        })

    program_day = agent_number % 5
    weekday_work_days = max(1, min(5, round(resident.work_hours / 8)))
    for day in range(7):
        add_home(day, "sleep", 0, max(5.5, resident.day_start_hour - 1.5))
        add_home(day, "preparation", max(5.5, resident.day_start_hour - 1.5), resident.day_start_hour - 0.5)
        if day < 5:
            if resident.resident_archetype == "high_school_pathway":
                add_trip(day, "school", resident.assigned_training_id, 8, 15)
            elif resident.status == "training":
                add_trip(day, "training", resident.assigned_training_id, resident.day_start_hour, resident.day_end_hour)
            elif (resident.status == "employed" or day < weekday_work_days) and not (
                day == program_day and resident.status in {"unaware", "aware", "trained"}
            ):
                add_trip(day, "work", resident.assigned_job_destination_id, resident.day_start_hour, resident.day_end_hour)
            if day == program_day and resident.status in {"unaware", "aware", "trained"} and resident.resident_archetype != "high_school_pathway":
                add_trip(day, "workforce_program", resident.assigned_program_id, 18, 20)
        elif day == 5:
            add_trip(day, "food", resident.assigned_food_id, 10 + (agent_number % 4) * 0.5, 11.5 + (agent_number % 4) * 0.5)
        elif resident.program_interest >= 0.72 and INSTITUTIONS[resident.assigned_program_id]["kind"] == "community_access":
            add_trip(day, "community", resident.assigned_program_id, 10, 12)
    return sorted(schedule, key=lambda item: (item["day"], item["start"], item["end"]))


def collect_agent_rows(model: WorkforceModel, week: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, resident in enumerate(model.agents):
        destination_id = resident.destination_id()
        destination = DESTINATIONS[destination_id]
        route = road_route((resident.home_x, resident.home_y), destination)
        distance = route_distance(route)
        daily_schedule = build_daily_schedule(resident, index + 1)
        rows.append(
            {
                "week": week,
                "agent_id": resident.agent_id,
                "status": resident.status,
                "goal": resident.goal,
                "current_subgoal": resident.current_subgoal,
                "blockers": json.dumps(resident.blockers),
                "skill": round(resident.skill_fit * 100, 2),
                "motivation": round(resident.motivation * 100, 2),
                "confidence": round(resident.confidence * 100, 2),
                "money_pressure": resident.money_pressure,
                "transportation_pressure": resident.transportation_pressure,
                "family_pressure": resident.family_pressure,
                "mentor_contact": resident.mentor_contact,
                "employer_contact": resident.employer_contact,
                "training_started": resident.training_started,
                "x": resident.home_x,
                "y": resident.home_y,
                "home_x": resident.home_x,
                "home_y": resident.home_y,
                "destination_id": destination_id,
                "destination_x": destination[0],
                "destination_y": destination[1],
                "route": json.dumps(route),
                "day_start_hour": resident.day_start_hour,
                "day_end_hour": resident.day_end_hour,
                "mobility_mode": resident.mobility_mode,
                "travel_speed": resident.travel_speed,
                "route_distance": distance,
                "commute_hours": resident.commute_hours(index + 1),
                "priority_score": resident.priority_score(),
                "active_days": resident.active_days(),
                "weekly_time_budget": resident.weekly_time_budget(),
                "action_time_hours": resident.action_time_hours(index + 1),
                "time_access_score": resident.time_access_score(index + 1),
                "neighborhood_id": resident.neighborhood_id,
                "resident_archetype": resident.resident_archetype,
                "age_band": resident.age_band,
                "income_band": resident.income_band,
                "education_level": resident.education_level,
                "work_hours": resident.work_hours,
                "caregiving_hours": resident.caregiving_hours,
                "program_interest": resident.program_interest,
                "job_archetype_id": resident.job_archetype_id,
                "hourly_wage": resident.hourly_wage,
                "assigned_job_destination_id": resident.assigned_job_destination_id,
                "assigned_program_id": resident.assigned_program_id,
                "assigned_training_id": resident.assigned_training_id,
                "assigned_food_id": resident.assigned_food_id,
                "hunger": resident.hunger,
                "fatigue": resident.fatigue,
                "bathroom_pressure": resident.bathroom_pressure,
                "preparation_pressure": resident.preparation_pressure,
                "stress": resident.stress,
                "social_energy": resident.social_energy,
                "energy": resident.energy,
                "interaction_count": resident.interaction_count,
                "peer_support": resident.peer_support,
                "daily_schedule": json.dumps(daily_schedule),
            }
        )
    return rows


def derive_narrative_beats(weeks: list[dict[str, Any]], config: WorkforceConfig) -> list[dict[str, Any]]:
    beats: list[dict[str, Any]] = []
    if not weeks:
        return beats

    peak_training = max(weeks, key=lambda row: row["training"])
    if peak_training["training"] >= config.training_seats:
        beats.append(
            {
                "week": peak_training["week"],
                "title": "Training reaches capacity",
                "explanation": "Concurrent training slots fill, so access becomes a bottleneck even though interest keeps rising.",
            }
        )

    first_employment = next((row for row in weeks if row["employed"] > 0), None)
    if first_employment is not None:
        beats.append(
            {
                "week": first_employment["week"],
                "title": "Employment starts to move",
                "explanation": "Trained residents begin matching into openings and the pipeline becomes visible in the outcome curve.",
            }
        )

    final = weeks[-1]
    beats.append(
        {
            "week": final["week"],
            "title": "Run closes with a stable bottleneck",
            "explanation": "The final state shows where the system stopped translating resources into employment.",
        }
    )
    return beats


def build_run_artifacts(
    scenario_id: str,
    label: str,
    baseline: WorkforceConfig,
    changes: dict[str, Any],
    write_files: bool = True,
) -> dict[str, Any]:
    config = replace(baseline, **changes)
    run_id = f"workforce_001-{scenario_id}-seed{config.seed}"
    run_dir = RUNS_DIR / run_id

    model = WorkforceModel(config)
    weeks = []
    agent_rows = collect_agent_rows(model, 0)
    weeks.append(model.records()[0])

    for week in range(1, config.weeks + 1):
        model.step()
        weeks.append(model.records()[week])
        agent_rows.extend(collect_agent_rows(model, week))

    final = weeks[-1]
    metrics = {
        "residentsReached": config.population - final["unaware"],
        "completedTraining": final["trained"] + final["employed"],
        "employed": final["employed"],
        "budgetRemaining": final["budgetRemaining"],
        "jobsRemaining": final["jobsRemaining"],
    }
    events = [
        {"week": 0, "event": "run_started", "scenario": scenario_id},
    ] + model.event_log
    narrative = derive_narrative_beats(weeks, config)

    summary = {
        "simulation_id": "workforce_001",
        "scenario_id": scenario_id,
        "run_id": run_id,
        "label": label,
        "description": "Mesa-backed run bundle for strategy review, replay, and publication.",
        "created_at": "2026-06-28",
        "engine": {"name": "Mesa", "version": mesa.__version__},
        "config": asdict(config),
        "metrics": metrics,
        "weeks": weeks,
        "narrative_beats": narrative,
        "artifacts": {
            "root": f"runs/{run_id}",
            "config": f"runs/{run_id}/config.yaml",
            "summary": f"runs/{run_id}/summary.json",
            "metrics_by_step": f"runs/{run_id}/metrics_by_step.csv",
            "agent_states": f"runs/{run_id}/agent_states.csv",
            "events": f"runs/{run_id}/events.jsonl",
            "narrative_beats": f"runs/{run_id}/narrative_beats.json",
            "world": "world.json",
            "hourly_clock": "hourly_clock.csv",
        },
        "event_count": len(events),
        "agent_state_rows": len(agent_rows),
        "narrative_beat_count": len(narrative),
    }

    if write_files:
        run_dir.mkdir(parents=True, exist_ok=True)
        write_yaml(
            run_dir / "config.yaml",
            {
                "simulation_id": "workforce_001",
                "scenario_id": scenario_id,
                "label": label,
                "created_at": "2026-06-28",
                "config": asdict(config),
            },
        )
        (run_dir / "metrics_by_step.csv").write_text(pd.DataFrame(weeks).to_csv(index=False))
        (run_dir / "agent_states.csv").write_text(pd.DataFrame(agent_rows).to_csv(index=False))
        with (run_dir / "events.jsonl").open("w", encoding="utf-8") as handle:
            for event in events:
                handle.write(f"{json.dumps(event)}\n")
        (run_dir / "narrative_beats.json").write_text(f"{json.dumps(narrative, indent=2)}\n")
        (run_dir / "summary.json").write_text(f"{json.dumps(summary, indent=2)}\n")
    return summary


def build_payload() -> dict[str, Any]:
    baseline = WorkforceConfig()
    runs = [build_run_artifacts(scenario_id, label, baseline, changes, write_files=False) for scenario_id, label, changes in SCENARIOS]
    payload = {
        "simulation_id": "workforce_001",
        "engine": {"name": "Mesa", "version": mesa.__version__},
        "latest_run_id": runs[-1]["run_id"],
        "runs": runs,
    }
    return payload


def write_legacy_outputs(payload: dict[str, Any]) -> None:
    LEGACY_OUTPUT.write_text(f"{json.dumps(payload, indent=2)}\n")
    INDEX_OUTPUT.write_text(f"{json.dumps(payload, indent=2)}\n")


def hourly_clock(weeks: int) -> list[dict[str, int]]:
    return [
        {
            "tick": tick,
            "week": tick // 168,
            "day": (tick % 168) // 24,
            "hour": tick % 24,
        }
        for tick in range(weeks * 168 + 1)
    ]


def write_world_artifacts(config: WorkforceConfig) -> None:
    WORLD_OUTPUT.write_text(f"{json.dumps(city_world(), indent=2)}\n")
    CLOCK_OUTPUT.write_text(pd.DataFrame(hourly_clock(config.weeks)).to_csv(index=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = f"{json.dumps(build_payload(), indent=2)}\n"
    if args.check:
        if not LEGACY_OUTPUT.exists() or LEGACY_OUTPUT.read_text() != rendered:
            raise SystemExit("mesa-results.json is stale; run generate_mesa_results.py")
        if not INDEX_OUTPUT.exists() or INDEX_OUTPUT.read_text() != rendered:
            raise SystemExit("runs/index.json is stale; run generate_mesa_results.py")
        expected_world = f"{json.dumps(city_world(), indent=2)}\n"
        expected_clock = pd.DataFrame(hourly_clock(WorkforceConfig().weeks)).to_csv(index=False)
        if not WORLD_OUTPUT.exists() or WORLD_OUTPUT.read_text() != expected_world:
            raise SystemExit("world.json is stale; run generate_mesa_results.py")
        if not CLOCK_OUTPUT.exists() or CLOCK_OUTPUT.read_text() != expected_clock:
            raise SystemExit("hourly_clock.csv is stale; run generate_mesa_results.py")
        print("Mesa run artifacts are current.")
    else:
        baseline = WorkforceConfig()
        runs = [build_run_artifacts(scenario_id, label, baseline, changes, write_files=True) for scenario_id, label, changes in SCENARIOS]
        write_legacy_outputs({
            "simulation_id": "workforce_001",
            "engine": {"name": "Mesa", "version": mesa.__version__},
            "latest_run_id": runs[-1]["run_id"],
            "runs": runs,
        })
        write_world_artifacts(baseline)
        print(f"Wrote Mesa run artifacts to {RUNS_DIR}")


if __name__ == "__main__":
    main()
