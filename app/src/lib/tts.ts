"use client";

/**
 * Voice engine (D-035) — 100% self-contained. NO server, NO API, NO external
 * app, NO npm dependency, NO network call. Click a read-aloud button and the
 * written text is spoken, entirely on the user's own device.
 *
 * Two engines, both built into the platform or written by us here:
 *   1. Web Speech (`window.speechSynthesis`) — the browser's OWN built-in voice
 *      engine. Not something we install or call out to; it ships in the browser
 *      and runs on-device. We pick the best available voice per character and
 *      tune rate/pitch. This is the primary, best-quality path.
 *   2. A from-scratch formant synthesizer we wrote in the Web Audio API
 *      (oscillator → bandpass "formant" filters → gain envelope). Pure code,
 *      zero data, guaranteed to work even with no system voices. Robotic, but
 *      it's entirely ours and never depends on anything.
 *
 * Honest limit: a *natural* neural voice is a trained model that must run on
 * big infra — impossible to hand-write with zero dependencies. This trades some
 * naturalness for total independence.
 *
 * Each character has its OWN voice (a preferred system voice + persona
 * pitch/rate, and a distinct synth pitch). `speak()` never throws into the UI;
 * the pure helpers are unit-tested.
 */

export interface CharacterVoice {
  id: string;
  label: string;
  /** preferred system-voice name substrings, best first (Web Speech) */
  voiceHints: string[];
  /** Web Speech persona */
  rate: number;
  pitch: number;
  /** base glottal pitch (Hz) for the from-scratch synth */
  synthPitchHz: number;
}

export const DEFAULT_VOICE: CharacterVoice = {
  id: "default",
  label: "Narrator",
  voiceHints: ["Google US English", "Samantha", "Microsoft Aria", "Alex"],
  rate: 0.98,
  pitch: 1.0,
  synthPitchHz: 150,
};

/** Per-character voices, keyed by the character id derived from its art path. */
export const CHARACTER_VOICES: Record<string, CharacterVoice> = {
  "eco-wave": {
    id: "eco-wave",
    label: "Eco",
    voiceHints: ["Samantha", "Google US English", "Microsoft Aria", "Jenny", "female"],
    rate: 0.98,
    pitch: 1.06,
    synthPitchHz: 165,
  },
  pip: {
    id: "pip",
    label: "Pip",
    voiceHints: ["Google UK English Female", "Kate", "Martha", "Microsoft Clara", "female"],
    rate: 1.08,
    pitch: 1.3,
    synthPitchHz: 240,
  },
  lumi: {
    id: "lumi",
    label: "Lumi",
    voiceHints: ["Victoria", "Google US English", "Microsoft Ava", "Ava", "female"],
    rate: 0.95,
    pitch: 1.12,
    synthPitchHz: 195,
  },
  bo: {
    id: "bo",
    label: "Bo",
    voiceHints: ["Daniel", "Google UK English Male", "Microsoft Guy", "Alex", "male"],
    rate: 0.95,
    pitch: 0.85,
    synthPitchHz: 108,
  },
};

/** Derive a stable character id from an art path, e.g. "/art-cast/pip.webp" → "pip". */
export function resolveCharacterId(src: string | undefined | null): string {
  if (!src) return "default";
  const file = src.split("/").pop() ?? "";
  return file.replace(/\.[a-z0-9]+$/i, "").toLowerCase() || "default";
}

export function voiceFor(characterId: string | undefined | null): CharacterVoice {
  if (!characterId) return DEFAULT_VOICE;
  return CHARACTER_VOICES[characterId] ?? DEFAULT_VOICE;
}

/** Strip markup that shouldn't be read aloud and normalise whitespace. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\$\$?[^$]*\$?\$/g, " ")
    .replace(/\\\(([^)]*)\\\)/g, " ")
    .replace(/[*_#>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Minimal shape of a Web Speech voice, so this is testable without a DOM. */
export interface VoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
}

