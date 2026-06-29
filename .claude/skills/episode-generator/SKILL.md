---
name: episode-generator
description: >
  Cook a new Autonate episode from concept to production-ready script.
  Use when the user describes an episode idea, city research, lesson to teach,
  or asks to write, refine, or extend a scene or beat.
---

# Episode Generator

Autonate is a dark-skinned solopreneur AI consultant traveling city to city,
mapping the invisible architecture of markets, orgs, and power — then selling
clarity to people stuck inside systems they can't see. Episodes are sci-fi /
superhero / coming-of-age + philosophy + comedy + romance. Think Black Mirror
meets The Fresh Prince meets a TED talk.

---

## Episode structure

Every episode has a **Lesson**, a **Hook**, **Beats** (scenes), and **Payoff**.

```
LESSON   — the insight Autonate (and the audience) walks away with
HOOK     — the opening moment that earns 3 more minutes of attention
BEATS    — 5–9 scenes, each with: location, NPCs, dialogue, camera notes
PAYOFF   — emotional + intellectual resolution; seeds the next episode
```

### Beat anatomy

Each beat has:
- **Goal**: what must happen narratively
- **Location**: where in the world (coordinates + landmark)
- **NPCs**: who's there, their archetype, their hidden truth
- **Dialogue**: 4–8 exchanges — natural, character-specific, often funny
- **Camera**: establishing shot type, close-up moments, Autonate "to camera" lines
- **Emotional note**: tension / revelation / humor / warmth / awe

---

## NPC design rules

Every named NPC must have:
1. A **hidden truth** that Autonate reveals through conversation
2. A **resistance**: why they push back / don't immediately trust him
3. A **moment of recognition**: when they realize he's right (or wrong in an interesting way)
4. **Voice**: distinct speech pattern — no two NPCs sound alike

NPC archetypes to draw from:
- **The Wise Reluctant** — knows everything, shares nothing until pushed (Elara)
- **The Honest Craftsman** — operates on pure intuition, doesn't theorize (Theo)
- **The Pragmatic Survivor** — has the answer but framed wrong (Min)
- **The Corrupt Gatekeeper** — blocks the lesson, later becomes a cautionary tale
- **The Romantic Wild Card** — disrupts Autonate's logic with emotion or chaos
- **The Young Seeker** — mirrors what Autonate was, lets him be mentor

Background NPCs (10–30): assigned archetypes + idle clips. They make the world feel alive. Use them for comedy — background characters reacting to Autonate's conversations.

---

## Dialogue style

- **Autonate's voice**: confident but curious, quick wit, occasional vulnerability. He uses business/tech terms but translates them immediately into human terms. Never condescending.
- **NPC voices**: grounded in their world — they don't use consultant language. When Autonate does, they call it out.
- **Funny moments**: often from the gap between Autonate's framework and the NPC's lived experience. "You just described market segmentation." / "I described surviving winter."
- **Emotional moments**: slow the pace, shorten the lines. One truth per exchange.
- **Romance**: Autonate notices people. He's charming and slightly oblivious to his own charm.

---

## Camera conventions (relYaw system)

```
relYaw = PI        → over-the-shoulder (establishing, walking shots)
relYaw = 0         → face shot (Autonate speaking "to camera" or emotional close-up)
relYaw = ±0.4      → 3/4 angle (two-character conversations, alternating sides)
relYaw = PI, dist=18, pitch=0.5 → wide establishing shot
relYaw = 0, dist=5, pitch=0.1  → intimate close-up
```

