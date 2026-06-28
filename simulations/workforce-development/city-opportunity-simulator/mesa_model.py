"""Mesa source model for workforce_001."""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any

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

    def __init__(
        self,
        model: "WorkforceModel",
        status: str,
        skill_fit: float,
        home_x: int,
        home_y: int,
        motivation: float,
        confidence: float,
        money_pressure: float,
        transportation_pressure: float,
        family_pressure: float,
        mentor_contact: bool,
        employer_contact: bool,
    ):
        super().__init__(model)
        self.status = status
        self.skill_fit = skill_fit
        self.home_x = home_x
        self.home_y = home_y
        self.motivation = motivation
        self.confidence = confidence
        self.money_pressure = money_pressure
        self.transportation_pressure = transportation_pressure
        self.family_pressure = family_pressure
        self.mentor_contact = mentor_contact
        self.employer_contact = employer_contact
        self.goal = "get_employed"
        self.current_subgoal = "become_aware" if status == "unaware" else subgoal_for_status(status)
        self.blockers = blockers_for_status(status)
        self.training_started: int | None = None

    @property
    def agent_id(self) -> str:
        return f"resident_{int(self.unique_id):03d}"

    def snapshot(self, week: int) -> dict[str, Any]:
        return {
            "week": week,
            "agent_id": self.agent_id,
            "status": self.status,
            "goal": self.goal,
            "current_subgoal": self.current_subgoal,
            "blockers": list(self.blockers),
            "skill": round(self.skill_fit * 100, 2),
            "motivation": round(self.motivation * 100, 2),
            "confidence": round(self.confidence * 100, 2),
            "money_pressure": round(self.money_pressure, 3),
            "transportation_pressure": round(self.transportation_pressure, 3),
            "family_pressure": round(self.family_pressure, 3),
            "mentor_contact": self.mentor_contact,
            "employer_contact": self.employer_contact,
            "training_started": self.training_started,
            "x": self.home_x,
            "y": self.home_y,
        }


def subgoal_for_status(status: str) -> str:
    return {
        "unaware": "become_aware",
        "aware": "enroll",
        "training": "complete_training",
        "trained": "get_hired",
        "employed": "stay_employed",
    }.get(status, "get_employed")


def blockers_for_status(status: str) -> list[str]:
    return {
        "unaware": ["low_awareness"],
        "aware": ["program_friction"],
        "training": ["seat_capacity"],
        "trained": ["employer_demand"],
        "employed": [],
    }.get(status, [])


class WorkforceModel(mesa.Model):
    """A seeded Mesa model of outreach, training, and employment."""

    def __init__(self, config: WorkforceConfig):
        super().__init__(rng=config.seed)
        self.config = config
        self.current_week = 0
        self.budget_remaining = config.budget
        self.jobs_remaining = config.job_openings
        self.event_log: list[dict[str, Any]] = []
        self.streams = {
            "initialization": random.Random(config.seed + 1),
            "awareness": random.Random(config.seed + 2),
            "completion": random.Random(config.seed + 3),
            "enrollment": random.Random(config.seed + 4),
            "matching": random.Random(config.seed + 5),
        }

        for index in range(config.population):
            grid_x = 50 + (index % 12) * 30
            grid_y = 80 + (index // 12) * 24
            Resident(
                self,
                status="aware" if index < -(-config.population // 20) else "unaware",
                skill_fit=0.55 + self.streams["initialization"].random() * 0.45,
                home_x=grid_x,
                home_y=grid_y,
                motivation=0.45 + self.streams["initialization"].random() * 0.5,
                confidence=0.35 + self.streams["initialization"].random() * 0.45,
                money_pressure=round(0.25 + self.streams["initialization"].random() * 0.5, 3),
                transportation_pressure=round(0.15 + self.streams["initialization"].random() * 0.5, 3),
                family_pressure=round(0.1 + self.streams["initialization"].random() * 0.5, 3),
                mentor_contact=index % 7 == 0,
                employer_contact=False,
            )

        self.datacollector = mesa.DataCollector(
            model_reporters={
                "Unaware": lambda model: model.count_status("unaware"),
                "Aware": lambda model: model.count_status("aware"),
                "Training": lambda model: model.count_status("training"),
                "Trained": lambda model: model.count_status("trained"),
                "Employed": lambda model: model.count_status("employed"),
                "BudgetRemaining": "budget_remaining",
                "JobsRemaining": "jobs_remaining",
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
                    resident.current_subgoal = "enroll"
                    resident.blockers = blockers_for_status("aware")
                    resident.confidence = min(0.95, resident.confidence + 0.05)
                    resident.mentor_contact = True
                    self.event_log.append({
                        "week": self.current_week,
                        "agent_id": resident.agent_id,
                        "event": "became_aware",
                    })

        for resident in self.agents:
            if resident.status == "training" and resident.training_started is not None and self.current_week - resident.training_started >= 3:
                resident.status = "trained" if self.streams["completion"].random() < 0.92 else "aware"
                resident.training_started = None
                resident.current_subgoal = subgoal_for_status(resident.status)
                resident.blockers = blockers_for_status(resident.status)
                resident.confidence = min(0.98, resident.confidence + 0.08)
                resident.skill_fit = min(1.0, resident.skill_fit + 0.04)
                self.event_log.append({
                    "week": self.current_week,
                    "agent_id": resident.agent_id,
                    "event": "training_completed" if resident.status == "trained" else "returned_to_awareness",
                })

        occupied_seats = self.count_status("training")
        for resident in self.agents:
            if resident.status != "aware" or occupied_seats >= self.config.training_seats or self.budget_remaining < 3_500:
                continue
            if self.streams["enrollment"].random() < 0.24:
                resident.status = "training"
                resident.training_started = self.current_week
                resident.current_subgoal = "complete_training"
                resident.blockers = blockers_for_status("training")
                resident.motivation = min(0.98, resident.motivation + 0.03)
                occupied_seats += 1
                self.budget_remaining -= 3_500
                self.event_log.append({
                    "week": self.current_week,
                    "agent_id": resident.agent_id,
                    "event": "entered_training",
                })

        for resident in self.agents:
            if resident.status != "trained" or self.jobs_remaining <= 0:
                continue
            if self.streams["matching"].random() < 0.28 * resident.skill_fit:
                resident.status = "employed"
                self.jobs_remaining -= 1
                resident.current_subgoal = "stay_employed"
                resident.blockers = blockers_for_status("employed")
                resident.employer_contact = True
                self.event_log.append({
                    "week": self.current_week,
                    "agent_id": resident.agent_id,
                    "event": "matched_to_employment",
                })

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
                "jobsRemaining": int(row.JobsRemaining),
            }
            for index, row in frame.iterrows()
        ]
