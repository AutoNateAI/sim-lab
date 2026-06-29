// Episode 001 — "The Invisible Architecture"
//
// Autonate arrives in Eastbrook Vale and discovers that what everyone calls
// "the market" is actually a fractal ecosystem of thousands of micro-markets,
// each with its own logic. He meets the people who live inside it, learns to
// read the patterns they can't see themselves — and lands his first pitch.
//
// Theme: markets are emergent behavior, not a place. Understanding the system
//        is the consultant's edge.
// Tone:  philosophical, funny, warm. Sci-fi superhero discovering magic in
//        the mundane. A few romantic undertones with Elara.

import type {SceneAct} from '../scene_player';
import type {ProductionBeat} from '../production_player';
import type {EpisodeNpc} from '../npcs';

// ─── NPC CAST ─────────────────────────────────────────────────────────────────

export const EP001_NPCS: EpisodeNpc[] = [
  {
    id: 'elara',
    name: 'Elara',
    role: 'Market Elder',
    model: 'druid.glb',
    x: 30, z: 6,
    facing: -Math.PI / 2,
    dialogue: [
      {speaker: 'Elara', isAutonate: false,
        text: "You're not from here.",
        npcClip: 'Idle'},
      {speaker: 'Autonate', isAutonate: true,
        text: "That obvious?",
        autonateClip: 'Spellcast_Raise'},
      {speaker: 'Elara', isAutonate: false,
        text: "Only travelers look at the market like it's a THING. Locals just see it as life.",
        npcClip: 'Spellcasting'},
      {speaker: 'Autonate', isAutonate: true,
        text: "What do you see?",
        autonateClip: 'Idle'},
      {speaker: 'Elara', isAutonate: false,
        text: "Seventeen simultaneous negotiations. A supply chain held by three families and one bridge. Three price bubbles about to pop.",
        npcClip: 'Spellcast_Raise'},
      {speaker: 'Autonate', isAutonate: true,
        text: "How long did it take you to see all that?",
        autonateClip: 'Spellcasting'},
      {speaker: 'Elara', isAutonate: false,
        text: "About as long as it takes anyone to realize... the market doesn't actually exist.",
        npcClip: 'Idle'},
    ],
  },
  {
    id: 'elara_revelation',
    name: 'Elara',
    role: 'Market Elder',
    model: 'druid.glb',
    x: 30, z: 6,
    facing: -Math.PI / 2,
    dialogue: [
      {speaker: 'Elara', isAutonate: false,
        text: "So. What did you learn out there?",
        npcClip: 'Idle'},
      {speaker: 'Autonate', isAutonate: true,
        text: "Every person in that market is making rational decisions based on incomplete information. The result is... chaotic order.",
        autonateClip: 'Spellcasting'},
      {speaker: 'Elara', isAutonate: false,
        text: "Now you're ready to be dangerous.",
        npcClip: 'Spellcast_Raise'},
      {speaker: 'Autonate', isAutonate: true,
        text: "How so?",
        autonateClip: 'Idle'},
      {speaker: 'Elara', isAutonate: false,
        text: "Because you can see the patterns. And if you can see the patterns, you can show OTHERS the patterns. That... is worth paying for.",
        npcClip: 'Spellcasting'},
    ],
  },
  {
    id: 'theo',
    name: 'Theo',
    role: 'Hardware Vendor',
    model: 'knight.glb',
    x: 24, z: -1,
    facing: Math.PI * 0.6,
    dialogue: [
      {speaker: 'Theo', isAutonate: false,
        text: "Good tools. Fair price. That's all there is to it.",
        npcClip: 'Idle'},
      {speaker: 'Autonate', isAutonate: true,
        text: "How do you set the price?",
        autonateClip: 'Spellcast_Raise'},
      {speaker: 'Theo', isAutonate: false,
        text: "Materials plus my time plus enough to eat tonight. Same formula my father used.",
        npcClip: 'Spellcasting'},
      {speaker: 'Autonate', isAutonate: true,
        text: "What if someone sells the same thing cheaper?",
        autonateClip: 'Idle'},
      {speaker: 'Theo', isAutonate: false,
        text: "Then I need to be BETTER. Or different. Or make sure my customers know why I cost more.",
        npcClip: 'Spellcast_Raise'},
      {speaker: 'Autonate', isAutonate: true,
        text: "... You just described value proposition, differentiation, and customer relationship management. You're a natural strategist.",
        autonateClip: 'Cheer'},
      {speaker: 'Theo', isAutonate: false,
        text: "I'm a blacksmith. Stop making it complicated.",
        npcClip: 'Idle'},
    ],
  },
  {
    id: 'min',
    name: 'Min',
    role: 'Food Vendor',
    model: 'mage.glb',
    x: 36, z: -1,
    facing: Math.PI * 0.4,
    dialogue: [
      {speaker: 'Min', isAutonate: false,
        text: "Last of the season's harvest. Price doubles next week. That's the market, friend.",
        npcClip: 'Spellcast_Raise'},
      {speaker: 'Autonate', isAutonate: true,
        text: "You're using scarcity to drive the price up.",
        autonateClip: 'Idle'},
      {speaker: 'Min', isAutonate: false,
        text: "I'm RESPONDING to scarcity. I didn't end the season. But I can read it. That's the difference between knowing the market and just surviving it.",
        npcClip: 'Spellcasting'},
      {speaker: 'Autonate', isAutonate: true,
        text: "That's demand forecasting. You're doing it by feel.",
        autonateClip: 'Spellcast_Raise'},
      {speaker: 'Min', isAutonate: false,
        text: "Call it whatever you like. My family ate through winter. Did yours?",
        npcClip: 'Idle'},
    ],
  },
  {
    id: 'theo_pitch',
    name: 'Theo',
    role: 'Hardware Vendor',
    model: 'knight.glb',
    x: 24, z: -1,
    facing: Math.PI * 0.6,
    dialogue: [
      {speaker: 'Autonate', isAutonate: true,
        text: "Theo. What if I could tell you exactly when demand for tools peaks in this valley — and how to price differently for each type of buyer?",
        autonateClip: 'Spellcast_Raise'},
      {speaker: 'Theo', isAutonate: false,
        text: "... You could do that?",
        npcClip: 'Idle'},
      {speaker: 'Autonate', isAutonate: true,
        text: "That's what I do. I map the invisible architecture that everyone operates inside but nobody can see. And then I help you USE it.",
        autonateClip: 'Spellcasting'},
      {speaker: 'Theo', isAutonate: false,
        text: "How much does that cost?",
        npcClip: 'Spellcast_Raise'},
      {speaker: 'Autonate', isAutonate: true,
        text: "Less than one missed season. Meet me at the inn tonight.",
        autonateClip: 'Cheer'},
    ],
  },
];

