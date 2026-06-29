# Skill Tracks — Specialization Design

Each agent is assigned exactly **one skill track** at spawn. Track assignment is weighted by archetype but random within those weights. Agents do not switch tracks.

---

## The Five Tracks

### 1. Combat Track

**Jobs unlocked:** Guard Apprentice (threshold 40), Scout/Courier (threshold 45)

**Training locations:**
- Primary: Training Ground (outside Hub, near Guard patrol route)
- Secondary: Open road patrol with a Guard (mentor only)

**Trainer:** Guard Captain (capacity: 6 students/session)

**Gain rate per session:** 8–12 skill points
- Modified by: energy (full energy = ×1.2), stress (>60 stress = ×0.7)
- Mentor bonus: ×2.5 per session with Guard Captain present

**Archetype affinity weights:**
```
veteran_job_seeker: 0.40
student:            0.20
young_professional: 0.15
senior_worker:      0.15
parent_caregiver:   0.05
employer:           0.05
```

**Narrative notes:** Combat-track agents have the most physical commute (training ground is far). Energy management is critical. Guards are the most willing mentors (patrol is lonely) — so social capital with Guards grows fast.

---

### 2. Crafting Track

**Jobs unlocked:** Apprentice Blacksmith (threshold 50)

**Training locations:**
- Primary: Blacksmith shop (at Hub edge)
- No remote training option — must be at the shop

**Trainer:** Blacksmith (capacity: 4 students — small shop)

**Gain rate per session:** 6–10 skill points
- Lower ceiling compensated by: Blacksmith gives tools (energy drink equivalent) to dedicated students → +10 energy gift after long sessions
- Mentor bonus: ×2.5

**Archetype affinity weights:**
```
senior_worker:      0.35
young_professional: 0.25
student:            0.20
veteran_job_seeker: 0.10
parent_caregiver:   0.05
employer:           0.05
```

**Narrative notes:** Blacksmith slot only opens ONE time (when workload > 0.80). This creates urgency — only one agent gets this job. Crafting agents who train in parallel but don't get the slot must pivot (which they can't — specialization is locked). This is where the "isolated grinder" story lives.

---

### 3. Commerce Track

**Jobs unlocked:** Inn Helper (threshold 30), Merchant Assistant (threshold 45)

**Training locations:**
- Primary: Eastbrook Inn (Hub center)
- Secondary: Merchant's trade post (varies by day)

**Trainer:** Innkeeper or Merchant (capacity: 6 students — rotating trainers)

**Gain rate per session:** 8–12 skill points
- Lowest threshold for first job (30) makes this the fastest path to ANY employment
- Inn Helper job opens earliest (Week 2) — first opportunity in the sim

**Archetype affinity weights:**
```
employer:           0.35
young_professional: 0.30
parent_caregiver:   0.20
student:            0.10
senior_worker:      0.03
veteran_job_seeker: 0.02
```

**Narrative notes:** Commerce is the "easy on-ramp." Inn Helper at threshold 30 means a Commerce agent with consistent training could be hired as early as Week 2. This creates the "fast mover" story. However, Merchant Assistant at 45 is the better-paying job — some agents will be hired at 30 and then level up in-job.

---

### 4. Nature Track

**Jobs unlocked:** Farm Hand (threshold 35), Hunter Apprentice (threshold 40)

**Training locations:**
- Primary: Farmland (outside Hub to the East)
- Secondary: Forest/Webwood (for Hunter)
- Both require commute — structural disadvantage for far-from-Hub agents

**Trainer:** Hunter (capacity: 5 students — outdoor sessions)

**Gain rate per session:** 7–11 skill points
- Bonus: `+3 skill points` if training session occurs in morning (6–10am) — "early riser" mechanic
- Agents who forage during training also receive food (−meal_cost for that day)
- Mentor bonus: ×2.0 (Hunter is a hands-off teacher — slightly lower than other tracks)

**Archetype affinity weights:**
```
parent_caregiver:   0.30
senior_worker:      0.25
student:            0.20
veteran_job_seeker: 0.15
young_professional: 0.07
employer:           0.03
```

**Narrative notes:** Nature agents often live in the outer neighborhoods (far from Hub). Long commute → energy drain → skipped sessions. The "late bloomer" story often happens here. But the food foraging bonus means a Nature agent who shows up consistently is often the least stressed of all tracks.

---

### 5. Healing Track

**Jobs unlocked:** Herbalist Apprentice (threshold 45) — opens Week 8+ only

