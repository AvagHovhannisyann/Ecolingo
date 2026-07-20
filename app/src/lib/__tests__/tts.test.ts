import { describe, expect, it } from "vitest";
import {
  CHARACTER_VOICES,
  DEFAULT_VOICE,
  cleanForSpeech,
  resolveCharacterId,
  voiceFor,
} from "../tts";

describe("cleanForSpeech", () => {
  it("strips markdown, inline code, and LaTeX, and normalises whitespace", () => {
    expect(cleanForSpeech("**bold** and _italic_ text")).toBe("bold and italic text");
    // inline code is unwrapped; the bare * (not spoken anyway) is dropped with other markdown
    expect(cleanForSpeech("use `k*` here")).toBe("use k here");
    expect(cleanForSpeech("the value $x^2 + 1$ grows")).toBe("the value grows");
    expect(cleanForSpeech("line\n\n  two")).toBe("line two");
    expect(cleanForSpeech("### Heading")).toBe("Heading");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(cleanForSpeech("   \n  ")).toBe("");
  });
});

describe("resolveCharacterId", () => {
  it("derives a stable id from an art path", () => {
    expect(resolveCharacterId("/art-cast/pip.webp")).toBe("pip");
    expect(resolveCharacterId("/art-v2/eco-wave.webp")).toBe("eco-wave");
    expect(resolveCharacterId(null)).toBe("default");
    expect(resolveCharacterId("")).toBe("default");
  });
});

describe("voiceFor", () => {
  it("gives each known character a distinct voice and falls back to the default", () => {
    expect(voiceFor("pip").kokoroVoiceId).toBe(CHARACTER_VOICES.pip.kokoroVoiceId);
    expect(voiceFor("bo").kokoroVoiceId).toBe(CHARACTER_VOICES.bo.kokoroVoiceId);
    // distinct voices across the cast
    const ids = Object.values(CHARACTER_VOICES).map((v) => v.kokoroVoiceId);
    expect(new Set(ids).size).toBe(ids.length);
    // distinct browser pitches too, so the fallback voices differ
    const pitches = Object.values(CHARACTER_VOICES).map((v) => v.webPitch);
    expect(new Set(pitches).size).toBeGreaterThan(1);
    expect(voiceFor("unknown")).toBe(DEFAULT_VOICE);
    expect(voiceFor(undefined)).toBe(DEFAULT_VOICE);
  });
});