// ─── BEAT CAMERA SETUPS — scouted via Playwright ──────────────────────────────
// Each beat has a verified start position for Autonate and one or two camera
// presets that look good from that spot. "primary" is the main shot, "secondary"
// is an alternate angle (face shot, reverse angle, etc.).
//
// Scouting notes (2026-06-29):
//   - Conversation scenes: camera from EAST (camYaw≈PI/2) avoids portal rings at x=16,22.
//   - High pitch (0.40+) clears tree geometry south of market pavilion.
//   - Hub wide: Autonate at (4,8) facing inn, camera slightly off-axis gives depth.
//   - Sim agents wander — if one blocks a shot, pause+re-record.

export type CamPreset = {yaw: number; pitch: number; dist: number; desc: string};

export type BeatSetup = {
  beatId:    string;
  x: number; z: number;  // Autonate start position for this beat
  facing:    number;      // Autonate facing direction (radians)
  primary:   CamPreset;
  secondary: CamPreset;
};

export const EP001_SETUPS: BeatSetup[] = [
  {
    beatId: 'arrive',
    x: 4, z: 8, facing: Math.PI,        // Autonate faces south toward hub buildings
    primary:   {yaw: 0.3,             pitch: 0.38, dist: 10,  desc: 'Wide behind — inn in background'},
    secondary: {yaw: Math.PI + 0.2,   pitch: 0.14, dist: 6,   desc: 'Face shot — to camera'},
  },
  {
    beatId: 'market_enter',
    x: 8, z: 0, facing: Math.PI / 2,   // Heading east toward market
    primary:   {yaw: -Math.PI / 2,    pitch: 0.32, dist: 14,  desc: 'Follow behind — market ahead'},
    secondary: {yaw: -Math.PI / 4,    pitch: 0.28, dist: 10,  desc: 'Diagonal follow — slightly north'},
  },
  {
    beatId: 'meet_elara',
    x: 30, z: 2, facing: 0,            // Faces north toward Elara at (30,6)
    primary:   {yaw: Math.PI / 2,     pitch: 0.40, dist: 12,  desc: 'East side — avoids trees, sees Elara'},
    secondary: {yaw: 0,               pitch: 0.18, dist: 7,   desc: 'Face shot — Autonate looking at Elara'},
  },
  {
    beatId: 'theo',
    x: 26, z: -5, facing: 0,           // Faces north toward Theo at (24,-1)
    primary:   {yaw: Math.PI / 2,     pitch: 0.32, dist: 12,  desc: 'East side — portal ring as scenery'},
    secondary: {yaw: Math.PI,         pitch: 0.32, dist: 10,  desc: 'Behind Autonate — Theo in frame'},
  },
  {
    beatId: 'min',
    x: 36, z: -5, facing: 0,           // Faces north toward Min at (36,-1)
    primary:   {yaw: -Math.PI / 2,    pitch: 0.38, dist: 12,  desc: 'West side — open field, no portals'},
    secondary: {yaw: Math.PI,         pitch: 0.30, dist: 10,  desc: 'Behind Autonate — Min in frame'},
  },
  {
    beatId: 'revelation',
    x: 30, z: 2, facing: 0,
    primary:   {yaw: Math.PI / 2,     pitch: 0.36, dist: 9,   desc: 'East side — tighter, more intimate'},
    secondary: {yaw: -Math.PI / 6,    pitch: 0.15, dist: 6,   desc: 'Low face shot — revelation moment'},
  },
  {
    beatId: 'pitch',
    x: 26, z: -5, facing: 0,
    primary:   {yaw: Math.PI / 2 + 0.4, pitch: 0.20, dist: 7, desc: 'Close diagonal — intense pitch angle'},
    secondary: {yaw: Math.PI,           pitch: 0.14, dist: 5,  desc: 'Very close OTS — Theo reaction visible'},
  },
];

