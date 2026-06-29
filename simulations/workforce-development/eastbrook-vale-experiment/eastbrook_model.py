"""
Eastbrook Vale Workforce Experiment — Mesa 3.x Agent-Based Model

50 agents: 8 employed workers (economic anchors) + 42 job seekers.
16 simulated weeks. Implements the full design from design/experiment-spec.md

Output: agent_states.csv with named columns, compatible with apps/woc-sim.
"""
from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass, field
from typing import Optional

import mesa

# ─── WORLD CONSTANTS ─────────────────────────────────────────────────────────

GR_HUB: tuple[int, int] = (12000, 8000)   # Inn center, maps to WoC (0,0)

TRACK_LOCATIONS: dict[str, tuple[int, int]] = {
    "combat":   (14000, 6500),
    "crafting": (12600, 7600),
    "commerce": (12000, 8000),
    "nature":   (14500, 9500),
    "healing":  (10000, 9500),
}

NEIGHBORHOODS: dict[str, tuple[tuple[int, int], tuple[int, int]]] = {
    "north_quarter": ((10500, 6200), (13000, 7400)),
    "east_side":     ((13000, 7000), (15500, 8800)),
    "south_market":  ((11000, 8800), (13500, 10200)),
    "west_hollow":   ((9200, 7200), (11500, 9000)),
    "outer_reach":   ((7500, 5800), (10000, 11500)),
}

ARCHETYPE_TRACK_WEIGHTS: dict[str, dict[str, float]] = {
    "student":            {"combat": 0.20, "crafting": 0.20, "commerce": 0.20, "nature": 0.20, "healing": 0.20},
    "young_professional": {"combat": 0.15, "crafting": 0.25, "commerce": 0.35, "nature": 0.15, "healing": 0.10},
    "parent_caregiver":   {"combat": 0.05, "crafting": 0.05, "commerce": 0.20, "nature": 0.30, "healing": 0.40},
    "senior_worker":      {"combat": 0.15, "crafting": 0.35, "commerce": 0.05, "nature": 0.25, "healing": 0.20},
    "veteran_job_seeker": {"combat": 0.40, "crafting": 0.15, "commerce": 0.05, "nature": 0.15, "healing": 0.25},
    "employer":           {"combat": 0.05, "crafting": 0.05, "commerce": 0.70, "nature": 0.10, "healing": 0.10},
}

JOBS: dict[str, dict] = {
    "inn_helper":            {"track": "commerce", "threshold": 30, "wage": 8,  "max_slots": 2},
    "farm_hand":             {"track": "nature",   "threshold": 35, "wage": 9,  "max_slots": 1},
    "guard_apprentice":      {"track": "combat",   "threshold": 40, "wage": 12, "max_slots": 1},
    "hunter_apprentice":     {"track": "nature",   "threshold": 40, "wage": 11, "max_slots": 2},
    "scout_courier":         {"track": "combat",   "threshold": 45, "wage": 14, "max_slots": 2},
    "merchant_assistant":    {"track": "commerce", "threshold": 45, "wage": 16, "max_slots": 1},
    "apprentice_blacksmith": {"track": "crafting", "threshold": 50, "wage": 15, "max_slots": 1},
    "herbalist_apprentice":  {"track": "healing",  "threshold": 45, "wage": 13, "max_slots": 1},
}

# Maps employer_id → which job they post
EMPLOYER_JOB: dict[str, str] = {
    "innkeeper":  "inn_helper",
    "blacksmith": "apprentice_blacksmith",
    "hunter_1":   "hunter_apprentice",
    "hunter_2":   "farm_hand",
    "merchant_1": "scout_courier",
    "merchant_2": "merchant_assistant",
    "guard_1":    "guard_apprentice",
    # guard_2: no posting
    "herbalist":  "herbalist_apprentice",  # NPC trainer
}

EMPLOYER_CONFIGS: list[dict] = [
    {"id": "innkeeper",  "role": "innkeeper",  "max_apprentices": 2, "home": (11800, 7600), "work": GR_HUB},
    {"id": "blacksmith", "role": "blacksmith", "max_apprentices": 1, "home": (12400, 7800), "work": (12600, 7600)},
    {"id": "hunter_1",   "role": "hunter",     "max_apprentices": 2, "home": (14200, 9800), "work": (14500, 9500)},
    {"id": "hunter_2",   "role": "hunter",     "max_apprentices": 1, "home": (15000, 7200), "work": (14500, 9500)},
    {"id": "merchant_1", "role": "merchant",   "max_apprentices": 2, "home": (11600, 8600), "work": GR_HUB},
    {"id": "merchant_2", "role": "merchant",   "max_apprentices": 1, "home": (12600, 8400), "work": GR_HUB},
    {"id": "guard_1",    "role": "guard",      "max_apprentices": 1, "home": (11400, 7200), "work": (14000, 6500)},
    {"id": "guard_2",    "role": "guard",      "max_apprentices": 0, "home": (12800, 7800), "work": (14000, 6500)},
    {"id": "herbalist",  "role": "herbalist",  "max_apprentices": 1, "home": (9500, 10000), "work": (10000, 9500)},
]

