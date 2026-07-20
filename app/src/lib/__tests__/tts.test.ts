import { describe, expect, it } from "vitest";
import {
  CHARACTER_VOICES,
  DEFAULT_VOICE,
  cleanForSpeech,
  pickVoice,
  resolveCharacterId,
  tokenizeForSynth,
  voiceFor,
  type VoiceLike,
} from "../tts";

describe("cleanForSpeech", () => {
  it("strips markdown, inline code, and LaTeX, and normalises whitespace", () => {
    expect(cleanForSpeech("**bold** and _italic_ text")).toBe("bold and italic text");
    expect(cleanForSpeech("use `k*` here")).toBe("use k here");
    expect(cleanForSpeech("the value $x^2 + 1$ grows")).toBe("the value grows");
    expect(cleanForSpeech("line\n\n  two")).toBe("line two");
    expect(cleanForSpeech("### Heading")).toBe("Heading");
  });
  it("returns empty for whitespace-only input", () => {
    expect(cleanForSpeech("   \n ")).toBe("");
  });
});

describe("resolveCharacterId", () => {
  it("derives a stable id from an art path", () => {
    expect(resolveCharacterId("/art-cast/pip.webp")).toBe("pip");
    expect(resolveCharacterId("/art-v2/eco-wave.webp")).toBe("eco-wave");
    expect(resolveCharacterId(null)).toBe("default");
  });
});

describe("voiceFor", () => {
  it("gives each character a distinct persona (pitch + synth pitch) and falls back to default", () => {
    const pitches = Object.values(CHARACTER_VOICES).map((v) => v.pitch);
    expect(new Set(pitches).size).toBeGreaterThan(1);
    const synth = Object.values(CHARACTER_VOICES).map((v) => v.synthPitchHz);
    expect(new Set(synth).size).toBe(synth.length); // all distinct
    expect(voiceFor("unknown")).toBe(DEFAULT_VOICE);
    expect(voiceFor("pip").synthPitchHz).toBe(CHARACTER_VOICES.pip.synthPitchHz);
  });
});

describe("pickVoice", () => {
  const voices: VoiceLike[] = [
    { name: "Google US English", lang: "en-US" },
    { name: "Daniel", lang: "en-GB" },
    { name: "Amélie", lang: "fr-FR" },
    { name: "Samantha", lang: "en-US" },
  ];
  it("prefers a hint match within English voices", () => {
    expect(pickVoice(voices, ["Daniel", "Alex"])?.name).toBe("Daniel");
    expect(pickVoice(voices, ["Samantha"])?.name).toBe("Samantha");
  });
  it("falls back to the first English voice when no hint matches, never a non-English one", () => {
    expect(pickVoice(voices, ["Nonexistent"])?.lang).toMatch(/^en/);
  });
  it("returns null for an empty list", () => {
    expect(pickVoice([], ["x"])).toBeNull();
  });
});

describe("tokenizeForSynth (from-scratch synth)", () => {
  it("voices vowels with their formants and inserts pauses for spaces/punctuation", () => {
    const toks = tokenizeForSynth("go.");
    // 'g' consonant, 'o' vowel, '.' pause
    expect(toks).toHaveLength(3);
    const vowel = toks[1];
    expect(vowel.amp).toBeGreaterThan(0);
    expect(vowel.f1).toBe(500); // 'o' formant
    expect(toks[2].amp).toBe(0); // sentence pause is silent
    // a space is a short silence
    expect(tokenizeForSynth("a b").some((t) => t.amp === 0 && t.dur > 0)).toBe(true);
  });
  it("is bounded so long text can't schedule unbounded audio", () => {
    expect(tokenizeForSynth("a".repeat(5000)).length).toBeLessThanOrEqual(260);
  });
});
