# Eastbrook Vale Workforce Experiment — Design Specification

**Status:** Design approved, pending Mesa implementation  
**World:** Eastbrook Vale (Zone 1), 3D visualization via `apps/woc-sim`  
**Population:** 50 agents · 16 simulated weeks  
**Key question:** What patterns of interaction, timing, and resource access drive the transition from unskilled → employed?

---

## 1. Population

| Role | Count | Starting status | Economic function |
|---|---|---|---|
| Innkeeper | 1 | Employed | Sells food, rents beds, posts job notices, trains Commerce track |
| Blacksmith | 1 | Employed | Makes tools for workers + trainees; trains Crafting track |
| Hunter | 2 | Employed | Provides food supply; trains Nature track |
| Merchant | 2 | Employed | Moves goods between POIs, sources job postings, pays wages from outside |
| Guard Captain | 2 | Employed | Patrols roads, reduces commute danger; trains Combat track |
| **Job seekers** | **42** | Unaware/Aware mix | The pipeline under study |

The 8 employed workers form a **closed micro-economy** before any seekers arrive:
- Merchant pays Blacksmith for tools → Blacksmith buys food from Hunters → Hunters sell at Inn → Innkeeper collects rent from Guards → Guards protect Merchant's trade routes.
- Each worker has a **workload meter** (0–100). When workload exceeds the hire threshold, that worker opens a job posting. This is what creates demand for the 42 seekers.

### Job-Seeker Breakdown (42 agents)

| Archetype | Count | Skill affinity | Notes |
|---|---|---|---|
| Student | 8 | Any (fastest learner) | Low starting money, high energy |
| Young Professional | 8 | Commerce, Crafting | Moderate money, high stress tolerance |
| Parent/Caregiver | 8 | Healing, Commerce | Time-constrained (must be home 3–7pm), medium energy |
| Senior Worker | 8 | Crafting, Nature | Experience bonus to skill gain, slower raw rate |
| Veteran Job Seeker | 6 | Combat, Any | Highest stress baseline, most experienced, social capital head-start |
| Employer (aspiring) | 4 | Commerce | Goal: accumulate enough capital to create their own job slot |

---

## 2. Status Pipeline

```
Unaware → Aware → Training → Trained → Employed
```

### Transition Triggers

**Unaware → Aware**
- Must encounter a job posting (at Hub noticeboard, or word-of-mouth from employed worker)
- Probability per Hub visit: `0.15 + (social_capital × 0.003)`
- Social network spread: if an Aware/Training agent is a neighbor and has social interaction, `p = 0.08` per interaction

**Aware → Training**
- Agent enrolls in a training session for their assigned skill track
- Requirements: `energy > 40`, `money >= 0`, open slot in that track's session
- Session capacity: 6 agents per track per time slot (trainer can only teach 6)

**Training → Trained**
- Agent's `skill_level` crosses the track's threshold (see Skill Tracks doc)
- Minimum: 4 completed training sessions regardless of skill score
- Mentorship from employed worker multiplies gain rate ×2.5

**Trained → Employed**
- A job posting must exist for that skill track
- Agent applies: `success_probability = 0.4 + (skill_level / 200) + (social_capital / 300)`
- One application attempt per week; rejection costs `stress += 20`
- Referral path: if social_capital > 60 and a connected worker recommends, `p = 0.75` flat

---

## 3. Agent Attributes

```python
# Identity
id:              str       # unique agent ID
archetype:       str       # one of 6 archetypes
skill_track:     str       # one of 5 tracks (assigned at spawn)
neighborhood:    str       # home location zone

# State (0–100 unless noted)
energy:          float     # 0 = incapacitated, 100 = full
money:           float     # can go negative (debt)
stress:          float     # 0 = calm, 100 = breakdown
skill_level:     float     # progress toward threshold for their track
social_capital:  float     # network strength with employed workers

# Derived
status:          str       # unaware | aware | training | trained | employed
money_pressure:  float     # computed: max(0, -money / 100 + stress * 0.3)
days_broke:      int       # consecutive days with money < 0
in_survival_mode: bool     # true when days_broke >= 21
```

---

## 4. Energy System

### Drains (per hour)

| Activity | Energy/hr |
|---|---|
| Sleep (home, 10pm–6am) | +12 |
| Rest (home, daytime) | +6 |
| Eat a meal (event, flat) | +25 |
| Training session | −14 |
| Working (employed) | −10 |
| Commuting | −5 |
| Socializing at Hub | −2 |
| Idle/waiting | −1 |

### Energy Rules

- **Energy < 20**: Agent skips next training session, goes home early. Logs `skipped_training` event.
- **Energy < 10**: Agent can only rest. No social interactions.
- **Hunger penalty**: If no meal at noon window (11am–1pm) → `energy − 15`, `stress + 8`. Same at dinner (6–8pm).
- **Full rest night** (8+ hrs sleep): `stress − 8` on wake.
- Innkeeper sells food for `money − 2/meal`. Hunters occasionally share food for `social_capital + 5` (no money cost).

---

## 5. Money System

### Cash Flow

| Agent type | Weekly income | Weekly expenses |
|---|---|---|
| Employed worker | wage (15–25 units) | food (8), shelter (4) |
| Job seeker | 0 | food (8), training fee (2/session), shelter (4) |
| Survival mode | odd jobs (3–6/week) | food (8), shelter (4) |