# Simplified posting rules: (min_week, status_condition, min_count)
# Condition: m.count_by_status(statuses) >= min_count (and week >= min_week)
# Calibrated against observed simulation population curves (weeks 1-16, 42 seekers).
POSTING_RULES: dict[str, tuple[int, list[str], int]] = {
    "innkeeper":  (1, ["aware", "training", "trained", "employed"], 10),
    "hunter_2":   (2, ["training", "trained", "employed"],          8),
    "guard_1":    (3, ["training", "trained", "employed"],          10),
    "hunter_1":   (3, ["trained", "employed"],                      4),
    "merchant_1": (4, ["trained", "employed"],                      6),
    "blacksmith": (5, ["trained", "employed"],                      10),
    "merchant_2": (6, ["trained", "employed"],                      14),
    "herbalist":  (7, ["trained", "employed"],                      18),
    # guard_2: no posting (max_apprentices=0)
}

SEEKER_ARCHETYPES: list[tuple[str, int]] = [
    ("student", 8),
    ("young_professional", 8),
    ("parent_caregiver", 8),
    ("senior_worker", 8),
    ("veteran_job_seeker", 6),
    ("employer", 4),
]

# Economics: weekly expenses cover shelter + basic food. Daily meals are
# "standard rations" drawn from the weekly budget — no per-meal cash charge.
# Agents who afford premium Inn meals get an energy bonus.
WEEKLY_EXPENSES_NORMAL = 10.0   # shelter + basic rations
WEEKLY_EXPENSES_SURVIVAL = 5.0  # community shelter, reduced
SURVIVAL_MODE_INCOME = (6.0, 9.0)
TRAINING_COST_PER_SESSION = 0.0  # training at community level is free; skill is the currency
DAYS_BROKE_SURVIVAL_THRESHOLD = 21

TRACK_GAIN_RANGE: dict[str, tuple[float, float]] = {
    "combat":   (8.0, 12.0),
    "crafting": (6.0, 10.0),
    "commerce": (8.0, 12.0),
    "nature":   (7.0, 11.0),
    "healing":  (5.0, 9.0),
}

TRACK_SESSION_CAPACITY = 6  # max students per track per week


# ─── HELPERS ─────────────────────────────────────────────────────────────────

def _commute(home: tuple[int, int], dest: tuple[int, int]) -> float:
    dx, dy = home[0] - dest[0], home[1] - dest[1]
    return math.sqrt(dx * dx + dy * dy) / 1500.0

def _rand_pos(bounds: tuple[tuple[int, int], tuple[int, int]], rng: random.Random) -> tuple[int, int]:
    (x0, y0), (x1, y1) = bounds
    return (rng.randint(x0, x1), rng.randint(y0, y1))

def _assign_track(archetype: str, rng: random.Random) -> str:
    w = ARCHETYPE_TRACK_WEIGHTS[archetype]
    return rng.choices(list(w.keys()), weights=list(w.values()))[0]

def _assign_neighborhood(archetype: str, rng: random.Random) -> str:
    weights = {
        "student":            {"north_quarter": 0.30, "east_side": 0.25, "south_market": 0.20, "west_hollow": 0.15, "outer_reach": 0.10},
        "young_professional": {"north_quarter": 0.25, "east_side": 0.35, "south_market": 0.20, "west_hollow": 0.15, "outer_reach": 0.05},
        "parent_caregiver":   {"north_quarter": 0.15, "east_side": 0.15, "south_market": 0.30, "west_hollow": 0.25, "outer_reach": 0.15},
        "senior_worker":      {"north_quarter": 0.20, "east_side": 0.15, "south_market": 0.20, "west_hollow": 0.30, "outer_reach": 0.15},
        "veteran_job_seeker": {"north_quarter": 0.20, "east_side": 0.20, "south_market": 0.20, "west_hollow": 0.15, "outer_reach": 0.25},
        "employer":           {"north_quarter": 0.35, "east_side": 0.30, "south_market": 0.20, "west_hollow": 0.10, "outer_reach": 0.05},
    }
    w = weights[archetype]
    return rng.choices(list(w.keys()), weights=list(w.values()))[0]

def _starting_money(archetype: str, rng: random.Random) -> float:
    # Starting money represents savings. WEEKLY_EXPENSES_NORMAL = 10, so:
    # 6–8 weeks runway for well-off archetypes; 3–5 for low-income ones.
    ranges = {
        "student":            (35, 55),
        "young_professional": (70, 100),
        "parent_caregiver":   (50, 75),
        "senior_worker":      (65, 90),
        "veteran_job_seeker": (40, 65),
        "employer":           (90, 130),
    }
    lo, hi = ranges[archetype]
    return rng.uniform(lo, hi)