For conversations: alternate 3/4 angles between lines (±0.4 each speaker's side).
For revelation moments: slow pull back to wide (increase dist over 2–3 seconds via multiple cam acts).
For "to camera" moments: face angle 0, low pitch (0.1–0.15), close dist (5–6).

---

## Output format

### 1. Episode brief (write this first, user approves)
```markdown
# EP00N · [Title]
**Lesson**: [one sentence]
**Hook**: [opening moment]
**Setting**: [city/zone + specific locations]
**Cast**: [named NPCs with one-line description]
**Arc**: [3-sentence story spine]
**Tone**: [emotional range this episode]
```

### 2. Beat sheet (director reference)
Exported as `EP00N_BEATS: EpisodeBeat[]` in the episode file.
Each beat has `id`, `label`, `description`, `location`, `npcId`.

### 3. NPC data
Exported as `EP00N_NPCS: EpisodeNpc[]`.
Full dialogue for every named NPC interaction.
Each `DialogueLine` has: `speaker`, `isAutonate`, `text`, `npcClip`, `autonateClip`.

### 4. Scripted cinematic (auto-playback)
Exported as `EP00N_SCENE: SceneAct[]`.
The reference cut — used for previewing structure before performing it live.

---

## Episode file template

```typescript
// apps/woc-sim/src/episodes/ep00N_[slug].ts

import type {SceneAct} from '../scene_player';
import type {EpisodeNpc} from '../npcs';

// [LESSON]: [one-sentence insight]
// [TONE]:   [emotional range]

export const EP00N_NPCS: EpisodeNpc[] = [
  {
    id:      'npc_id',
    name:    'Name',
    role:    'Role Description',
    model:   'model.glb',        // druid, knight, mage, paladin, ranger, rogue, barbarian
    x:       0, z: 0,
    facing:  0,                  // rotation.y in radians
    dialogue: [
      {speaker: 'Name',     isAutonate: false, text: '...', npcClip: 'Idle'},
      {speaker: 'Autonate', isAutonate: true,  text: '...', autonateClip: 'Spellcast_Raise'},
    ],
  },
];

export const EP00N_BEATS: EpisodeBeat[] = [
  {id: 'beat_id', label: 'NN · Label', description: '...', location: '...', npcId: 'npc_id'},
];

export const EP00N_SCENE: SceneAct[] = [
  // Each beat becomes a block of acts:
  // cam (wide establishing) → walk_to → face → cam (convo angle) → talk × N → gesture
];
```

---

## Building a new episode — step by step

1. **User describes concept**: city, lesson, emotional tone, any real research
2. **Write episode brief** — get approval before building
3. **Design cast**: 3–5 named NPCs + background fills
4. **Write dialogue** for each NPC interaction (most important step)
5. **Map the world**: where does each beat happen? What new geometry is needed?
6. **Write beat sheet** for director HUD
7. **Write EP00N_SCENE** — the scripted cinematic reference cut
8. **Export file** to `apps/woc-sim/src/episodes/`
9. **Register in main.tsx**: load NPCs via `scene.setEpisodeNpcs(EP00N_NPCS, ...)`

---

## World building (new locations)

New geometry goes in `buildWorld()` in `scene.ts`. Call a new private method:
```typescript
private buildMyNewLocation(): void {
  const lx = X, lz = Z;
  const ly = terrainHeight(lx, lz);
  // ... THREE.Mesh geometry ...
}
```

Call it from `buildWorld()` alongside `buildMarket()` and `buildPortals()`.

New portals: add a pair to the `pairs` array in `buildPortals()`.

---

## Existing world locations (Eastbrook Vale)

| Location | x | z | Notes |
|---|---|---|---|
| Eastbrook Hub | 0 | 0 | Inn + training hall |
| Crossroads Market | 30 | 3 | Elara, Theo, Min |
| Wolf Run | -2 | 70 | Danger zone |
| Boar Meadow | 65 | 0 | Open field |
| Mirror Lake | -88 | 82 | Peaceful |
| Copper Dig | -84 | -64 | Mining camp |
| Webwood | -60 | 4 | Dense forest |

Portal: Hub ↔ Market (rings at x=16 and x=22).

---

## Available KayKit character models

`druid.glb` (healer/nature), `knight.glb` (armored/strong), `mage.glb` (scholarly),
`paladin.glb` (noble/official), `ranger.glb` (outdoors), `rogue.glb` (quick/slim),
`barbarian.glb` (muscular — Autonate's model)

All share the same rig and clips: `Idle`, `Walking_A`, `Running_A`, `Spellcast_Raise`,
`Spellcasting`, `Cheer`, `Hit_A`, `Jump_Idle`, etc.

---

## Episode pipeline status

| EP | Title | Status |
|---|---|---|
| 001 | The Invisible Architecture | Script + NPCs + Scene ✓ |
| 002 | [TBD] | Concept only |

Future episodes: each new city = new zone + new cast + new lesson.