### Money Rules

- `money < 0` for 7 days → `money_pressure` spike, `stress + 10/week`
- `days_broke >= 21` → **Survival Mode**: stops training, takes any available odd job from employed workers. Can still hear gossip → Aware transition still possible.
- Merchant can offer a small loan (money +10, stress +15 "debt stress", repaid from first wage)

---

## 6. Stress System

### Events and Deltas

| Event | Stress Δ |
|---|---|
| Job rejection | +20 |
| Week ends with no income | +10 |
| Missed meal | +8 |
| Long commute (>1hr each way) | +5/day |
| Social interaction w/ employed worker | −10 |
| Successful training session | −5 |
| Hired event | −40 |
| Full night sleep | −8 |
| Mentor session | −12 |
| Neighbor gets hired (social proof) | −5 |

### Stress Thresholds

- **Stress > 80**: Agent skips job-search activities for 1–2 days (burnout). Logged as `burnout_episode`.
- **Stress > 95**: Agent exits workforce permanently. Status frozen at current stage. Logged as `dropout`.

---

## 7. Social Capital

The hidden variable that separates fast movers from stuck agents.

### Gains

| Interaction | Social Capital Δ |
|---|---|
| Hub visit when employed worker present | +3 |
| Shares food with another agent | +5 |
| Completes training session (teacher grants) | +4 |
| Helps employed worker (odd job) | +8 |
| Referred a neighbor to a job | +6 |

### Effects

| Threshold | Unlocks |
|---|---|
| > 20 | Hears job gossip passively (Unaware → Aware faster) |
| > 40 | Eligible for mentorship from an employed worker |
| > 60 | Referral hire path available (0.75 hire probability, bypasses skill check partially) |
| > 80 | Can create their own odd-job posting for other agents |

---

## 8. Dynamic Job Openings

Jobs only open when employed workers are overloaded. No fixed schedule.

### Workload Formula

```python
workload = current_demand / solo_capacity  # 0.0–1.0+
```

| Worker | Demand drivers | Solo capacity | Opens at |
|---|---|---|---|
| Innkeeper | daily_visitors × 1.5 + active_seekers × 0.3 | 60 units/week | workload > 0.75 |
| Blacksmith | tool_orders + repair_requests + training_equip | 40 units/week | workload > 0.80 |
| Merchant | active_trade_routes × route_difficulty | 50 units/week | workload > 0.75 |
| Guard Captain | patrol_zones × threat_events / current_guards | 30 units/week | workload > 0.70 |

### Feedback Loop

When a seeker gets hired and starts working:
- Their employer's `workload` drops proportional to apprentice skill level
- A highly skilled apprentice reduces workload by 40%; low skill by 15%
- If workload drops below 0.40 after hire, the slot closes (no second hire)
- If demand keeps growing (more seekers → more inn visits, more tool needs), a second slot can open

This creates a **natural economy**: more job seekers create more demand → more jobs open → more can get hired. But it's rate-limited — you can't flood the economy.

---

## 9. Key Story Patterns to Surface

These are the agents we'll follow in the 3D world:

| Pattern | Who | What we watch |
|---|---|---|
| **Fast mover** | Student, lives near Hub, Commerce track | Hub every morning → job posting week 2 → hired week 3 |
| **Late bloomer** | Senior Worker, Crafting track | Steady training, one burnout, blacksmith slot opens week 6 → hired |
| **Socially connected but unskilled** | Veteran, high social capital | Knows everyone, gets referred early, skill too low → waits → finally qualifies |
| **Isolated grinder** | Young Professional, far from Hub | Trains alone, crosses threshold → sits Trained 3 weeks with no social capital → referral path blocked |
| **The dropout** | Parent/Caregiver, money runs out | Survival mode week 5 → occasional odd job → money stabilizes week 9 → resumes |
| **The catalyst** | Any Trained agent who gets hired | Their hire visibly reduces employer workload → triggers second job opening → cascade |

---

## 10. Metrics to Capture Per Agent Per Step

```python
step_log = {
    "week": int,
    "agent_id": str,
    "status": str,
    "energy": float,
    "money": float,
    "stress": float,
    "skill_level": float,
    "social_capital": float,
    "skill_track": str,
    "location": str,          # home | hub | training | work | commute
    "activity": str,          # sleep | eat | train | work | socialize | job_search | rest
    "event": str | None,      # hired | rejected | mentored | burnout | dropout | job_opened
    "mentor_id": str | None,
    "money_pressure": float,
    "days_broke": int,
    "in_survival_mode": bool,
    "social_interactions_today": int,
    "training_sessions_completed": int,
    "applications_submitted": int,
    "applications_rejected": int,
}
```

---

## 11. Decisions Made

- **Skill system**: Specialization — each agent has one skill track (not a general score)
- **Job openings**: Dynamic — opens when employer workload exceeds threshold, closes if it drops
- **Hiring**: Probabilistic with skill + social capital, referral shortcut for high social capital
- **Energy/stress/money**: Fully interdependent — missing meals raises stress, high stress wastes training, broke agents enter survival mode
- **Social capital**: Hidden variable driving the "why do some identical-looking agents succeed faster?" question