**Training locations:**
- Primary: Webwood (distant POI)
- Requires highest commute of all tracks

**Trainer:** Herbalist NPC (not one of the 8 employed workers — a special character)

**Gain rate per session:** 5–9 skill points
- Lowest raw gain but: Healing agents can perform minor healing on neighbors → +social_capital per healing interaction (passive income while training)
- Mentor bonus: ×3.0 (Herbalist is the most intensive teacher)

**Archetype affinity weights:**
```
parent_caregiver:   0.45
student:            0.25
young_professional: 0.15
senior_worker:      0.10
veteran_job_seeker: 0.03
employer:           0.02
```

**Narrative notes:** Healing track is the longest path (job doesn't open until Week 8) but has the highest social capital payoff. Healing agents are often beloved by the time they're hired. They can prevent "dropout" events in other agents by reducing their stress. This creates an interesting dependency: if you don't have a Healing agent making progress, more agents will burn out.

---

## Track Assignment Logic

```python
def assign_skill_track(archetype: str, rng: Random) -> str:
    weights = ARCHETYPE_TRACK_WEIGHTS[archetype]  # dict of track → weight
    tracks = list(weights.keys())
    probs = list(weights.values())
    return rng.choices(tracks, weights=probs, k=1)[0]

ARCHETYPE_TRACK_WEIGHTS = {
    "student":            {"combat": 0.20, "crafting": 0.20, "commerce": 0.20, "nature": 0.20, "healing": 0.20},
    "young_professional": {"combat": 0.15, "crafting": 0.25, "commerce": 0.35, "nature": 0.15, "healing": 0.10},
    "parent_caregiver":   {"combat": 0.05, "crafting": 0.05, "commerce": 0.20, "nature": 0.30, "healing": 0.40},
    "senior_worker":      {"combat": 0.15, "crafting": 0.35, "commerce": 0.05, "nature": 0.25, "healing": 0.20},
    "veteran_job_seeker": {"combat": 0.40, "crafting": 0.15, "commerce": 0.05, "nature": 0.15, "healing": 0.25},  # note: healer veteran is the "wise elder" path
    "employer":           {"combat": 0.05, "crafting": 0.05, "commerce": 0.70, "nature": 0.10, "healing": 0.10},
}
```

---

## Job Thresholds Summary

| Job | Track | Threshold | Opens | Max slots |
|---|---|---|---|---|
| Inn Helper | Commerce | 30 | Week 2 (dynamic) | 2 |
| Farm Hand | Nature | 35 | Week 3 (dynamic) | 1 |
| Guard Apprentice | Combat | 40 | Week 4 (dynamic) | 1 |
| Hunter Apprentice | Nature | 40 | Week 5 (dynamic) | 2 |
| Scout/Courier | Combat | 45 | Week 5 (dynamic) | 2 |
| Merchant Assistant | Commerce | 45 | Week 6 (dynamic) | 1 |
| Apprentice Blacksmith | Crafting | 50 | Week 6 (dynamic) | 1 |
| Herbalist Apprentice | Healing | 45 | Week 8 (dynamic) | 1 |

**"Dynamic"** here means: the week listed is the earliest possible given normal demand growth. If more agents use Inn services before Week 2, Inn Helper could open Week 1. If fewer agents are training (less tool demand), Blacksmith slot could delay to Week 9.

---

## Mentorship Availability

Employed workers have limited mentorship time per week:

| Worker | Max mentee hours/week | Mentorship style |
|---|---|---|
| Innkeeper | 6 hrs | Passive (teaches while working) |
| Blacksmith | 4 hrs | Intensive (dedicated sessions) |
| Hunter 1 | 8 hrs | Outdoor (on patrol, anyone can follow) |
| Hunter 2 | 6 hrs | Outdoor |
| Merchant 1 | 3 hrs | Ad-hoc (brief advice during trade) |
| Merchant 2 | 4 hrs | Ad-hoc |
| Guard Captain 1 | 10 hrs | Drills (open to 6 simultaneously) |
| Guard Captain 2 | 8 hrs | Drills |

A mentee must be at the same location as the mentor during their active mentorship window. This means:
- Combat agents who show up to the Training Ground during Guard patrol hours get mentorship automatically
- Crafting agents who arrive at the Blacksmith shop during working hours can ask for mentorship
- Commerce agents who visit the Inn during the Innkeeper's teaching hours get guided training
