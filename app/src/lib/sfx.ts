/**
 * Game-feel sound effects (D-020: "the app should feel like a game").
 *
 * All sounds are SYNTHESIZED with the Web Audio API at call time — no audio
 * assets, no network, no licensing, a few hundred bytes of recipe data. Each
 * effect is a tiny score of oscillator notes (or a filtered-noise sweep for
 * the whoosh), which is how short UI blips stay crisp at any output rate.
 *
 * Rules:
 * - SSR/test-safe: every entry point no-ops without window/AudioContext.
 * - Autoplay-policy-safe: the context is created lazily on the first play,
 *   which in practice always happens inside a user-gesture handler.
 * - Learner-controllable: a persisted enable flag; default on.
 * - Failure is silent (GATE-009 spirit): audio must never break the app.
 */

export type SfxName = "correct" | "wrong" | "complete" | "chest" | "pop" | "whoosh";

export const SFX_STORAGE_KEY = "ecolingo.sfx.enabled";

type Note = {
  /** oscillator frequency in Hz (start of the note) */
  freq: number;
  /** seconds after the effect starts */
  at: number;
  /** note length in seconds */
  dur: number;
  type?: OscillatorType;
  /** peak gain relative to the master (0..1] */
  gain?: number;
  /** optional frequency to glide to across the note */
  glideTo?: number;
};

/** Oscillator scores per effect. Exported for tests only. */
export const SFX_RECIPES: Record<Exclude<SfxName, "whoosh">, Note[]> = {
  // Duolingo-style double marimba hit: up a fourth, bright and short.
  correct: [
    { freq: 659.25, at: 0, dur: 0.12, type: "triangle", gain: 0.9 },
    { freq: 880, at: 0.09, dur: 0.16, type: "triangle", gain: 1 },
  ],
  // Two low soft buzzes — firm, not punishing.
  wrong: [
    { freq: 146.83, at: 0, dur: 0.12, type: "square", gain: 0.5 },
    { freq: 123.47, at: 0.16, dur: 0.18, type: "square", gain: 0.5 },
  ],
  // Rising major arpeggio + octave cap: end-of-lesson fanfare.
  complete: [
    { freq: 523.25, at: 0, dur: 0.14, type: "triangle", gain: 0.8 },
    { freq: 659.25, at: 0.11, dur: 0.14, type: "triangle", gain: 0.85 },
    { freq: 783.99, at: 0.22, dur: 0.14, type: "triangle", gain: 0.9 },
    { freq: 1046.5, at: 0.33, dur: 0.3, type: "triangle", gain: 1 },
  ],
  // Sparkle: fast high arpeggio, sine, like coins/reward.
  chest: [
    { freq: 880, at: 0, dur: 0.08, type: "sine", gain: 0.7 },
    { freq: 1108.73, at: 0.06, dur: 0.08, type: "sine", gain: 0.75 },
    { freq: 1318.51, at: 0.12, dur: 0.08, type: "sine", gain: 0.8 },
    { freq: 1760, at: 0.18, dur: 0.22, type: "sine", gain: 0.9 },
  ],
  // Tap feedback: a tiny downward blip.
  pop: [{ freq: 740, at: 0, dur: 0.06, type: "sine", gain: 0.6, glideTo: 420 }],
};

export function isSfxEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SFX_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setSfxEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SFX_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* storage unavailable — stay session-default */
  }
}

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

const MASTER_GAIN = 0.14;

function playNotes(ac: AudioContext, notes: Note[]) {
  const t0 = ac.currentTime + 0.01;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.setValueAtTime(n.freq, t0 + n.at);
    if (n.glideTo) osc.frequency.exponentialRampToValueAtTime(n.glideTo, t0 + n.at + n.dur);
    // fast attack, exponential release — avoids clicks at note edges
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(MASTER_GAIN * (n.gain ?? 1), t0 + n.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.02);
  }
}

/** Filtered-noise sweep for "whoosh" (streak / transitions). */
function playWhoosh(ac: AudioContext) {
  const dur = 0.32;
  const t0 = ac.currentTime + 0.01;
  const frames = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(300, t0);
  filter.frequency.exponentialRampToValueAtTime(1400, t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(MASTER_GAIN * 0.8, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/**
 * Fire-and-forget. Safe to call from any client event handler; no-ops on the
 * server, with audio disabled, or if Web Audio is unavailable/broken.
 */
export function playSfx(name: SfxName): void {
  try {
    if (!isSfxEnabled()) return;
    const ac = getContext();
    if (!ac) return;
    if (name === "whoosh") playWhoosh(ac);
    else playNotes(ac, SFX_RECIPES[name]);
  } catch {
    /* never let audio break the app */
  }
}
