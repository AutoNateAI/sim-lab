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

from mesa_model import WorkforceConfig, WorkforceModel


HERE = Path(__file__).resolve().parent
RUNS_DIR = HERE / "runs"
INDEX_OUTPUT = RUNS_DIR / "index.json"
LEGACY_OUTPUT = HERE / "mesa-results.json"

SCENARIOS = [
    ("baseline", "Baseline", {}),
    ("expanded-outreach", "Outreach 16%", {"outreach_rate": 0.16}),
    ("expanded-training", "Training seats 72", {"training_seats": 72}),
    ("expanded-employer-demand", "Openings 160", {"training_seats": 72, "job_openings": 160}),
]

def write_yaml(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(yaml.safe_dump(payload, sort_keys=False))


def status_position(index: int, status: str) -> tuple[int, int]:
    anchors = {
        "unaware": (70, 140),
        "aware": (220, 120),
        "training": (420, 180),
        "trained": (640, 150),
        "employed": (840, 120),
    }
    anchor_x, anchor_y = anchors.get(status, (70, 140))
    return anchor_x + (index % 8) * 12, anchor_y + (index // 8) * 14


def collect_agent_rows(model: WorkforceModel, week: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, resident in enumerate(model.agents):
        x, y = status_position(index, resident.status)
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
                "x": x,
                "y": y,
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
        print(f"Wrote Mesa run artifacts to {RUNS_DIR}")


if __name__ == "__main__":
    main()