def _starting_social_capital(archetype: str, rng: random.Random) -> float:
    ranges = {
        "student":            (0, 10),
        "young_professional": (5, 20),
        "parent_caregiver":   (5, 15),
        "senior_worker":      (10, 25),
        "veteran_job_seeker": (20, 35),
        "employer":           (15, 30),
    }
    lo, hi = ranges[archetype]
    return rng.uniform(lo, hi)


# ─── EMPLOYED WORKER ─────────────────────────────────────────────────────────

class EmployedWorkerAgent(mesa.Agent):
    def __init__(self, model: "EastbrookModel", config: dict) -> None:
        super().__init__(model)
        self.worker_id: str = config["id"]
        self.role: str = config["role"]
        self.home: tuple[int, int] = config["home"]
        self.work: tuple[int, int] = config["work"]
        self.max_apprentices: int = config["max_apprentices"]
        self.job_posted: bool = False
        self.apprentice_ids: list[str] = []
        self.referral_used: bool = False  # each employer can do one informal referral

        # For CSV snapshot
        self.archetype = "employer"
        self.neighborhood = "north_quarter"
        self.skill_track = "commerce"
        self.status = "employed"
        self.energy = 80.0
        self.money = 50.0
        self.stress = 15.0
        self.skill_level = 65.0
        self.social_capital = 40.0
        self.money_pressure = 0.0
        self.days_broke = 0
        self.in_survival_mode = False
        self.training_sessions_completed = 0
        self.applications_submitted = 0
        self.applications_rejected = 0
        self.mentor_id: Optional[str] = None
        self.event_this_week: Optional[str] = None
        self.job_type: Optional[str] = None
        self.wage = 20.0

    def week_update(self) -> None:
        m: EastbrookModel = self.model
        self.event_this_week = None

        job_id = EMPLOYER_JOB.get(self.worker_id)
        rule = POSTING_RULES.get(self.worker_id)
        if job_id is None or rule is None:
            return

        min_week, statuses, min_count = rule
        week = m.day // 7
        condition_met = (week >= min_week) and (m.count_by_status(statuses) >= min_count)

        slots_available = len(self.apprentice_ids) < self.max_apprentices

        if condition_met and slots_available and not self.job_posted:
            self.job_posted = True
            m.open_job_postings[self.worker_id] = job_id
            self.event_this_week = "job_opened"
        elif condition_met and slots_available and self.job_posted:
            # Keep posting active (second slot re-opened after first hire)
            m.open_job_postings[self.worker_id] = job_id
        elif not slots_available and self.worker_id in m.open_job_postings:
            # All slots filled — remove posting so agents stop applying
            m.open_job_postings.pop(self.worker_id, None)
        elif not condition_met and self.job_posted and not self.apprentice_ids:
            self.job_posted = False
            m.open_job_postings.pop(self.worker_id, None)

    def step(self) -> None:
        pass  # week_update() called explicitly


# ─── JOB SEEKER ──────────────────────────────────────────────────────────────

