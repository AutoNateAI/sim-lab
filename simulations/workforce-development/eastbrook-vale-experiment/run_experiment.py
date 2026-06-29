#!/usr/bin/env python3
"""
Run the Eastbrook Vale Workforce Experiment and output agent_states.csv.

Usage:
    python run_experiment.py
    python run_experiment.py --seed 42 --weeks 16
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from collections import Counter

HERE = Path(__file__).resolve().parent

sys.path.insert(0, str(HERE))
from eastbrook_model import run_experiment, write_csv, JOBS


def print_summary(snapshots: list[dict], weeks: int) -> None:
    final_week = [r for r in snapshots if r["week"] == weeks - 1]
    seekers = [r for r in final_week if not r["agent_id"].startswith(
        ("innkeeper", "blacksmith", "hunter", "merchant", "guard")
    )]

    status_counts = Counter(r["status"] for r in seekers)
    track_employed = Counter(
        r["skill_track"] for r in seekers if r["status"] == "employed"
    )

    print("\n" + "═" * 52)
    print("  Eastbrook Vale Experiment — Final Results")
    print("═" * 52)
    print(f"  Weeks simulated : {weeks}")
    print(f"  Total seekers   : {len(seekers)}")
    print()
    print("  Status breakdown (week {})".format(weeks - 1))
    for status in ("employed", "trained", "training", "aware", "unaware", "dropout"):
        n = status_counts.get(status, 0)
        bar = "█" * n + "░" * (len(seekers) - n)
        print(f"    {status:<10} {n:>3}  {bar[:30]}")

    print()
    print("  Employed by skill track:")
    for track in ("combat", "crafting", "commerce", "nature", "healing"):
        n = track_employed.get(track, 0)
        print(f"    {track:<12} {n}")

    # Hiring events
    hired_rows = [r for r in snapshots if r["event_this_week"] in ("hired", "hired_via_referral")]
    referrals = [r for r in hired_rows if r["event_this_week"] == "hired_via_referral"]
    dropouts = [r for r in snapshots if r["event_this_week"] == "dropout"]
    print()
    print(f"  Total hire events    : {len(hired_rows)}")
    print(f"  Via referral         : {len(referrals)}")
    print(f"  Dropout events       : {len(dropouts)}")

    # Job opening timeline
    print()
    print("  Job opening events (first occurrence per job):")
    job_open_weeks: dict[str, int] = {}
    for r in snapshots:
        if r["event_this_week"] == "job_opened":
            agent = r["agent_id"]
            w = int(r["week"])
            if agent not in job_open_weeks:
                job_open_weeks[agent] = w
    for employer, week in sorted(job_open_weeks.items(), key=lambda x: x[1]):
        print(f"    week {week:>2}  {employer}")

    print("═" * 52 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Eastbrook Vale experiment")
    parser.add_argument("--seed", type=int, default=20061, help="Random seed")
    parser.add_argument("--weeks", type=int, default=16, help="Weeks to simulate")
    parser.add_argument("--out", type=str, default="", help="Output CSV path (default: auto)")
    args = parser.parse_args()

    run_id = f"eastbrook_001_seed{args.seed}"
    out_path = args.out or str(HERE / "runs" / run_id / "agent_states.csv")

    print(f"Running Eastbrook Vale experiment: seed={args.seed}, weeks={args.weeks}")
    print(f"Output → {out_path}")

    snapshots = run_experiment(seed=args.seed, weeks=args.weeks)
    write_csv(snapshots, out_path)
    print_summary(snapshots, args.weeks)


if __name__ == "__main__":
    main()
