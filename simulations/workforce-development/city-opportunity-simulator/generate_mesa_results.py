#!/usr/bin/env python3
"""Run the documented Mesa scenarios and publish browser-readable JSON."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, replace
from pathlib import Path

import mesa

from mesa_model import WorkforceConfig, WorkforceModel


HERE = Path(__file__).resolve().parent
OUTPUT = HERE / "mesa-results.json"
SCENARIOS = [
    ("baseline", "Baseline", {}),
    ("expanded-outreach", "Outreach 16%", {"outreach_rate": 0.16}),
    ("expanded-training", "Training seats 72", {"training_seats": 72}),
    ("expanded-employer-demand", "Openings 160", {"training_seats": 72, "job_openings": 160}),
]


def build_payload() -> dict:
    baseline = WorkforceConfig()
    scenarios = []
    for scenario_id, label, changes in SCENARIOS:
        config = replace(baseline, **changes)
        model = WorkforceModel(config)
        model.run()
        weeks = model.records()
        final = weeks[-1]
        scenarios.append(
            {
                "id": scenario_id,
                "label": label,
                "config": asdict(config),
                "metrics": {
                    "residentsReached": config.population - final["unaware"],
                    "completedTraining": final["trained"] + final["employed"],
                    "employed": final["employed"],
                    "budgetRemaining": final["budgetRemaining"],
                },
                "weeks": weeks,
            }
        )
    return {
        "simulation_id": "workforce_001",
        "engine": {"name": "Mesa", "version": mesa.__version__},
        "scenarios": scenarios,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = f"{json.dumps(build_payload(), indent=2)}\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != rendered:
            raise SystemExit("mesa-results.json is stale; run generate_mesa_results.py")
        print("Mesa browser results are current.")
    else:
        OUTPUT.write_text(rendered)
        print(f"Wrote Mesa results to {OUTPUT}")


if __name__ == "__main__":
    main()
