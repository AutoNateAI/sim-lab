"""Mesa source model for workforce_001."""

from __future__ import annotations

import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import mesa
import yaml


PROFILE_PATH = Path(__file__).with_name("grand_rapids_profile.yaml")
CITY_PROFILE: dict[str, Any] = yaml.safe_load(PROFILE_PATH.read_text())
CITY = CITY_PROFILE["city"]
ROAD_X = tuple(CITY["road_x"])
ROAD_Y = tuple(CITY["road_y"])
MODE_SPEEDS = CITY["mobility_speeds"]
INSTITUTIONS = {institution["id"]: institution for institution in CITY_PROFILE["institutions"]}
DESTINATIONS = {institution_id: (institution["x"], institution["y"]) for institution_id, institution in INSTITUTIONS.items()}
PROGRAM_DESTINATIONS = tuple(
    institution["id"] for institution in CITY_PROFILE["institutions"]
    if institution["kind"] in {"workforce_program", "community_access", "public_access"}
)
TRAINING_DESTINATIONS = tuple(
    institution["id"] for institution in CITY_PROFILE["institutions"]
    if institution["kind"] in {"training_engine", "university", "high_school"}
)
EMPLOYER_DESTINATIONS = tuple(
    institution["id"] for institution in CITY_PROFILE["institutions"]
    if institution["kind"] in {"employer", "employer_network"}
)
FOOD_DESTINATIONS = tuple(
    institution["id"] for institution in CITY_PROFILE["institutions"] if institution["kind"] == "food"
)
STATUS_ACTIVITY_HOURS = {
    "unaware": 1.0,
    "aware": 4.0,
    "training": 20.0,
    "trained": 6.0,
    "employed": 32.0,
}
STATUS_BASE_DAYS = {"unaware": 1, "aware": 3, "training": 5, "trained": 4, "employed": 5}


def city_world() -> dict[str, Any]:
    roads = []
    for y in ROAD_Y:
        roads.append({"id": f"h-{y}", "kind": "street", "points": [[ROAD_X[0], y], [ROAD_X[-1], y]]})
    for x in ROAD_X:
        roads.append({"id": f"v-{x}", "kind": "street", "points": [[x, ROAD_Y[0]], [x, ROAD_Y[-1]]]})
    return {
        "schema_version": CITY_PROFILE["schema_version"],
        "city": CITY["name"],
        "state": CITY["state"],
        "model_basis": CITY["model_basis"],
        "coordinate_note": CITY["coordinate_note"],
        "width": CITY["width"],
        "height": CITY["height"],
        "focus": CITY["focus"],
        "road_width": CITY["road_width"],
        "roads": roads,
        "districts": CITY_PROFILE["neighborhoods"],
        "institutions": CITY_PROFILE["institutions"],
        "destinations": [{"id": key, "x": value[0], "y": value[1]} for key, value in DESTINATIONS.items()],
        "school_districts": CITY_PROFILE["school_districts"],
        "job_archetypes": CITY_PROFILE["job_archetypes"],
        "resident_archetypes": CITY_PROFILE["resident_archetypes"],
        "demographic_calibration": CITY_PROFILE["demographic_calibration"],
        "needs_model": CITY_PROFILE["needs_model"],
        "sources": CITY_PROFILE["sources"],
        "modeling_assumptions": CITY_PROFILE["modeling_assumptions"],
        "mobility_speeds": MODE_SPEEDS,
        "clock": {"hours_per_day": 24, "days_per_week": 7, "browser_step_minutes": 15},
    }


def destination_for_status(status: str, agent_number: int) -> str:
    if status in {"trained", "employed"}:
        return EMPLOYER_DESTINATIONS[agent_number % len(EMPLOYER_DESTINATIONS)]
    if status in {"training", "trained"}:
        return TRAINING_DESTINATIONS[agent_number % len(TRAINING_DESTINATIONS)]
    return PROGRAM_DESTINATIONS[agent_number % len(PROGRAM_DESTINATIONS)]


def road_route(start: tuple[int, int], end: tuple[int, int]) -> list[tuple[int, int]]:
    """Return an orthogonal route that remains on the shared street grid."""
    if start == end:
        return [start]
    corner = (end[0], start[1])
    return [start, corner, end] if corner not in {start, end} else [start, end]