// ─── EPISODE BEATS (director reference — not the same as SceneAct[]) ──────────

export type EpisodeBeat = {
  id: string;
  label: string;
  description: string;
  npcId?: string;
  location: string;
};

export const EP001_BEATS: EpisodeBeat[] = [
  {
    id: 'arrive',
    label: '01 · Arrival',
    description: 'Open at hub. Walk to the edge of town, look out. Deliver opening monologue to camera.',
    location: 'Hub (x:0, z:0)',
  },
  {
    id: 'market_enter',
    label: '02 · Enter the Market',
    description: 'Walk the road east toward the Crossroads Market. Take it all in.',
    location: 'Road to Market (x:16, z:0)',
  },
  {
    id: 'meet_elara',
    label: '03 · Meet Elara',
    description: 'Find the Market Elder at her pavilion. Press E to begin conversation.',
    location: 'Market Pavilion (x:30, z:6)',
    npcId: 'elara',
  },
  {
    id: 'theo',
    label: '04 · Talk to Theo',
    description: 'Visit the hardware vendor. Challenge his pricing logic. Press E to talk.',
    location: "Theo's Stall (x:24, z:-1)",
    npcId: 'theo',
  },
  {
    id: 'min',
    label: '05 · Talk to Min',
    description: 'The food vendor understands scarcity better than any economist. Press E.',
    location: "Min's Cart (x:36, z:-1)",
    npcId: 'min',
  },
  {
    id: 'revelation',
    label: '06 · The Revelation',
    description: 'Return to Elara. Share what you learned. The pattern becomes clear.',
    location: 'Market Pavilion (x:30, z:6)',
    npcId: 'elara_revelation',
  },
  {
    id: 'pitch',
    label: '07 · First Pitch',
    description: 'Walk back to Theo. Deliver the pitch. Contract #1 is on the line.',
    location: "Theo's Stall (x:24, z:-1)",
    npcId: 'theo_pitch',
  },
];