class JobSeekerAgent(mesa.Agent):
    def __init__(self, model: "EastbrookModel", agent_id: str, archetype: str,
                 neighborhood: str, home: tuple[int, int]) -> None:
        super().__init__(model)
        self.agent_id = agent_id
        self.archetype = archetype
        self.neighborhood = neighborhood
        self.home = home
        self.skill_track = _assign_track(archetype, model.rng)

        # Core attributes
        self.status = "unaware"
        self.energy: float = model.rng.uniform(65, 95)
        self.money: float = _starting_money(archetype, model.rng)
        self.stress: float = model.rng.uniform(5, 30)
        self.skill_level: float = 0.0
        self.social_capital: float = _starting_social_capital(archetype, model.rng)

        # Archetype adjustments
        if archetype == "veteran_job_seeker":
            self.stress = model.rng.uniform(20, 45)
        if archetype == "student":
            self.energy = model.rng.uniform(80, 95)

        # 20% of seekers start aware
        if model.rng.random() < 0.20:
            self.status = "aware"

        # Tracking
        self.days_broke = 0
        self.in_survival_mode = False
        self.training_sessions_completed = 0
        self.applications_submitted = 0
        self.applications_rejected = 0
        self.mentor_id: Optional[str] = None
        self.event_this_week: Optional[str] = None
        self.job_type: Optional[str] = None
        self.wage: float = 0.0
        self.burnout_days_remaining = 0

        # Weekly tracking
        self.visited_hub_this_week = False
        self.training_days_this_week = 0
        self.work_days_this_week = 0
        self.daily_activities: list[tuple[int, str]] = []  # (day_of_week, activity)

    # ── Commute helpers ────────────────────────────────────────────────

    @property
    def commute_to_hub(self) -> float:
        return _commute(self.home, GR_HUB)

    @property
    def commute_to_training(self) -> float:
        return _commute(self.home, TRACK_LOCATIONS[self.skill_track])

    @property
    def commute_to_work(self) -> float:
        if self.status != "employed" or not self.job_type:
            return self.commute_to_hub
        # Find employer work location
        for c in EMPLOYER_CONFIGS:
            if EMPLOYER_JOB.get(c["id"]) == self.job_type:
                return _commute(self.home, c["work"])
        return self.commute_to_hub

    # ── Daily step ─────────────────────────────────────────────────────

    def step(self) -> None:
        m: EastbrookModel = self.model
        day_of_week = m.day % 7  # 0=Mon … 6=Sun
        is_weekday = day_of_week < 5

        self.event_this_week = None  # reset each day (week-end logic overwrites)

        if self.status == "dropout":
            self._record_activity(day_of_week, "rest")
            return

        # Burnout episode: skip activities for 1-2 days
        if self.burnout_days_remaining > 0:
            self.burnout_days_remaining -= 1
            self._record_activity(day_of_week, "rest")
            self._night_recovery()
            return

        if self.status == "employed":
            if is_weekday:
                self._do_work(day_of_week)
            else:
                self._do_social(day_of_week)

        elif self.status in ("trained",):
            if is_weekday:
                self._do_job_search(day_of_week)
            else:
                self._do_social(day_of_week)

        elif self.status == "training":
            if self.energy < 20:
                self._do_rest(day_of_week)
            elif is_weekday:
                self._do_training(day_of_week)
            else:
                self._do_social(day_of_week)

        elif self.status == "aware":
            if self.energy < 20:
                self._do_rest(day_of_week)
            elif is_weekday and m.rng.random() < 0.65:
                self._do_hub_visit(day_of_week)
            else:
                self._do_rest(day_of_week)

        else:  # unaware
            if is_weekday and m.rng.random() < 0.30:
                self._do_hub_visit(day_of_week)
            else:
                self._do_rest(day_of_week)

        # Meals
        self._eat_meals()

        # Night sleep
        self._night_recovery()

    # ── Activity implementations ───────────────────────────────────────

    def _do_work(self, day: int) -> None:
        self.energy -= 20.0
        self.energy -= self.commute_to_work * 5.0
        self.stress = max(0.0, self.stress - 3.0)
        self.work_days_this_week += 1
        self._record_activity(day, "work")

    def _do_training(self, day: int) -> None:
        self.energy -= 25.0
        self.energy -= self.commute_to_training * 5.0

        # Check for parent/caregiver afternoon constraint
        # (they train morning only; still counts as training)
        if self.archetype == "parent_caregiver" and self.commute_to_training > 1.5:
            # Too far, skip today
            self._do_rest(day)
            return

        # Stress from long commute
        if self.commute_to_training > 1.0:
            self.stress = min(100.0, self.stress + 5.0)

        m: EastbrookModel = self.model
        # Check session capacity (rough: if > 6 training in track today, 30% miss session)
        track_training = m.count_training_in_track(self.skill_track)
        if track_training > TRACK_SESSION_CAPACITY and m.rng.random() < 0.30:
            self._record_activity(day, "rest")
            return

        # Gain skill
        has_mentor = self._check_mentor_available()
        gain = self._calc_skill_gain(has_mentor)
        self.skill_level = min(100.0, self.skill_level + gain)
        self.training_sessions_completed += 1
        self.training_days_this_week += 1
        self.stress = max(0.0, self.stress - 5.0)  # successful session

        if has_mentor:
            self.social_capital = min(100.0, self.social_capital + 2.0)
            self.stress = max(0.0, self.stress - 12.0)

        # Blacksmith energy gift
        if self.skill_track == "crafting" and m.rng.random() < 0.25:
            self.energy = min(100.0, self.energy + 10.0)

        self._record_activity(day, "training")

    def _do_job_search(self, day: int) -> None:
        self.energy -= 12.0
        self.energy -= self.commute_to_hub * 5.0
        self.visited_hub_this_week = True
        # Modest SC gain — job hunting builds contacts but slowly
        m: EastbrookModel = self.model
        if m.rng.random() < 0.25:
            self.social_capital = min(100.0, self.social_capital + 1.0)
        self._record_activity(day, "job_search")

    def _do_hub_visit(self, day: int) -> None:
        self.energy -= 10.0
        self.energy -= self.commute_to_hub * 5.0
        self.visited_hub_this_week = True
        m: EastbrookModel = self.model
        # SC from hub contact with employed workers — modest, not guaranteed
        if m.rng.random() < 0.30:
            self.social_capital = min(100.0, self.social_capital + 2.0)
        self._record_activity(day, "social")

    def _do_social(self, day: int) -> None:
        self.energy -= 5.0
        if self.commute_to_hub < 0.5 and self.energy > 30.0:
            self.energy -= self.commute_to_hub * 3.0
            self.social_capital = min(100.0, self.social_capital + 1.0)
        self._record_activity(day, "social")

    def _do_rest(self, day: int) -> None:
        self.energy = min(100.0, self.energy + 15.0)
        self.stress = max(0.0, self.stress - 3.0)
        self._record_activity(day, "rest")

    def _eat_meals(self) -> None:
        # Basic rations covered by weekly expenses; agents always get something.
        # Money >= 0: proper meals from Inn (+energy bonus). Money < 0: minimal rations.
        if self.money >= 0:
            self.energy = min(100.0, self.energy + 10.0)  # proper meals
        else:
            # Hunger from poverty: partial nutrition, mild stress
            self.energy = min(100.0, self.energy + 4.0)
            self.stress = min(100.0, self.stress + 3.0)

    def _night_recovery(self) -> None:
        sleep_quality = max(0.3, 1.0 - self.stress / 120.0)
        self.energy = min(100.0, self.energy + 18.0 * sleep_quality)
        self.energy = max(0.0, self.energy)
        self.stress = max(0.0, self.stress - 8.0 * sleep_quality)  # good sleep reduces stress

    def _check_mentor_available(self) -> bool:
        m: EastbrookModel = self.model
        for emp in m.employed_workers.values():
            if self.social_capital < 40.0:
                continue
            # Check if employer can mentor this track
            track_match = {
                "innkeeper": "commerce",
                "blacksmith": "crafting",
                "hunter_1": "nature",
                "hunter_2": "nature",
                "merchant_1": "combat",
                "merchant_2": "commerce",
                "guard_1": "combat",
                "guard_2": "combat",
            }
            if track_match.get(emp.worker_id) == self.skill_track:
                return m.rng.random() < 0.35
        return False

    def _calc_skill_gain(self, has_mentor: bool) -> float:
        lo, hi = TRACK_GAIN_RANGE[self.skill_track]
        m: EastbrookModel = self.model

        if self.archetype == "senior_worker":
            base = (lo + hi) / 2.0  # steady, low variance
        else:
            base = m.rng.uniform(lo, hi)

        if self.archetype == "student":
            base *= 1.2

        energy_mod = 0.5 + (self.energy / 100.0) * 0.5
        stress_mod = max(0.3, 1.0 - self.stress / 200.0)

        if has_mentor:
            mentor_mult = 2.5 if self.skill_track != "healing" else 3.0
        else:
            mentor_mult = 1.0

        # Nature early-riser bonus
        nature_bonus = 3.0 if (self.skill_track == "nature" and m.rng.random() < 0.5) else 0.0

        # Healing passive social capital gain (slower — healing is rare, valued)
        if self.skill_track == "healing" and m.rng.random() < 0.25:
            self.social_capital = min(100.0, self.social_capital + 1.5)

        return max(0.0, base * energy_mod * stress_mod * mentor_mult + nature_bonus)

    def _record_activity(self, day: int, activity: str) -> None:
        self.daily_activities.append((day, activity))

    # ── Weekly logic (called by model at week end) ─────────────────────

    def week_start(self) -> None:
        self.visited_hub_this_week = False
        self.training_days_this_week = 0
        self.work_days_this_week = 0
        self.daily_activities.clear()
        self.event_this_week = None

    def week_end(self) -> None:
        m: EastbrookModel = self.model

        # Income
        if self.status == "employed":
            self.money += self.wage
        elif self.in_survival_mode:
            self.money += m.rng.uniform(*SURVIVAL_MODE_INCOME)

        # Expenses (reduced in survival mode — community provides basics)
        expenses = WEEKLY_EXPENSES_SURVIVAL if self.in_survival_mode else WEEKLY_EXPENSES_NORMAL
        self.money -= expenses

        # Track broke status
        if self.money < 0:
            self.days_broke += 7
        else:
            self.days_broke = max(0, self.days_broke - 3)

        if self.days_broke >= DAYS_BROKE_SURVIVAL_THRESHOLD:
            self.in_survival_mode = True
            if self.status == "training":
                self.status = "aware"  # dropped out of training
        elif self.money > 15:
            self.in_survival_mode = False

        # Weekly stress from poverty (reduced: financial stress builds slowly)
        if self.money < 0:
            self.stress = min(100.0, self.stress + 5.0)

        # Threat affects guards / stress from danger zones
        if self.commute_to_training > 1.0 and m.threat_level > 1.5:
            self.stress = min(100.0, self.stress + 5.0)

        # Dropout check
        if self.stress >= 95.0 and self.status not in ("employed", "dropout"):
            self.status = "dropout"
            self.event_this_week = "dropout"
            return

        # Burnout check
        if self.stress >= 80.0 and self.status != "dropout":
            self.burnout_days_remaining = m.rng.randint(1, 2)

        # Threat level: seekers traveling raises it slightly
        if self.status in ("training", "trained"):
            m.threat_level = min(3.0, m.threat_level + 0.02)

        # State transitions
        self._check_transitions()

        # Money pressure
        self.money_pressure = max(0.0, min(1.0, (-self.money / 50.0) + (self.stress / 300.0)))

    def _check_transitions(self) -> None:
        m: EastbrookModel = self.model

        if self.status == "dropout":
            return

        if self.status == "unaware":
            hub_p = 0.15 + self.social_capital * 0.003 if self.visited_hub_this_week else 0.0
            gossip_n = m.count_by_status(["aware", "training", "trained", "employed"])
            gossip_p = 0.08 * gossip_n / max(1, 42) * (1.5 if self.social_capital > 20 else 1.0)
            if m.rng.random() < max(hub_p, gossip_p):
                self.status = "aware"
                self.event_this_week = "became_aware"

        elif self.status == "aware":
            if not self.in_survival_mode and self.energy > 40.0 and self.money >= 0:
                track_count = m.count_training_in_track(self.skill_track)
                if track_count < TRACK_SESSION_CAPACITY and m.rng.random() < 0.55:
                    self.status = "training"
                    self.event_this_week = "enrolled_training"

        elif self.status == "training":
            # Check if we've crossed any job threshold for our track
            reachable = [j for j, s in JOBS.items() if s["track"] == self.skill_track]
            if not reachable:
                return
            min_thresh = min(JOBS[j]["threshold"] for j in reachable)
            if self.skill_level >= min_thresh and self.training_sessions_completed >= 4:
                self.status = "trained"
                self.event_this_week = "skill_threshold_reached"

        elif self.status == "trained":
            available = self._find_open_jobs()

            # Referral path: high SC agents can get informally placed even without a posting
            if not available and self.social_capital > 42.0 and m.rng.random() < 0.25:
                self._try_referral_hire(m)
                return

            if not available:
                return

            self.applications_submitted += 1
            employer_id, job_id, spec = m.rng.choice(available)

            # Fast-track via social capital (open slot still required)
            if self.social_capital > 50.0 and m.rng.random() < 0.30:
                hire_p = 0.75
                event = "hired_via_referral"
            else:
                hire_p = min(0.9, 0.4 + self.skill_level / 200.0 + self.social_capital / 300.0)
                event = "hired"

            if m.rng.random() < hire_p:
                self.status = "employed"
                self.event_this_week = event
                self.job_type = job_id
                self.wage = spec["wage"]
                emp = m.employed_workers.get(employer_id)
                if emp:
                    emp.apprentice_ids.append(self.agent_id)
                    self.mentor_id = employer_id
                self.stress = max(0.0, self.stress - 40.0)
                self.social_capital = min(100.0, self.social_capital + 10.0)
            else:
                self.applications_rejected += 1
                self.stress = min(100.0, self.stress + 20.0)
                self.event_this_week = "application_rejected"

    def _try_referral_hire(self, m: "EastbrookModel") -> None:
        """Informal hire — employer creates a side arrangement for high-SC agent."""
        matching_employers = [
            (emp_id, emp) for emp_id, emp in m.employed_workers.items()
            if not emp.referral_used
            and EMPLOYER_JOB.get(emp_id) is not None
            and JOBS[EMPLOYER_JOB[emp_id]]["track"] == self.skill_track
            and self.skill_level >= JOBS[EMPLOYER_JOB[emp_id]]["threshold"] * 0.85
        ]
        if not matching_employers:
            return
        emp_id, emp = m.rng.choice(matching_employers)
        job_id = EMPLOYER_JOB[emp_id]
        spec = JOBS[job_id]
        self.applications_submitted += 1
        if m.rng.random() < 0.70:
            self.status = "employed"
            self.event_this_week = "hired_via_referral"
            self.job_type = job_id
            self.wage = spec["wage"]
            emp.apprentice_ids.append(self.agent_id)
            emp.referral_used = True
            self.mentor_id = emp_id
            self.stress = max(0.0, self.stress - 40.0)
            self.social_capital = min(100.0, self.social_capital + 12.0)
        else:
            self.applications_rejected += 1
            self.stress = min(100.0, self.stress + 10.0)

    def _find_open_jobs(self) -> list[tuple[str, str, dict]]:
        m: EastbrookModel = self.model
        result = []
        for employer_id, job_id in m.open_job_postings.items():
            spec = JOBS[job_id]
            if spec["track"] != self.skill_track:
                continue
            if self.skill_level < spec["threshold"]:
                continue
            emp = m.employed_workers.get(employer_id)
            if emp and len(emp.apprentice_ids) >= emp.max_apprentices:
                continue
            result.append((employer_id, job_id, spec))
        return result

    # ── Schedule JSON for CSV output ───────────────────────────────────

    def build_schedule(self) -> list[dict]:
        entries: list[dict] = []
        track_loc = TRACK_LOCATIONS[self.skill_track]

        # Determine work location
        work_loc = GR_HUB
        if self.job_type:
            for c in EMPLOYER_CONFIGS:
                if EMPLOYER_JOB.get(c["id"]) == self.job_type:
                    work_loc = c["work"]
                    break

        def sleep(day: int, until: float = 6.5) -> dict:
            return {"day": day, "kind": "sleep", "start": 0.0, "end": until, "at_home": True}

        def at_home(day: int, kind: str, start: float, end: float) -> dict:
            return {"day": day, "kind": kind, "start": start, "end": end, "at_home": True}

        def away(day: int, kind: str, start: float, end: float,
                 dest: tuple[int, int], commute: float) -> dict:
            return {
                "day": day, "kind": kind,
                "start": round(start, 2), "end": round(end, 2),
                "at_home": False,
                "destination_x": dest[0], "destination_y": dest[1],
                "commute_hours": round(commute, 3),
            }

        for day in range(7):
            is_weekday = day < 5

            if self.status == "employed":
                entries.append(sleep(day, 6.0))
                if is_weekday:
                    entries.append(away(day, "work", 7.5, 17.0, work_loc, self.commute_to_work))
                    entries.append(at_home(day, "rest", 18.0, 22.0))
                else:
                    entries.append(away(day, "social", 10.0, 13.0, GR_HUB, self.commute_to_hub))

            elif self.status == "training":
                entries.append(sleep(day))
                if is_weekday:
                    if self.energy < 20.0:
                        entries.append(at_home(day, "rest", 7.0, 20.0))
                    else:
                        end_hr = 11.5 if self.archetype == "parent_caregiver" else 13.0
                        entries.append(away(day, "training", 7.5, end_hr, track_loc, self.commute_to_training))
                        entries.append(away(day, "social", 14.0, 16.0, GR_HUB, self.commute_to_hub))
                        entries.append(at_home(day, "rest", 17.5, 22.0))
                else:
                    entries.append(away(day, "social", 10.0, 13.0, GR_HUB, self.commute_to_hub))

            elif self.status == "trained":
                entries.append(sleep(day))
                if is_weekday:
                    entries.append(away(day, "job_search", 8.0, 16.0, GR_HUB, self.commute_to_hub))
                    entries.append(at_home(day, "rest", 17.5, 22.0))
                else:
                    entries.append(away(day, "social", 10.0, 13.0, GR_HUB, self.commute_to_hub))

            elif self.status == "aware":
                entries.append(sleep(day))
                if is_weekday:
                    entries.append(away(day, "social", 9.0, 14.0, GR_HUB, self.commute_to_hub))
                    entries.append(at_home(day, "rest", 16.0, 22.0))
                else:
                    entries.append(at_home(day, "rest", 7.0, 22.0))

            else:  # unaware or dropout
                entries.append(sleep(day, 8.0))
                entries.append(at_home(day, "rest", 8.0, 20.0))

        return sorted(entries, key=lambda e: (e["day"], e["start"]))


