// Web Audio API sound system — procedural SFX, no audio file dependencies

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  // Recreate if context ended up in a "closed" state (happens after node flooding)
  if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
  return ctx;
}

function resume(): void {
  const c = getCtx();
  // resume() returns a Promise — calling it is enough; no need to await here
  if (c.state === 'suspended') void c.resume();
}

// Called by the sound toggle button — ensures the AudioContext is live before first sound
export function ensureAudioReady(): void {
  resume();
}

type Envelope = { attack?: number; decay?: number; sustain?: number; release?: number };

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  gainVal = 0.18,
  env: Envelope = {},
): void {
  const c = getCtx();
  resume();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);

  osc.type = type;
  osc.frequency.value = frequency;

  const now = c.currentTime;
  const attack = env.attack ?? 0.01;
  const decay = env.decay ?? 0.08;
  const sustain = env.sustain ?? gainVal * 0.6;
  const release = env.release ?? 0.15;

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(gainVal, now + attack);
  gain.gain.linearRampToValueAtTime(sustain, now + attack + decay);
  gain.gain.setValueAtTime(sustain, now + duration - release);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  osc.start(now);
  osc.stop(now + duration);
}

function playNoise(duration: number, gainVal = 0.06, filterFreq = 800): void {
  const c = getCtx();
  resume();
  const bufferSize = c.sampleRate * duration;
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const source = c.createBufferSource();
  source.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  filter.Q.value = 0.8;

  const gain = c.createGain();
  source.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);

  const now = c.currentTime;
  gain.gain.setValueAtTime(gainVal, now);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  source.start(now);
  source.stop(now + duration);
}

// ─── NAMED SOUNDS ────────────────────────────────────────────────────────────

let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

function guard(): boolean {
  return muted;
}

/** Agent becomes employed — ascending chord */
export function playEmployed(): void {
  if (guard()) return;
  playTone(440, 0.18, 'sine', 0.14, { attack: 0.01, release: 0.12 });
  setTimeout(() => playTone(554, 0.18, 'sine', 0.12, { attack: 0.01, release: 0.12 }), 60);
  setTimeout(() => playTone(659, 0.28, 'sine', 0.14, { attack: 0.01, release: 0.20 }), 130);
}

/** Agent enters training — soft ascending blip */
export function playTrainingStart(): void {
  if (guard()) return;
  playTone(330, 0.12, 'triangle', 0.1, { attack: 0.005, release: 0.09 });
  setTimeout(() => playTone(440, 0.14, 'triangle', 0.1, { attack: 0.005, release: 0.10 }), 80);
}

/** Agent becomes aware — gentle ping */
export function playAware(): void {
  if (guard()) return;
  playTone(660, 0.10, 'sine', 0.08, { attack: 0.005, decay: 0.05, release: 0.08 });
}

/** Networking interaction — social spark */
export function playNetworking(): void {
  if (guard()) return;
  playTone(880, 0.08, 'sine', 0.07, { attack: 0.003, release: 0.06 });
  setTimeout(() => playTone(1100, 0.08, 'triangle', 0.06, { attack: 0.003, release: 0.06 }), 50);
}

/** Program dropped onto map — impact thud */
export function playProgramDrop(): void {
  if (guard()) return;
  playTone(80, 0.25, 'sawtooth', 0.2, { attack: 0.005, decay: 0.15, sustain: 0, release: 0.08 });
  playNoise(0.22, 0.08, 400);
  setTimeout(() => playTone(200, 0.20, 'sine', 0.12, { attack: 0.01, release: 0.15 }), 40);
}

/** Week advance — tick */
export function playWeekTick(): void {
  if (guard()) return;
  playTone(1200, 0.06, 'square', 0.04, { attack: 0.002, release: 0.04 });
}

/** Bottleneck detected — alert */
export function playBottleneckAlert(): void {
  if (guard()) return;
  playTone(220, 0.30, 'sawtooth', 0.1, { attack: 0.01, decay: 0.1, sustain: 0.06, release: 0.15 });
  setTimeout(() => playTone(180, 0.30, 'sawtooth', 0.08, { attack: 0.01, release: 0.18 }), 200);
}

/** Playback start/resume */
export function playResume(): void {
  if (guard()) return;
  playTone(440, 0.12, 'triangle', 0.1, { attack: 0.02, release: 0.10 });
  setTimeout(() => playTone(550, 0.12, 'triangle', 0.09, { attack: 0.02, release: 0.10 }), 80);
}

/** Playback pause */
export function playPause(): void {
  if (guard()) return;
  playTone(550, 0.10, 'triangle', 0.09, { attack: 0.01, release: 0.08 });
  setTimeout(() => playTone(440, 0.14, 'triangle', 0.08, { attack: 0.01, release: 0.10 }), 70);
}

/** UI click — subtle */
export function playClick(): void {
  if (guard()) return;
  playTone(800, 0.05, 'square', 0.04, { attack: 0.002, release: 0.04 });
}

/** Modal open */
export function playModalOpen(): void {
  if (guard()) return;
  playTone(600, 0.08, 'sine', 0.07, { attack: 0.01, release: 0.06 });
  setTimeout(() => playTone(800, 0.10, 'sine', 0.07, { attack: 0.01, release: 0.08 }), 60);
}

/** Agent stress — descending glitch */
export function playStress(): void {
  if (guard()) return;
  playNoise(0.15, 0.06, 300);
  setTimeout(() => playTone(150, 0.12, 'sawtooth', 0.07, { attack: 0.005, release: 0.10 }), 30);
}