/**
 * Choose the best system voice for a character from the device's voice list:
 * first a name/hint match (preferring English), then any English voice, then
 * the first voice. Pure — unit-tested with plain objects.
 */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], hints: readonly string[]): T | null {
  if (!voices.length) return null;
  const en = voices.filter((v) => /^en(-|$)/i.test(v.lang));
  const pool = en.length ? en : voices;
  for (const hint of hints) {
    const h = hint.toLowerCase();
    const hit = pool.find((v) => v.name.toLowerCase().includes(h));
    if (hit) return hit;
  }
  return pool[0] ?? voices[0];
}

// ── from-scratch formant synth: text → voiced "phoneme" tokens ──────────────

interface SynthToken {
  f1: number;
  f2: number;
  amp: number;
  dur: number;
}

const VOWEL_FORMANTS: Record<string, [number, number]> = {
  a: [800, 1150],
  e: [500, 1900],
  i: [320, 2500],
  o: [500, 900],
  u: [320, 800],
  y: [300, 1700],
};

/**
 * Turn text into a stream of formant tokens for the synth: vowels are voiced
 * with their characteristic formants, consonants are shorter/quieter, spaces
 * and sentence punctuation insert pauses. Bounded so long text can't schedule
 * unbounded audio events. Exported for a lightweight unit test.
 */
export function tokenizeForSynth(text: string, max = 260): SynthToken[] {
  const out: SynthToken[] = [];
  const s = text.toLowerCase();
  for (let i = 0; i < s.length && out.length < max; i++) {
    const c = s[i];
    if (c === " ") {
      out.push({ f1: 0, f2: 0, amp: 0, dur: 0.07 });
    } else if (".!?;:".includes(c)) {
      out.push({ f1: 0, f2: 0, amp: 0, dur: 0.22 });
    } else if (VOWEL_FORMANTS[c]) {
      const [f1, f2] = VOWEL_FORMANTS[c];
      out.push({ f1, f2, amp: 0.55, dur: 0.14 });
    } else if (/[a-z]/.test(c)) {
      // consonant: a brief, quieter, mid-formant articulation
      out.push({ f1: 450, f2: 1500, amp: 0.22, dur: 0.06 });
    }
    // other characters are skipped
  }
  return out;
}

export interface SpeakOptions {
  characterId?: string;
  /** amplitude 0..1, ~per animation frame, for the talking animation */
  onLevel?: (level: number) => void;
  onEnd?: () => void;
}

export interface SpeakHandle {
  stop: () => void;
}

let current: SpeakHandle | null = null;

export function stopSpeaking(): void {
  current?.stop();
  current = null;
}

type AudioCtor = typeof AudioContext;

function getAudioCtor(): AudioCtor | undefined {
  return window.AudioContext || (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
}

/**
 * Speak `text`, entirely on-device. Cancels any in-flight speech first. Never
 * throws — on any failure it settles onEnd and returns a no-op handle.
 */
export function speak(text: string, opts: SpeakOptions = {}): SpeakHandle {
  const noop: SpeakHandle = { stop: () => {} };
  if (typeof window === "undefined") return noop;
  const cleaned = cleanForSpeech(text);
  if (!cleaned) {
    opts.onEnd?.();
    return noop;
  }
  stopSpeaking();
  const voice = voiceFor(opts.characterId);

  let ended = false;
  let cleanup = () => {};
  const end = () => {
    if (ended) return;
    ended = true;
    opts.onLevel?.(0);
    opts.onEnd?.();
  };
  const handle: SpeakHandle = {
    stop: () => {
      cleanup();
      end();
    },
  };
  current = handle;

  const runSynth = () => synthSpeak(cleaned, voice, opts, (fn) => (cleanup = fn), end);

  // Prefer the browser's built-in voice engine when it has voices; otherwise
  // fall back to our own synth. Web Speech errors also fall back to the synth.
  try {
    const synth = window.speechSynthesis;
    const voices = synth ? synth.getVoices() : [];
    if (synth && voices.length > 0) {
      webSpeak(cleaned, voice, voices, opts, (fn) => (cleanup = fn), end, runSynth);
      return handle;
    }
  } catch {
    /* fall through to synth */
  }
  runSynth();
  return handle;
}

// ── Web Speech (browser built-in) ───────────────────────────────────────────
function webSpeak(
  text: string,
  voice: CharacterVoice,
  voices: SpeechSynthesisVoice[],
  opts: SpeakOptions,
  setCleanup: (fn: () => void) => void,
  end: () => void,
  fallback: () => void,
) {
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const chosen = pickVoice(voices, voice.voiceHints);
    if (chosen) u.voice = chosen;
    u.rate = voice.rate;
    u.pitch = voice.pitch;
    // A gentle talking oscillation while speaking (no amplitude data here),
    // nudged on each word boundary so it reads as speech, not a metronome.
    let t = 0;
    const timer = opts.onLevel
      ? window.setInterval(() => {
          t += 1;
          opts.onLevel?.(0.35 + 0.35 * Math.abs(Math.sin(t / 2)));
        }, 90)
      : 0;
    let started = false;
    const stopTimer = () => timer && window.clearInterval(timer);
    setCleanup(() => {
      stopTimer();
      try {
        synth.cancel();
      } catch {}
    });
    u.onstart = () => (started = true);
    u.onboundary = () => opts.onLevel?.(0.9);
    u.onend = () => {
      stopTimer();
      end();
    };
    u.onerror = () => {
      stopTimer();
      // If it never actually produced speech, use our own synth instead.
      if (!started) fallback();
      else end();
    };
    (u as SpeechSynthesisUtterance & { _keep?: boolean })._keep = true; // GC guard
    synth.speak(u);
  } catch {
    fallback();
  }
}

