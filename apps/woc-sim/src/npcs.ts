// NPC system — episode characters placed in the world.
// Each NPC has a model, world position, and a dialogue sequence.
// Proximity detection + E-key interaction handled in scene.ts.

export type DialogueLine = {
  speaker: string;      // display name — "Elara", "Autonate", etc.
  isAutonate: boolean;  // true = right-aligned, Autonate clip plays
  text: string;
  npcClip?:     string; // animation for NPC while speaking
  autonateClip?: string; // animation for Autonate while speaking
};

export type EpisodeNpc = {
  id:      string;
  name:    string;
  role:    string;
  model:   string;     // KayKit GLB filename (e.g. 'druid.glb')
  x:       number;
  z:       number;
  facing:  number;     // rotation.y in radians
  colour?: number;     // optional skin/clothing tint override (hex)
  dialogue: DialogueLine[];
};

export const INTERACTION_RADIUS = 6; // world units — within this, prompt shows
