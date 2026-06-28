"""Mesa source model for workforce_001."""

from __future__ import annotations

import random
from dataclasses import dataclass

import mesa


@dataclass(frozen=True)
class WorkforceConfig:
    seed: int = 42
    weeks: int = 16
    population: int = 240
    budget: int = 600_000
    outreach_rate: float = 0.08
    training_seats: int = 36
    job_openings: int = 90


class Resident(mesa.Agent):
    """A resident moving through the workforce opportunity pipeline."""

    def __init__(self, model: "WorkforceModel", status: str, skill_fit: float):
        super().__init__(model)
        self.status = status
        self.skill_fit = skill_fit
        self.training_started: int | None = None


class WorkforceModel(mesa.Model):
    """A seeded Mesa model of outreach, training, and employment."""

    def __init__(self, config: WorkforceConfig):
        super().__init__(rng=config.seed)
        self.config = config
        self.current_week = 0
        self.budget_remaining = config.budget
        self.jobs_remaining = config.job_openings
        self.streams = {
            "initialization": random.Random(config.seed + 1),
            "awareness": random.Random(config.seed + 2),
            "completion": random.Random(config.seed + 3),
            "enrollment": random.Random(config.seed + 4),
            "matching": random.Random(config.seed + 5),
        }

        for index in range(config.population):
            Resident(
                self,
                status="aware" if index < -(-config.population // 20) else "unaware",
                skill_fit=0.55 + self.streams["initialization"].random() * 0.45,
            )

        self.datacollector = mesa.DataCollector(
            model_reporters={
                "Unaware": lambda model: model.count_status("unaware"),
                "Aware": lambda model: model.count_status("aware"),
                "Training": lambda model: model.count_status("training"),
                "Trained": lambda model: model.count_status("trained"),
                "Employed": lambda model: model.count_status("employed"),
                "BudgetRemaining": "budget_remaining",
            }
        )
        self.datacollector.collect(self)

    def count_status(self, status: str) -> int:
        return sum(agent.status == status for agent in self.agents)

    def step(self) -> None:
        self.current_week += 1
        awareness = 1 - self.count_status("unaware") / self.config.population
        outreach_cost = min(
            self.budget_remaining,
            2_500 + self.config.population * self.config.outreach_rate * 30,
        )
        self.budget_remaining -= outreach_cost

        for resident in self.agents:
            if resident.status == "unaware" and outreach_cost > 0:
                if self.streams["awareness"].random() < self.config.outreach_rate * (1 + awareness * 0.8):
                    resident.status = "aware"

        for resident in self.agents:
            if resident.status == "training" and resident.training_started is not None and self.current_week - resident.training_started >= 3:
                resident.status = "trained" if self.streams["completion"].random() < 0.92 else "aware"
                resident.training_started = None

        occupied_seats = self.count_status("training")
        for resident in self.agents:
            if resident.status != "aware" or occupied_seats >= self.config.training_seats or self.budget_remaining < 3_500:
                continue
            if self.streams["enrollment"].random() < 0.24:
                resident.status = "training"
                resident.training_started = self.current_week
                occupied_seats += 1
                self.budget_remaining -= 3_500

        for resident in self.agents:
            if resident.status != "trained" or self.jobs_remaining <= 0:
                continue
            if self.streams["matching"].random() < 0.28 * resident.skill_fit:
                resident.status = "employed"
                self.jobs_remaining -= 1

        self.datacollector.collect(self)

    def run(self) -> None:
        for _ in range(self.config.weeks):
            self.step()

    def records(self) -> list[dict[str, int]]:
        frame = self.datacollector.get_model_vars_dataframe().reset_index(drop=True)
        return [
            {
                "week": index,
                "unaware": int(row.Unaware),
                "aware": int(row.Aware),
                "training": int(row.Training),
                "trained": int(row.Trained),
                "employed": int(row.Employed),
                "budgetRemaining": round(float(row.BudgetRemaining)),
            }
            for index, row in frame.iterrows()
        ]