// ── from-scratch formant synthesizer (our own code, Web Audio) ───────────────
function synthSpeak(
  text: string,
  voice: CharacterVoice,
  opts: SpeakOptions,
  setCleanup: (fn: () => void) => void,
  end: () => void,
) {
  const Ctor = getAudioCtor();
  if (!Ctor) return end();
  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return end();
  }
  void ctx.resume();

  const master = ctx.createGain();
  master.gain.value = 0;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  master.connect(analyser);
  analyser.connect(ctx.destination);

  // Two formant bandpass filters give the buzz a vowel-like colour.
  const f1 = ctx.createBiquadFilter();
  f1.type = "bandpass";
  f1.Q.value = 7;
  const f2 = ctx.createBiquadFilter();
  f2.type = "bandpass";
  f2.Q.value = 9;
  f1.connect(master);
  f2.connect(master);

  const osc = ctx.createOscillator();
  osc.type = "sawtooth"; // glottal-ish source
  osc.frequency.value = voice.synthPitchHz;
  osc.connect(f1);
  osc.connect(f2);

  const tokens = tokenizeForSynth(text);
  let cursor = ctx.currentTime + 0.03;
  let prevF1 = 500;
  let prevF2 = 1500;
  for (const tk of tokens) {
    if (tk.amp === 0) {
      master.gain.setTargetAtTime(0, cursor, 0.02);
      cursor += tk.dur;
      continue;
    }
    f1.frequency.setValueAtTime(prevF1, cursor);
    f2.frequency.setValueAtTime(prevF2, cursor);
    f1.frequency.linearRampToValueAtTime(tk.f1, cursor + tk.dur * 0.5);
    f2.frequency.linearRampToValueAtTime(tk.f2, cursor + tk.dur * 0.5);
    prevF1 = tk.f1;
    prevF2 = tk.f2;
    master.gain.setTargetAtTime(tk.amp, cursor, 0.015);
    master.gain.setTargetAtTime(tk.amp * 0.5, cursor + tk.dur * 0.6, 0.02);
    cursor += tk.dur;
  }
  master.gain.setTargetAtTime(0, cursor, 0.03);
  const stopAt = cursor + 0.12;

  let raf = 0;
  const done = () => {
    cancelAnimationFrame(raf);
    try {
      osc.stop();
    } catch {}
    try {
      void ctx.close();
    } catch {}
    end();
  };
  setCleanup(done);

  try {
    osc.start();
    osc.stop(stopAt);
    osc.onended = done;
    if (opts.onLevel) {
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const x = (data[i] - 128) / 128;
          sum += x * x;
        }
        opts.onLevel?.(Math.min(1, Math.sqrt(sum / data.length) * 3.5));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
  } catch {
    done();
  }
}
