# Dynamic Economy — Job Opening Logic

Jobs are not scheduled. They emerge from real demand pressure on employed workers.

---

## Core Mechanic

Every employed worker tracks a `workload` float (0.0–1.0+). Each Mesa step (1 hour), demand events are accumulated. When weekly average workload crosses the `hire_threshold`, a job posting is created on the Hub noticeboard (an in-model object that agents can read).

```python
class EmployedWorker(Agent):
    workload: float = 0.0          # 0.0 = idle, 1.0 = at capacity, 1.0+ = overloaded
    hire_threshold: float          # set per worker type
    current_apprentice_ids: list   # agents currently working with them
    max_apprentices: int           # hard limit on concurrent hires
    job_posted: bool = False       # whether a posting is currently active

    def step(self):
        self.update_workload()
        if self.workload > self.hire_threshold and not self.job_posted:
            if len(self.current_apprentice_ids) < self.max_apprentices:
                self.post_job()
        elif self.workload < self.hire_threshold * 0.55 and self.job_posted:
            self.close_job()  # demand fell off — position no longer needed
```

---

## Workload Models Per Worker

### Innkeeper

```python
def update_workload(self):
    daily_visitors = count_hub_visitors_today()  # agents who visited Inn
    active_seekers_in_town = count_agents_in_status(["aware", "training", "trained"])
    
    # Visitors create direct demand (serving food, answering questions)
    # Seekers create ambient demand (noise, questions, odd requests)
    demand = daily_visitors * 1.5 + active_seekers_in_town * 0.3
    self.workload = demand / 60.0  # solo capacity = 60 demand units/week
```

| Scenario | Estimated workload |
|---|---|
| 10 seekers in town, 5 daily visitors | 0.42 — no posting |
| 20 seekers, 12 daily visitors | 0.72 — approaching threshold |
| 30 seekers, 20 daily visitors | **0.85 — opens Inn Helper** |
| After Inn Helper hired (skill 30, covers 40%) | drops to 0.51 |

Inn Helper opens slots: up to 2. Innkeeper is the most likely first employer.

---

### Blacksmith

```python
def update_workload(self):
    tool_orders = sum(1 for w in employed_workers if w.tool_request_this_week)
    training_equipment = count_agents_in_status(["training"]) * 0.4  # trainees dull/break equipment
    repair_requests = count_tool_repairs_needed()
    
    demand = tool_orders * 3 + training_equipment + repair_requests * 2
    self.workload = demand / 40.0  # solo capacity = 40 units/week
```

**Key insight:** Every training agent generates 0.4 units of equipment demand per week (they break practice tools). With 10 people in Training status, that's 4 extra demand units. With the 7 employed workers each needing ~2 tool orders, that's 14 more. Total ~25 units → 0.625 workload. Apprentice slot opens around Week 6 when training population peaks.

Only 1 apprentice slot ever. The Blacksmith is the most competitive position.

---

### Merchant

```python
def update_workload(self):
    active_routes = self.count_active_trade_routes()  # routes open based on Hub demand
    route_difficulty = self.average_route_difficulty()  # danger zones increase this
    job_posting_admin = self.job_postings_active * 2   # posting = admin burden
    logistics = active_routes * route_difficulty
    
    demand = logistics + job_posting_admin
    self.workload = demand / 50.0
```

**Feedback loop:** More seekers in Training status → more goods consumed → more trade volume → Merchant workload rises → Scout/Courier slot opens → those hired agents reduce trade logistics burden.

Two merchants each post independently. One typically opens for Merchant Assistant (Commerce skill), the other for Scout/Courier (Combat skill). This means Combat AND Commerce agents can find work here.

---

### Guard Captain

```python
def update_workload(self):
    active_patrol_zones = len(DANGER_ZONES)  # fixed: Bandit Camp, Wolf Run, Fallen Chapel
    threat_events_this_week = count_threat_events()  # increases if no agents patrol
    current_guard_strength = 2 + len(self.current_apprentice_ids)
    
    demand = active_patrol_zones * (1 + threat_events_this_week * 0.5)
    capacity = current_guard_strength * 15  # each guard covers 15 demand units
    self.workload = demand / capacity
```

