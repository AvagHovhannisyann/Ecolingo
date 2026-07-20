"use client";

/**
 * Voice engine (D-033). Click a read-aloud button → the written text is spoken.
 *
 * Two tiers, chosen automatically so audio ALWAYS works (GATE-009):
 *   1. Neural (ElevenLabs) via /api/tts — natural, professional. Used when the
 *      server has a key. The clip's amplitude is metered (Web Audio) so a
 *      character can "talk" in sync with the actual sound.
 *   2. Browser (Web Speech) fallback — free, on-device, no key. Used when the
 *      neural route degrades (503) or errors, or as the only option offline.
 *
 * Each character has its OWN voice (a distinct ElevenLabs voice id + a distinct
 * browser pitch/rate), so the ensemble sounds like different people.
 *
 * `speak()` is browser-only and defensive: audio must never throw into the UI.
 * The pure helpers (cleanForSpeech, resolveCharacterId, voiceFor) are unit-tested.
 */

export interface CharacterVoice {
  id: string;
  label: string;
  /** ElevenLabs voice id for the neural path */
  elevenVoiceId: string;
  /** Web Speech knobs for the fallback path */
  webRate: number;
  webPitch: number;
}

export const DEFAULT_VOICE: CharacterVoice = {
  id: "default",
  label: "Narrator",
  elevenVoiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel — warm, professional
  webRate: 0.98,
  webPitch: 1.0,
};

/** Per-character voices, keyed by the character id derived from its art path. */
export const CHARACTER_VOICES: Record<string, CharacterVoice> = {
  "eco-wave": { id: "eco-wave", label: "Eco", elevenVoiceId: "21m00Tcm4TlvDq8ikWAM", webRate: 0.98, webPitch: 1.05 },
  pip: { id: "pip", label: "Pip", elevenVoiceId: "MF3mGyEYCl7XYWbV9V6O", webRate: 1.06, webPitch: 1.28 }, // Elli — bright
  lumi: { id: "lumi", label: "Lumi", elevenVoiceId: "EXAVITQu4vr4xnSDxMaL", webRate: 0.96, webPitch: 1.12 }, // Bella — warm
  bo: { id: "bo", label: "Bo", elevenVoiceId: "pNInz6obpgDQGcFmaJgB", webRate: 0.95, webPitch: 0.9 }, // Adam — deep
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
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/\$\$?[^$]*\$?\$/g, " ") // LaTeX $…$ / $$…$$
    .replace(/\\\(([^)]*)\\\)/g, " ") // LaTeX \(…\)
    .replace(/[*_#>]+/g, " ") // markdown emphasis / headings / quotes
    .replace(/\s+/g, " ")
    .trim();
}

export interface SpeakOptions {
  characterId?: string;
  /** amplitude 0..1, ~per animation frame, for a talking animation */
  onLevel?: (level: number) => void;
  onEnd?: () => void;
}

/** A running utterance the caller can stop. */
export interface SpeakHandle {
  stop: () => void;
}

let current: SpeakHandle | null = null;

/** Stop whatever is currently speaking. */
export function stopSpeaking(): void {
  current?.stop();
  current = null;
}

type AudioCtor = typeof AudioContext;

/**
 * Speak `text`. Cancels any in-flight speech first. Returns a handle whose
 * stop() halts playback. Never throws — on any failure it calls onEnd and
 * returns a no-op handle so the button state always resettles.
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
  const end = () => {
    if (ended) return;
    ended = true;
    opts.onLevel?.(0);
    opts.onEnd?.();
  };

  // ── try neural first ────────────────────────────────────────────────────
  let audio: HTMLAudioElement | null = null;
  let ctx: AudioContext | null = null;
  let raf = 0;
  let objectUrl = "";
  const cleanupNeural = () => {
    cancelAnimationFrame(raf);
    try {
      audio?.pause();
    } catch {}
    try {
      void ctx?.close();
    } catch {}
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };

  const handle: SpeakHandle = {
    stop: () => {
      cleanupNeural();
      try {
        window.speechSynthesis?.cancel();
      } catch {}
      end();
    },
  };
  current = handle;

  void (async () => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleaned, voiceId: voice.elevenVoiceId }),
      });
      const type = res.headers.get("content-type") || "";
      if (res.ok && type.startsWith("audio/")) {
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        audio = new Audio(objectUrl);
        // Meter amplitude for the talking animation (best-effort).
        try {
          const Ctor: AudioCtor | undefined =
            window.AudioContext || (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
          if (Ctor && opts.onLevel) {
            ctx = new Ctor();
            void ctx.resume();
            const srcNode = ctx.createMediaElementSource(audio);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            srcNode.connect(analyser);
            analyser.connect(ctx.destination);
            const data = new Uint8Array(analyser.fftSize);
            const tick = () => {
              analyser.getByteTimeDomainData(data);
              let sum = 0;
              for (let i = 0; i < data.length; i++) {
                const x = (data[i] - 128) / 128;
                sum += x * x;
              }
              opts.onLevel?.(Math.min(1, Math.sqrt(sum / data.length) * 3.2));
              raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          }
        } catch {
          /* metering is optional — audio still plays */
        }
        audio.onended = () => {
          cleanupNeural();
          end();
        };
        audio.onerror = () => {
          cleanupNeural();
          end();
        };
        if (current === handle) await audio.play();
        return;
      }
    } catch {
      /* fall through to the browser voice */
    }
    // ── browser fallback ──────────────────────────────────────────────────
    if (current !== handle) return; // superseded meanwhile
    try {
      const synth = window.speechSynthesis;
      if (!synth) return end();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(cleaned);
      u.rate = voice.webRate;
      u.pitch = voice.webPitch;
      // A gentle talking oscillation while speaking (no amplitude data here),
      // nudged on each word boundary so it reads as speech, not a metronome.
      let t = 0;
      const timer = opts.onLevel
        ? window.setInterval(() => {
            t += 1;
            opts.onLevel?.(0.35 + 0.35 * Math.abs(Math.sin(t / 2)));
          }, 90)
        : 0;
      const stopTimer = () => {
        if (timer) window.clearInterval(timer);
      };
      u.onboundary = () => opts.onLevel?.(0.9);
      u.onend = () => {
        stopTimer();
        end();
      };
      u.onerror = () => {
        stopTimer();
        end();
      };
      // keep a ref alive so some engines don't GC mid-utterance
      (handle as SpeakHandle & { _u?: SpeechSynthesisUtterance })._u = u;
      synth.speak(u);
    } catch {
      end();
    }
  })();

  return handle;
}