// ─── SCRIPTED CINEMATIC VERSION (auto-playback, no user control) ──────────────
// For auto-play (Scene button). The full episode as timed acts.
// This is the "reference cut" — the user's recorded performance becomes the
// final version; this scripted version is for previewing structure.

export const EP001_SCENE: SceneAct[] = [
  // ── ARRIVE ───────────────────────────────────────────────────────────────────
  {kind: 'cam', relYaw: Math.PI, pitch: 0.55, dist: 18},
  {kind: 'wait', seconds: 0.5},
  {kind: 'walk_to', x: 12, z: 0, speed: 5},
  {kind: 'face', angle: 0},
  {kind: 'cam', relYaw: 0.3, pitch: 0.15, dist: 7},
  {kind: 'talk', text: "First day in Eastbrook Vale. Population: small. Opportunity: unknown. My job? Find the patterns other people miss. Let's see what this market is hiding."},

  // ── ENTER MARKET ─────────────────────────────────────────────────────────────
  {kind: 'cam', relYaw: Math.PI, pitch: 0.4, dist: 14},
  {kind: 'walk_to', x: 30, z: 3, speed: 6},

  // ── MEET ELARA ───────────────────────────────────────────────────────────────
  {kind: 'face', angle: -Math.PI / 2},
  {kind: 'cam', relYaw: 0.5, pitch: 0.18, dist: 7},
  {kind: 'gesture', clip: 'Idle', duration: 0.4},
  // Elara's opening — delivered as subtitle (NPC voice placeholder)
  {kind: 'talk', text: "Elara: \"You're not from here.\""},
  {kind: 'gesture', clip: 'Spellcast_Raise', duration: 0.5},
  {kind: 'talk', text: "Autonate: \"That obvious?\""},
  {kind: 'cam', relYaw: -0.5, pitch: 0.2, dist: 8},
  {kind: 'talk', text: "Elara: \"Only travelers look at the market like it's a THING. Locals just see life. I see seventeen negotiations, three price bubbles, and a supply chain held together by one bridge.\""},
  {kind: 'gesture', clip: 'Spellcasting', duration: 0.8},
  {kind: 'talk', text: "Autonate: \"The market doesn't actually exist, does it.\""},
  {kind: 'gesture', clip: 'Cheer', duration: 1.5},

  // ── THEO ─────────────────────────────────────────────────────────────────────
  {kind: 'cam', relYaw: Math.PI, pitch: 0.4, dist: 14},
  {kind: 'walk_to', x: 24, z: -1, speed: 6},
  {kind: 'face', angle: Math.PI * 0.6},
  {kind: 'cam', relYaw: 0.4, pitch: 0.18, dist: 7},
  {kind: 'talk', text: "Theo: \"Good tools. Fair price. Same formula my father used — materials plus time plus enough to eat.\""},
  {kind: 'gesture', clip: 'Spellcast_Raise', duration: 0.5},
  {kind: 'talk', text: "Autonate: \"What if someone sells cheaper?\""},
  {kind: 'talk', text: "Theo: \"Then I need to be BETTER. Or make sure customers know why I cost more.\""},
  {kind: 'gesture', clip: 'Cheer', duration: 1.2},
  {kind: 'talk', text: "Autonate: \"You just described value prop, differentiation, and CRM. You're a natural strategist.\""},
  {kind: 'talk', text: "Theo: \"I'm a blacksmith. Stop making it complicated.\""},

  // ── MIN ───────────────────────────────────────────────────────────────────────
  {kind: 'cam', relYaw: Math.PI, pitch: 0.4, dist: 14},
  {kind: 'walk_to', x: 36, z: -1, speed: 5},
  {kind: 'face', angle: Math.PI * 0.4},
  {kind: 'cam', relYaw: 0.4, pitch: 0.18, dist: 7},
  {kind: 'talk', text: "Min: \"Last of the season's harvest. Price doubles next week.\""},
  {kind: 'talk', text: "Autonate: \"You're using scarcity to drive price.\""},
  {kind: 'talk', text: "Min: \"I'm RESPONDING to it. I didn't end the season. But I can READ it. That's the difference between knowing the market and just surviving it.\""},
  {kind: 'gesture', clip: 'Hit_A', duration: 1.0},
  {kind: 'talk', text: "Autonate: \"That's demand forecasting. You're doing it by feel.\""},
  {kind: 'talk', text: "Min: \"Call it whatever you like. My family ate through winter. Did yours?\""},

  // ── REVELATION ────────────────────────────────────────────────────────────────
  {kind: 'cam', relYaw: Math.PI, pitch: 0.45, dist: 16},
  {kind: 'walk_to', x: 30, z: 6, speed: 5},
  {kind: 'face', angle: -Math.PI / 2},
  {kind: 'cam', relYaw: 0.4, pitch: 0.2, dist: 8},
  {kind: 'talk', text: "Elara: \"So. What did you learn out there?\""},
  {kind: 'gesture', clip: 'Spellcasting', duration: 1.0},
  {kind: 'talk', text: "Autonate: \"Every person in that market is making rational decisions based on incomplete information. The result is... chaotic order.\""},
  {kind: 'talk', text: "Elara: \"Now you're ready to be dangerous.\""},
  {kind: 'talk', text: "Autonate: \"Because I can see the patterns.\""},
  {kind: 'cam', relYaw: -0.3, pitch: 0.12, dist: 6},
  {kind: 'talk', text: "Elara: \"And if you can show OTHERS the patterns... that is worth paying for.\""},
  {kind: 'gesture', clip: 'Cheer', duration: 2.0},

  // ── FIRST PITCH ───────────────────────────────────────────────────────────────
  {kind: 'cam', relYaw: Math.PI, pitch: 0.42, dist: 13},
  {kind: 'walk_to', x: 24, z: -1, speed: 6},
  {kind: 'face', angle: Math.PI * 0.6},
  {kind: 'cam', relYaw: 0.35, pitch: 0.15, dist: 6},
  {kind: 'gesture', clip: 'Spellcast_Raise', duration: 1.0},
  {kind: 'talk', text: "Autonate: \"Theo. What if I could tell you exactly when demand peaks in this valley — and how to price differently for each buyer type?\""},
  {kind: 'talk', text: "Theo: \"... You could do that?\""},
  {kind: 'cam', relYaw: 0.15, pitch: 0.12, dist: 5},
  {kind: 'talk', text: "Autonate: \"I map the invisible architecture everyone operates inside but nobody can see. Meet me at the inn tonight.\""},
  {kind: 'cam', relYaw: Math.PI, pitch: 0.46, dist: 14},
  {kind: 'gesture', clip: 'Cheer', duration: 2.5},
  {kind: 'talk', text: "Contract one. In the bag."},
  {kind: 'walk_to', x: 4, z: 8, speed: 5},
];