**Threat escalation:** If no agents are on patrol roads (seekers staying home due to low energy), threat events accumulate → Guard workload spikes → Guard Apprentice slot opens faster. This creates an interesting side effect: burnout episodes (agents staying home) indirectly accelerate the Guard job opening.

---

## Job Posting Object

When a worker decides to post:

```python
class JobPosting(Agent):
    employer_id:    str
    skill_track:    str       # "combat" | "crafting" | "commerce" | "nature" | "healing"
    skill_threshold: int      # minimum skill_level required
    wage_per_week:  float
    posted_at_week: int
    filled_by:      str | None = None
    closed_at_week: int | None = None

    # Location: noticeboard at Hub (coordinates: {x:0, z:0})
    # Seekers learn about it by visiting Hub OR via social gossip from Aware/Training agents
```

**Gossiping mechanism:**
```python
# Each step, Aware+ agents who know about a posting have p=0.12 chance to
# tell a nearby Unaware neighbor (within 15 world units)
def spread_job_gossip(self, neighbors):
    if self.status in ["aware", "training", "trained", "employed"]:
        for neighbor in neighbors:
            if neighbor.status == "unaware":
                if random() < 0.12:
                    neighbor.hear_about_job(self.known_postings)
```

---

## Economy Equilibrium Analysis

At Week 0 (simulation start):
- 8 employed workers, stable economy, workloads ~0.35–0.50
- 42 seekers arrive (or are already there, unaware)
- Their presence immediately raises demand at the Inn (food), Blacksmith (tools for training), Merchant (goods)

**Expected job opening timeline** (under normal conditions):

| Week | Event | Trigger |
|---|---|---|
| 1–2 | Inn visitor count rises as seekers explore Hub | 42 new people eat and ask questions |
| 2 | **Inn Helper slot opens** (1–2 slots) | Innkeeper workload crosses 0.75 |
| 3 | Farm Hand slot opens | Farmers needed to supply extra food demand |
| 4 | Guard Apprentice slot opens | Threat events rising (agents traveling more) |
| 5 | Scout/Courier opens | Merchant trade volume up from new economy activity |
| 5–6 | Hunter Apprentice opens | Food demand peaking |
| 6 | **Apprentice Blacksmith opens** | Tool demand peak from training population |
| 8 | Herbalist Apprentice opens | Stress events accumulating across population |
| 10+ | Second-order openings | First hires enable new capacity |

**If the economy is stressed** (many burnouts, low training attendance, agents avoiding Hub):
- Inn workload drops (fewer visitors) → Inn Helper slot delays or closes
- Less training → less tool demand → Blacksmith slot delays
- Effect: fewer early jobs → more stress → more burnouts → cascade failure
- Recovery: Social capital interactions eventually pull people back out

This gives the simulation its most interesting dynamics: **the outcome is sensitive to the first 3 weeks**.

---

## Wage Structure

| Job | Weekly wage | Notes |
|---|---|---|
| Inn Helper | 8 | Just above survival cost (12/week) — very tight |
| Farm Hand | 9 | Includes food subsidy (grown on-site) |
| Guard Apprentice | 12 | Danger pay |
| Hunter Apprentice | 11 | Includes food (hunted) |
| Scout/Courier | 14 | Travel allowance |
| Merchant Assistant | 16 | Highest commerce wage |
| Apprentice Blacksmith | 15 | Tool allowance |
| Herbalist Apprentice | 13 | Healing service income |

Agents in survival (weekly expenses ~12) need jobs paying ≥12 to stabilize. Inn Helper at 8 is **below survival cost** — it reduces but doesn't eliminate money pressure. Agents hired as Inn Helpers must still work toward Merchant Assistant (45) for true stability. This is intentional narrative tension.

---

## What "Employed" Actually Does

When an agent is hired:
1. `status → employed`
2. `money += wage/week` each weekly step
3. Agent's schedule shifts to: work at employer location (8am–5pm, Mon–Fri)
4. Agent still has free time: evenings, weekends → can socialize, mentor others
5. Employer `workload` drops by `(apprentice.skill_level / 100) × 0.4` each week
6. As apprentice skill grows on-the-job: `skill_level += 2/week` (slower than training but still grows)
7. If apprentice skill reaches `employed_threshold + 30`: they become a **full worker** — employer can hire another apprentice (second slot)