def route_distance(route: list[tuple[int, int]]) -> float:
    return sum(abs(end[0] - start[0]) + abs(end[1] - start[1]) for start, end in zip(route, route[1:]))


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
        day_start_hour: int,
        day_end_hour: int,
        mobility_mode: str,
        travel_speed: float,
        neighborhood_id: str,
        resident_archetype: str,
        age_band: str,
        income_band: str,
        education_level: str,
        work_hours: float,
        caregiving_hours: float,
        program_interest: float,
        job_archetype_id: str,
        hourly_wage: float,
        assigned_job_destination_id: str,
        assigned_program_id: str,
        assigned_training_id: str,
        assigned_food_id: str,
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
        self.day_start_hour = day_start_hour
        self.day_end_hour = day_end_hour
        self.mobility_mode = mobility_mode
        self.travel_speed = round(travel_speed, 2)
        self.neighborhood_id = neighborhood_id
        self.resident_archetype = resident_archetype
        self.age_band = age_band
        self.income_band = income_band
        self.education_level = education_level
        self.work_hours = work_hours
        self.caregiving_hours = caregiving_hours
        self.program_interest = program_interest
        self.job_archetype_id = job_archetype_id
        self.hourly_wage = hourly_wage
        self.assigned_job_destination_id = assigned_job_destination_id
        self.assigned_program_id = assigned_program_id
        self.assigned_training_id = assigned_training_id
        self.assigned_food_id = assigned_food_id
        self.goal = "get_employed"
        self.current_subgoal = "become_aware" if status == "unaware" else subgoal_for_status(status)
        self.blockers = blockers_for_status(status)
        self.training_started: int | None = None
        self.interaction_count = 0
        self.peer_support = 0.0
        self.hunger = 0.0
        self.fatigue = 0.0
        self.bathroom_pressure = 0.0
        self.preparation_pressure = 0.0
        self.stress = 0.0
        self.social_energy = 0.0
        self.energy = 1.0
        self.refresh_needs()

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
            "home_x": self.home_x,
            "home_y": self.home_y,
            "day_start_hour": self.day_start_hour,
            "day_end_hour": self.day_end_hour,
            "mobility_mode": self.mobility_mode,
            "travel_speed": self.travel_speed,
            "neighborhood_id": self.neighborhood_id,
            "resident_archetype": self.resident_archetype,
            "age_band": self.age_band,
            "income_band": self.income_band,
            "education_level": self.education_level,
            "work_hours": self.work_hours,
            "caregiving_hours": self.caregiving_hours,
            "program_interest": round(self.program_interest, 3),
            "job_archetype_id": self.job_archetype_id,
            "hourly_wage": self.hourly_wage,
            "assigned_job_destination_id": self.assigned_job_destination_id,
            "assigned_program_id": self.assigned_program_id,
            "assigned_training_id": self.assigned_training_id,
            "assigned_food_id": self.assigned_food_id,
            "hunger": round(self.hunger, 3),
            "fatigue": round(self.fatigue, 3),
            "bathroom_pressure": round(self.bathroom_pressure, 3),
            "preparation_pressure": round(self.preparation_pressure, 3),
            "stress": round(self.stress, 3),
            "social_energy": round(self.social_energy, 3),
            "energy": round(self.energy, 3),
            "interaction_count": self.interaction_count,
            "peer_support": round(self.peer_support, 3),
        }

    def destination_id(self) -> str:
        if self.status in {"trained", "employed"}:
            return self.assigned_job_destination_id
        if self.status == "training":
            return self.assigned_training_id
        return self.assigned_program_id

    def neighborhood(self) -> dict[str, Any]:
        return next(neighborhood for neighborhood in CITY_PROFILE["neighborhoods"] if neighborhood["id"] == self.neighborhood_id)

    def refresh_needs(self, shock: float = 0) -> None:
        neighborhood = self.neighborhood()
        commute = self.commute_hours()
        sleep_hours = max(36, min(60, 58 - self.work_hours * 0.08 - self.caregiving_hours * 0.18 - commute * 1.4))
        self.fatigue = max(0.05, min(0.95, (56 - sleep_hours) / 24 + self.family_pressure * 0.28 + shock))
        self.hunger = max(0.04, min(0.96, self.money_pressure * 0.58 + (1 - neighborhood["food_access"]) * 0.42 + shock * 0.6))
        self.bathroom_pressure = max(0.04, min(0.92, 0.16 + commute * 0.12 + self.transportation_pressure * 0.24))
        self.preparation_pressure = max(0.06, min(0.94, self.family_pressure * 0.42 + self.work_hours / 110 + commute * 0.08))
        housing_stress = max(0, neighborhood["housing_cost_index"] - 0.8) * 0.28
        self.stress = max(0.08, min(0.96, self.money_pressure * 0.32 + self.family_pressure * 0.28 + housing_stress + self.transportation_pressure * 0.18 + shock * 0.8))
        self.social_energy = max(0.08, min(0.98, 0.34 + self.motivation * 0.3 + self.peer_support * 0.22 + (0.1 if self.mentor_contact else 0)))
        weights = CITY_PROFILE["needs_model"]["energy_weights"]
        depletion = (
            self.fatigue * weights["sleep"]
            + self.hunger * weights["food"]
            + self.preparation_pressure * weights["preparation"]
            + self.stress * weights["stress"]
            + (1 - self.social_energy) * weights["social"]
        )
        self.energy = max(0.12, min(0.98, 1 - depletion))

    def priority_score(self) -> float:
        score = (
            self.motivation * 0.32
            + self.confidence * 0.18
            + self.money_pressure * 0.2
            + (1 - self.family_pressure) * 0.12
            + (1 - self.transportation_pressure) * 0.08
            + (0.06 if self.mentor_contact else 0)
            + (0.04 if self.employer_contact else 0)
            + self.program_interest * 0.08
            + self.peer_support * 0.08
            - self.stress * 0.08
        )
        return round(max(0.15, min(0.98, score)), 3)

    def active_days(self) -> int:
        base_days = STATUS_BASE_DAYS[self.status]
        return max(1, min(5, round(base_days * (0.65 + self.priority_score() * 0.5))))

    def weekly_time_budget(self) -> float:
        preparation = self.active_days() * CITY_PROFILE["needs_model"]["preparation_hours_per_active_day"]
        hours = (98 - self.work_hours - self.caregiving_hours - preparation) * (0.55 + self.energy * 0.55)
        return round(max(4, min(52, hours)), 2)

    def commute_hours(self, agent_number: int | None = None) -> float:
        destination = DESTINATIONS[self.destination_id()]
        route = road_route((self.home_x, self.home_y), destination)
        return round(route_distance(route) / self.travel_speed, 3)

    def action_time_hours(self, agent_number: int) -> float:
        commute = 0 if self.status == "unaware" else self.commute_hours(agent_number) * 2 * self.active_days()
        return round(STATUS_ACTIVITY_HOURS[self.status] + commute, 2)

    def time_access_score(self, agent_number: int) -> float:
        required = max(1, self.action_time_hours(agent_number))
        capacity = min(1.15, self.weekly_time_budget() / required)
        score = capacity * (0.45 + self.priority_score() * 0.5 + self.energy * 0.2)
        return round(max(0.2, min(1.15, score)), 3)


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
            "mobility": random.Random(config.seed + 6),
            "demographics": random.Random(config.seed + 7),
            "needs": random.Random(config.seed + 8),
            "interactions": random.Random(config.seed + 9),
        }

        neighborhoods = CITY_PROFILE["neighborhoods"]
        archetypes = CITY_PROFILE["resident_archetypes"]
        job_archetypes = {job["id"]: job for job in CITY_PROFILE["job_archetypes"]}
        home_nodes: dict[str, list[tuple[int, int]]] = {}
        for neighborhood in neighborhoods:
            left, top, width, height = neighborhood["bounds"]
            nodes = [
                (x, y)
                for y in ROAD_Y
                if top <= y <= top + height
                for x in range(max(ROAD_X[0], left), min(ROAD_X[-1], left + width) + 1, 180)
            ]
            self.streams["mobility"].shuffle(nodes)
            home_nodes[neighborhood["id"]] = nodes

        def nearest(home: tuple[int, int], destination_ids: tuple[str, ...] | list[str]) -> str:
            return min(destination_ids, key=lambda destination_id: route_distance(road_route(home, DESTINATIONS[destination_id])))

        education_jobs = {
            "high_school": ["food_service", "retail_service", "warehouse_logistics", "production"],
            "some_college": ["retail_service", "warehouse_logistics", "healthcare_support", "production"],
            "certificate": ["healthcare_support", "production", "skilled_trades"],
            "apprenticeship": ["skilled_trades", "production"],
            "bachelors": ["business_technology", "management", "healthcare_support"],
        }
        employer_fit = {
            "food_service": ["eastown_hospitality", "meijer_market"],
            "retail_service": ["meijer_market", "eastown_hospitality"],
            "warehouse_logistics": ["amway_logistics", "meijer_market", "steelcase_manufacturing"],
            "production": ["steelcase_manufacturing", "amway_logistics"],
            "healthcare_support": ["corewell_health"],
            "skilled_trades": ["westside_construction", "steelcase_manufacturing"],
            "business_technology": ["acrisure_professional", "corewell_health", "chamber_small_business"],
            "management": ["acrisure_professional", "corewell_health", "chamber_small_business"],
        }

        for index in range(config.population):
            archetype = self.streams["demographics"].choices(archetypes, weights=[item["weight"] for item in archetypes], k=1)[0]
            target_housing_cost = {"dependent": 0.86, "low": 0.72, "lower_middle": 0.86, "middle": 1.02}[archetype["income_band"]]
            neighborhood_weights = [1 / (0.16 + abs(item["housing_cost_index"] - target_housing_cost)) for item in neighborhoods]
            neighborhood = self.streams["demographics"].choices(neighborhoods, weights=neighborhood_weights, k=1)[0]
            if not home_nodes[neighborhood["id"]]:
                raise RuntimeError(f"No remaining home nodes for {neighborhood['id']}")
            grid_x, grid_y = home_nodes[neighborhood["id"]].pop()
            home = (grid_x, grid_y)
            skill_fit = 0.55 + self.streams["initialization"].random() * 0.45
            motivation = 0.45 + self.streams["initialization"].random() * 0.5
            confidence = 0.35 + self.streams["initialization"].random() * 0.45
            money_pressure = round(0.25 + self.streams["initialization"].random() * 0.5, 3)
            transport = round(0.15 + self.streams["initialization"].random() * 0.5, 3)
            family_pressure = round(0.1 + self.streams["initialization"].random() * 0.5, 3)
            mobility_mode = "walk" if transport > 0.52 else ("bike" if transport > 0.3 else "car")
            education_level = archetype["education"]
            job_options = education_jobs[education_level]
            job_archetype_id = job_options[index % len(job_options)]
            job = job_archetypes[job_archetype_id]
            compatible_employers = employer_fit[job_archetype_id]
            assigned_job_destination_id = nearest(home, compatible_employers)
            assigned_program_id = nearest(home, PROGRAM_DESTINATIONS)
            training_pool = [destination_id for destination_id in TRAINING_DESTINATIONS if INSTITUTIONS[destination_id]["kind"] != "high_school"]
            if archetype["id"] == "high_school_pathway":
                training_pool = [destination_id for destination_id in TRAINING_DESTINATIONS if INSTITUTIONS[destination_id]["kind"] == "high_school"]
            assigned_training_id = nearest(home, training_pool)
            assigned_food_id = nearest(home, FOOD_DESTINATIONS)
            # ~15% start employed, ~5% start aware, rest unaware (reflects GR employment rate)
            n_employed = int(config.population * 0.15)
            n_aware_start = int(config.population * 0.20)  # 15% employed + 5% aware
            if index < n_employed:
                initial_status = "employed"
                # Already-employed agents have lower money pressure
                money_pressure = round(0.05 + self.streams["initialization"].random() * 0.25, 3)
            elif index < n_aware_start:
                initial_status = "aware"
            else:
                initial_status = "unaware"
            Resident(
                self,
                status=initial_status,
                skill_fit=skill_fit,
                home_x=grid_x,
                home_y=grid_y,
                motivation=motivation,
                confidence=confidence,
                money_pressure=money_pressure,
                transportation_pressure=transport,
                family_pressure=family_pressure,
                mentor_contact=index % 7 == 0,
                employer_contact=False,
                day_start_hour=6 + self.streams["mobility"].randrange(5),
                day_end_hour=15 + self.streams["mobility"].randrange(6),
                mobility_mode=mobility_mode,
                travel_speed=MODE_SPEEDS[mobility_mode] * (0.85 + self.streams["mobility"].random() * 0.3),
                neighborhood_id=neighborhood["id"],
                resident_archetype=archetype["id"],
                age_band=archetype["age_band"],
                income_band=archetype["income_band"],
                education_level=education_level,
                work_hours=max(0, archetype["work_hours"] + self.streams["needs"].randrange(-4, 5)),
                caregiving_hours=max(0, archetype["caregiving_hours"] + self.streams["needs"].randrange(-3, 4)),
                program_interest=archetype["program_interest"],
                job_archetype_id=job_archetype_id,
                hourly_wage=job["hourly_wage"],
                assigned_job_destination_id=assigned_job_destination_id,
                assigned_program_id=assigned_program_id,
                assigned_training_id=assigned_training_id,
                assigned_food_id=assigned_food_id,
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

    def update_resident_context(self) -> None:
        neighborhoods: dict[str, list[Resident]] = {}
        for resident in self.agents:
            neighborhoods.setdefault(resident.neighborhood_id, []).append(resident)

        thresholds = CITY_PROFILE["needs_model"]["thresholds"]
        for residents in neighborhoods.values():
            aware_share = sum(resident.status != "unaware" for resident in residents) / len(residents)
            mentor_share = sum(resident.mentor_contact for resident in residents) / len(residents)
            for resident in residents:
                weekly_interactions = max(0, round(resident.active_days() * resident.social_energy * 1.6))
                resident.interaction_count = weekly_interactions
                resident.peer_support = max(0.05, min(0.95, aware_share * 0.48 + mentor_share * 0.32 + weekly_interactions / 20))
                if resident.status == "unaware" and aware_share > 0.5:
                    resident.confidence = min(0.95, resident.confidence + 0.01)
                shock = self.streams["needs"].uniform(-0.04, 0.08)
                resident.refresh_needs(shock)
                unmet = {
                    "hunger": resident.hunger,
                    "fatigue": resident.fatigue,
                    "bathroom": resident.bathroom_pressure,
                    "preparation": resident.preparation_pressure,
                    "stress": resident.stress,
                }
                need, severity = max(unmet.items(), key=lambda item: item[1])
                if severity >= thresholds.get(need, 0.78):
                    self.event_log.append({
                        "week": self.current_week,
                        "agent_id": resident.agent_id,
                        "event": "need_pressure",
                        "need": need,
                        "severity": round(severity, 3),
                    })
                if weekly_interactions >= 4:
                    self.event_log.append({
                        "week": self.current_week,
                        "agent_id": resident.agent_id,
                        "event": "peer_interaction",
                        "neighborhood": resident.neighborhood_id,
                        "count": weekly_interactions,
                    })

    def step(self) -> None:
        self.current_week += 1
        self.update_resident_context()
        awareness = 1 - self.count_status("unaware") / self.config.population
        outreach_cost = min(
            self.budget_remaining,
            2_500 + self.config.population * self.config.outreach_rate * 30,
        )
        self.budget_remaining -= outreach_cost

        for agent_number, resident in enumerate(self.agents, start=1):
            if resident.status == "unaware" and outreach_cost > 0:
                awareness_probability = self.config.outreach_rate * (1 + awareness * 0.45 + resident.peer_support * 0.45) * resident.time_access_score(agent_number)
                if self.streams["awareness"].random() < awareness_probability:
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

        for agent_number, resident in enumerate(self.agents, start=1):
            if resident.status == "training" and resident.training_started is not None and self.current_week - resident.training_started >= 3:
                completion_probability = 0.92 * resident.time_access_score(agent_number)
                resident.status = "trained" if self.streams["completion"].random() < completion_probability else "aware"
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
        for agent_number, resident in enumerate(self.agents, start=1):
            if resident.status != "aware" or occupied_seats >= self.config.training_seats or self.budget_remaining < 3_500:
                continue
            enrollment_probability = 0.24 * resident.time_access_score(agent_number)
            if self.streams["enrollment"].random() < enrollment_probability:
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

        for agent_number, resident in enumerate(self.agents, start=1):
            if resident.status != "trained" or self.jobs_remaining <= 0:
                continue
            matching_probability = 0.28 * resident.skill_fit * resident.time_access_score(agent_number)
            if self.streams["matching"].random() < matching_probability:
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