# ─── EASTBROOK MODEL ─────────────────────────────────────────────────────────

class EastbrookModel(mesa.Model):
    def __init__(self, seed: int = 20061) -> None:
        super().__init__(seed=seed)
        self.rng = random.Random(seed)
        self.day = 0  # 0-indexed day counter (7 days/week)

        # Model-level state
        self.open_job_postings: dict[str, str] = {}       # employer_id → job_id
        self.weekly_hub_visit_count = 0
        self.threat_level = 1.0

        # Weekly snapshots for CSV export
        self.weekly_snapshots: list[dict] = []

        # Agent registries
        self.employed_workers: dict[str, EmployedWorkerAgent] = {}
        self.seekers: list[JobSeekerAgent] = []
        self.seekers_by_id: dict[str, JobSeekerAgent] = {}

        self._create_employed_workers()
        self._create_seekers()

    def _create_employed_workers(self) -> None:
        for cfg in EMPLOYER_CONFIGS:
            w = EmployedWorkerAgent(self, cfg)
            self.employed_workers[cfg["id"]] = w

    def _create_seekers(self) -> None:
        idx = 1
        neighborhoods = list(NEIGHBORHOODS.keys())
        for archetype, count in SEEKER_ARCHETYPES:
            for _ in range(count):
                neighborhood = _assign_neighborhood(archetype, self.rng)
                home = _rand_pos(NEIGHBORHOODS[neighborhood], self.rng)
                agent_id = f"{archetype[:3]}_{idx:03d}"
                s = JobSeekerAgent(self, agent_id, archetype, neighborhood, home)
                self.seekers.append(s)
                self.seekers_by_id[agent_id] = s
                idx += 1

    # ── Query helpers ──────────────────────────────────────────────────

    def count_by_status(self, statuses: list[str]) -> int:
        return sum(1 for s in self.seekers if s.status in statuses)

    def count_training_in_track(self, track: str) -> int:
        return sum(1 for s in self.seekers if s.status == "training" and s.skill_track == track)

    # ── Main step (one day) ────────────────────────────────────────────

    def step(self) -> None:
        day_of_week = self.day % 7
        week_num = self.day // 7

        if day_of_week == 0:
            # Week start: reset weekly trackers
            self.weekly_hub_visit_count = 0
            for s in self.seekers:
                s.week_start()
            for w in self.employed_workers.values():
                w.event_this_week = None

        # Shuffle seekers and run daily step
        seekers_shuffled = self.seekers.copy()
        self.rng.shuffle(seekers_shuffled)
        for s in seekers_shuffled:
            s.step()

        # Track hub visitors this day
        hub_today = sum(1 for s in self.seekers if s.visited_hub_this_week)
        self.weekly_hub_visit_count = hub_today

        # Gossip spread (once per day)
        self._spread_gossip()

        # End of week processing
        if day_of_week == 6:
            self._week_end(week_num)

        self.day += 1

    def _spread_gossip(self) -> None:
        informed = [s for s in self.seekers if s.status in ("aware", "training", "trained", "employed")]
        targets = [s for s in self.seekers if s.status == "unaware"]
        if not informed or not targets:
            return
        p = 0.12 * len(informed) / max(1, len(self.seekers))
        for t in targets:
            if self.rng.random() < p:
                t.status = "aware"
                t.event_this_week = "became_aware_via_gossip"

    def _week_end(self, week_num: int) -> None:
        # Update employer job postings
        for w in self.employed_workers.values():
            w.week_update()

        # Threat level gradually decays (training agents bump it up in week_end)
        self.threat_level = max(1.0, self.threat_level * 0.95)

        # Agent weekly end processing (money, transitions)
        for s in self.seekers:
            s.week_end()

        # Snapshot all agents
        self._take_snapshot(week_num)

    def _take_snapshot(self, week: int) -> None:
        # Employed workers
        for w in self.employed_workers.values():
            commute = _commute(w.home, w.work)
            dest = w.work

            schedule = []
            for day in range(7):
                is_weekday = day < 5
                schedule.append({"day": day, "kind": "sleep", "start": 0.0, "end": 6.0, "at_home": True})
                if is_weekday:
                    schedule.append({
                        "day": day, "kind": "work",
                        "start": 7.0, "end": 17.0, "at_home": False,
                        "destination_x": w.work[0], "destination_y": w.work[1],
                        "commute_hours": round(commute, 3),
                    })

            row = {
                "week": week,
                "agent_id": w.worker_id,
                "status": w.status,
                "archetype": w.archetype,
                "skill_track": w.skill_track,
                "neighborhood": w.neighborhood,
                "home_x": w.home[0],
                "home_y": w.home[1],
                "dest_x": dest[0],
                "dest_y": dest[1],
                "energy": round(w.energy, 2),
                "money": round(w.money, 2),
                "stress": round(w.stress, 2),
                "skill_level": round(w.skill_level, 2),
                "social_capital": round(w.social_capital, 2),
                "money_pressure": round(w.money_pressure, 3),
                "days_broke": w.days_broke,
                "in_survival_mode": w.in_survival_mode,
                "training_sessions_completed": w.training_sessions_completed,
                "applications_submitted": w.applications_submitted,
                "applications_rejected": w.applications_rejected,
                "mentor_id": w.mentor_id or "",
                "event_this_week": w.event_this_week or "",
                "schedule_json": json.dumps(schedule, separators=(",", ":")),
            }
            self.weekly_snapshots.append(row)

        # Job seekers
        for s in self.seekers:
            dest = TRACK_LOCATIONS.get(s.skill_track, GR_HUB)
            if s.status == "employed" and s.job_type:
                for c in EMPLOYER_CONFIGS:
                    if EMPLOYER_JOB.get(c["id"]) == s.job_type:
                        dest = c["work"]
                        break

            row = {
                "week": week,
                "agent_id": s.agent_id,
                "status": s.status,
                "archetype": s.archetype,
                "skill_track": s.skill_track,
                "neighborhood": s.neighborhood,
                "home_x": s.home[0],
                "home_y": s.home[1],
                "dest_x": dest[0],
                "dest_y": dest[1],
                "energy": round(s.energy, 2),
                "money": round(s.money, 2),
                "stress": round(s.stress, 2),
                "skill_level": round(s.skill_level, 2),
                "social_capital": round(s.social_capital, 2),
                "money_pressure": round(s.money_pressure, 3),
                "days_broke": s.days_broke,
                "in_survival_mode": s.in_survival_mode,
                "training_sessions_completed": s.training_sessions_completed,
                "applications_submitted": s.applications_submitted,
                "applications_rejected": s.applications_rejected,
                "mentor_id": s.mentor_id or "",
                "event_this_week": s.event_this_week or "",
                "schedule_json": json.dumps(s.build_schedule(), separators=(",", ":")),
            }
            self.weekly_snapshots.append(row)


# ─── CSV EXPORT ───────────────────────────────────────────────────────────────

CSV_FIELDS = [
    "week", "agent_id", "status", "archetype", "skill_track", "neighborhood",
    "home_x", "home_y", "dest_x", "dest_y",
    "energy", "money", "stress", "skill_level", "social_capital",
    "money_pressure", "days_broke", "in_survival_mode",
    "training_sessions_completed", "applications_submitted", "applications_rejected",
    "mentor_id", "event_this_week", "schedule_json",
]


def run_experiment(seed: int = 20061, weeks: int = 16) -> list[dict]:
    model = EastbrookModel(seed=seed)
    total_days = weeks * 7
    for day in range(total_days):
        model.step()
    return model.weekly_snapshots


def write_csv(snapshots: list[dict], path: str) -> None:
    import csv as csv_mod
    from pathlib import Path
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", newline="", encoding="utf-8") as f:
        writer = csv_mod.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(snapshots)
    print(f"Wrote {len(snapshots)} rows → {p}")