// ─── PRODUCTION SCENES — cleared board + ClaudeCraft assets ──────────────────
// Each scene starts with a clean stage (world hidden). Only the cast characters
// and the listed stage assets appear. Positions are chosen so camera math is
// exact: we know every coordinate, so two-shot / OTS angles are deterministic.
//
// Stage coordinate system (all scenes share the same world space):
//   Characters face each other along X axis by convention (east ↔ west).
//   Camera two-shot: perpendicular (along Z), south of the pair.
//   "Vendor behind stall" = NPC at x+3 of stall center.
//
// Camera auto-cuts (see production_player.ts):
//   speech(autonate) → OTS on NPC side, Autonate face in frame
//   speech(npc)      → OTS behind Autonate, NPC over shoulder
//   cam(two_shot)    → perpendicular profile, both visible
//   cam(follow)      → chase cam behind Autonate (walk scenes)

export const EP001_PRODUCTION: ProductionBeat[] = [

  // ─── SCENE 1: ARRIVE ────────────────────────────────────────────────────────
  // Clear stage. Two stone archway columns frame the entrance to the vale.
  // A campfire at the side casts warm light. Autonate walks in and addresses camera.
  // Stage: archway at origin (entrance gate framing), campfire to the left.
  {
    id: 'arrive',
    label: '01 · Arrival',
    description: 'Autonate walks through the gate into Eastbrook Vale. Opening monologue.',
    stage: [
      {kind: 'archway',  x:  0, z: 14, facing: 0},
      {kind: 'campfire', x: -4, z:  8, facing: 0},
      {kind: 'sign',     x:  3, z: 14, facing: -0.3},
      {kind: 'barrel',   x:  2, z:  9, facing: 0},
    ],
    cast: [
      {id: 'autonate', startX: 0, startZ: 18, facing: Math.PI},
    ],
    acts: [
      {kind: 'cam', mode: 'follow'},
      {kind: 'walk_to', x: 0, z: 8, speed: 5},
      {kind: 'face', angle: Math.PI * 0.15},
      {kind: 'gesture', clip: 'Spellcast_Raise', duration: 1.2},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "Day one in Eastbrook Vale. I'm here to map the workforce and find my first consulting contract.",
        clip: 'Spellcast_Raise'},
      {kind: 'cam', mode: 'wide'},
      {kind: 'wait', seconds: 1.5},
    ],
  },

  // ─── SCENE 2: MEET ELARA ────────────────────────────────────────────────────
  // Two stone columns frame Elara's consultation space — a pavilion feel.
  // A table between them (where she works). A campfire adds ambiance.
  // Autonate approaches from the west, Elara stands east of the table.
  //
  // Coordinates:
  //   Table at (3, 0, 0). Elara at (5.5, 0, 0) behind/beside table, facing west.
  //   Autonate walks from (-6, 0, 0) to (-1, 0, 0), facing east.
  //   Two-shot: angleToNpc = atan2(5.5-(-1), 0) = atan2(6.5,0) = PI/2
  //   Camera perpendicular: camYaw = PI/2 + PI/2 = PI (camera to south, looking north)
  {
    id: 'meet_elara',
    label: '03 · Meet Elara',
    description: 'The Market Elder schools Autonate on the real nature of markets.',
    stage: [
      {kind: 'column',   x: 2,  z: -4, facing: 0},
      {kind: 'column',   x: 2,  z:  4, facing: 0},
      {kind: 'table',    x: 3,  z:  0, facing: Math.PI / 4},
      {kind: 'campfire', x: -3, z:  3, facing: 0},
      {kind: 'crate',    x:  7, z:  1, facing: 0.5},
    ],
    cast: [
      {id: 'autonate', startX: -6, startZ: 0, facing: Math.PI / 2},
      {id: 'elara',    startX:  6, startZ: 0, facing: -Math.PI / 2},
    ],
    acts: [
      {kind: 'cam', mode: 'follow'},
      {kind: 'walk_to', x: -1, z: 0, speed: 5},
      {kind: 'cam', mode: 'two_shot', npcId: 'elara'},
      {kind: 'wait', seconds: 0.5},
      {kind: 'speech', speaker: 'elara', speakerName: 'Elara',
        text: "You're not from here.", clip: 'Idle'},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "That obvious?", clip: 'Spellcast_Raise'},
      {kind: 'speech', speaker: 'elara', speakerName: 'Elara',
        text: "Only travelers look at the market like it's a THING. Locals just see it as life.", clip: 'Spellcasting'},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "What do you see?"},
      {kind: 'speech', speaker: 'elara', speakerName: 'Elara',
        text: "Seventeen simultaneous negotiations. A supply chain held by three families and one bridge. Three price bubbles about to pop.", clip: 'Spellcast_Raise'},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "How long did it take you to see all that?", clip: 'Spellcasting'},
      {kind: 'speech', speaker: 'elara', speakerName: 'Elara',
        text: "About as long as it takes anyone to realize... the market doesn't actually exist."},
    ],
  },

  // ─── SCENE 3: THEO ──────────────────────────────────────────────────────────
  // Theo stands behind his stall. Barrels and crates give depth.
  // Autonate walks up from the west and speaks across the stall counter.
  //
  // Coordinates:
  //   Stall at (3, 0, 0), facing west — Theo stands east of it.
  //   Theo at (6, 0, 0) facing west. Autonate walks to (0, 0, 0) facing east.
  //   Sep = 6. Two-shot: camYaw = PI, camDist ≈ 8. Camera south, looking north.
  {
    id: 'theo',
    label: '04 · Talk to Theo',
    description: 'Hardware vendor: the market is an information asymmetry problem.',
    stage: [
      {kind: 'stall',        x:  3,  z:  0, facing: Math.PI,     color: 0x226688},
      {kind: 'barrel_stack', x:  7,  z: -2, facing: 0.3},
      {kind: 'crate_stack',  x:  7,  z:  2, facing: -0.2},
      {kind: 'barrel',       x: -2,  z:  2, facing: 0},
    ],
    cast: [
      {id: 'autonate', startX: -5, startZ: 0, facing: Math.PI / 2},
      {id: 'theo',     startX:  6, startZ: 0, facing: -Math.PI / 2},
    ],
    acts: [
      {kind: 'cam', mode: 'follow'},
      {kind: 'walk_to', x: 0, z: 0, speed: 5},
      {kind: 'cam', mode: 'two_shot', npcId: 'theo'},
      {kind: 'wait', seconds: 0.4},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "Good tools. What does it cost to buy from you versus the next vendor?", clip: 'Idle'},
      {kind: 'speech', speaker: 'theo', speakerName: 'Theo',
        text: "Depends on the day. I adjust prices seventeen times a day based on rumors.", clip: 'Idle'},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "You're pricing by feel. What if you had real data? Actual demand curves?", clip: 'Spellcast_Raise'},
      {kind: 'speech', speaker: 'theo', speakerName: 'Theo',
        text: "I'd triple my margin inside a month. But data like that costs more than I make in a year.", clip: 'Spellcasting'},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "Maybe not.", clip: 'Idle'},
    ],
  },

  // ─── SCENE 4: MIN ───────────────────────────────────────────────────────────
  // Min has a food cart. Barrels of produce. Crate beside her.
  // Different from Theo's stall — smaller, warmer, more personal.
  //
  // Coordinates:
  //   Cart at (-2, 0, 0). Min at (-4, 0, 0) beside cart, facing east.
  //   Autonate walks to (2, 0, 0) facing west.
  //   Sep = 6. Two-shot same geometry as Theo scene.
  {
    id: 'min',
    label: '05 · Talk to Min',
    description: 'Min understands scarcity better than any economist.',
    stage: [
      {kind: 'cart',    x: -2,  z:  0, facing: Math.PI / 2,   color: 0xcc8822},
      {kind: 'barrel',  x: -5,  z:  2, facing: 0},
      {kind: 'barrel',  x: -5,  z: -1, facing: 0.4},
      {kind: 'crate',   x:  4,  z:  2, facing: -0.3},
      {kind: 'campfire',x:  4,  z: -3, facing: 0},
    ],
    cast: [
      {id: 'autonate', startX:  5, startZ: 0, facing: -Math.PI / 2},
      {id: 'min',      startX: -5, startZ: 0, facing:  Math.PI / 2},
    ],
    acts: [
      {kind: 'cam', mode: 'follow'},
      {kind: 'walk_to', x: 1, z: 0, speed: 5},
      {kind: 'cam', mode: 'two_shot', npcId: 'min'},
      {kind: 'wait', seconds: 0.4},
      {kind: 'speech', speaker: 'min', speakerName: 'Min',
        text: "Last of the season's harvest. Price doubles next week. That's the market, friend.", clip: 'Spellcast_Raise'},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "You're using scarcity to drive the price up.", clip: 'Spellcast_Raise'},
      {kind: 'speech', speaker: 'min', speakerName: 'Min',
        text: "I'm RESPONDING to scarcity. I didn't end the season. But I can read it. That's the difference between knowing the market and just surviving it.", clip: 'Spellcasting'},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "That's demand forecasting. You're doing it by feel.", clip: 'Idle'},
      {kind: 'speech', speaker: 'min', speakerName: 'Min',
        text: "Call it whatever you like. My family ate through winter. Did yours?", clip: 'Idle'},
    ],
  },

  // ─── SCENE 5: REVELATION ────────────────────────────────────────────────────
  // Back to Elara — same pavilion setup but tighter. Campfire more prominent.
  // Intimate. This is the turning point of the episode.
  // Same coordinate layout as meet_elara but characters closer together.
  {
    id: 'revelation',
    label: '06 · The Revelation',
    description: 'Elara confirms what Autonate has pieced together. The pattern is visible.',
    stage: [
      {kind: 'column',   x:  2, z: -4, facing: 0},
      {kind: 'column',   x:  2, z:  4, facing: 0},
      {kind: 'campfire', x: -2, z:  3, facing: 0},
      {kind: 'bench',    x:  5, z: -3, facing: 0.5},
    ],
    cast: [
      {id: 'autonate',         startX: -5, startZ: 0, facing: Math.PI / 2},
      {id: 'elara_revelation', startX:  5, startZ: 0, facing: -Math.PI / 2},
    ],
    acts: [
      {kind: 'cam', mode: 'follow'},
      {kind: 'walk_to', x: -1, z: 0, speed: 5},
      {kind: 'cam', mode: 'two_shot', npcId: 'elara_revelation'},
      {kind: 'wait', seconds: 0.5},
      {kind: 'speech', speaker: 'elara_revelation', speakerName: 'Elara',
        text: "So. What did you learn out there?", clip: 'Idle'},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "Every person in that market is making rational decisions based on incomplete information. The result is... chaotic order.", clip: 'Spellcasting'},
      {kind: 'speech', speaker: 'elara_revelation', speakerName: 'Elara',
        text: "Now you're ready to be dangerous.", clip: 'Spellcast_Raise'},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "How so?", clip: 'Idle'},
      {kind: 'speech', speaker: 'elara_revelation', speakerName: 'Elara',
        text: "Because you can see the patterns. And if you can see the patterns, you can show OTHERS the patterns. That... is worth paying for.", clip: 'Spellcasting'},
      {kind: 'gesture', clip: 'Cheer', duration: 1.8},
    ],
  },

  // ─── SCENE 6: FIRST PITCH ───────────────────────────────────────────────────
  // Back to Theo's stall — but this time Autonate is the one presenting.
  // Same stall props, Autonate enters with energy. The close.
  {
    id: 'pitch',
    label: '07 · First Pitch',
    description: 'Autonate delivers his first consulting pitch to Theo. Contract #1.',
    stage: [
      {kind: 'stall',        x:  3,  z:  0, facing: Math.PI, color: 0x226688},
      {kind: 'barrel_stack', x:  7,  z: -2, facing: 0.3},
      {kind: 'crate',        x:  7,  z:  2, facing: -0.2},
    ],
    cast: [
      {id: 'autonate',   startX: -5, startZ: 0, facing: Math.PI / 2},
      {id: 'theo_pitch', startX:  6, startZ: 0, facing: -Math.PI / 2},
    ],
    acts: [
      {kind: 'cam', mode: 'follow'},
      {kind: 'walk_to', x: 0, z: 0, speed: 5},
      {kind: 'cam', mode: 'two_shot', npcId: 'theo_pitch'},
      {kind: 'wait', seconds: 0.3},
      {kind: 'gesture', clip: 'Spellcast_Raise', duration: 0.8},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "Theo. What if I could tell you exactly when demand for tools peaks in this valley — and how to price differently for each type of buyer?",
        clip: 'Spellcast_Raise'},
      {kind: 'speech', speaker: 'theo_pitch', speakerName: 'Theo',
        text: "... You could do that?", clip: 'Idle'},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "That's what I do. I map the invisible architecture that everyone operates inside but nobody can see. And then I help you USE it.",
        clip: 'Spellcasting'},
      {kind: 'speech', speaker: 'theo_pitch', speakerName: 'Theo',
        text: "How much does that cost?", clip: 'Spellcast_Raise'},
      {kind: 'speech', speaker: 'autonate', speakerName: 'Autonate',
        text: "Less than one missed season. Meet me at the inn tonight.", clip: 'Cheer'},
      {kind: 'wait', seconds: 0.5},
      {kind: 'gesture', clip: 'Cheer', duration: 2.2},
    ],
  },
];
