import { describe, expect, it } from "vitest";
import {
  appendStyle,
  defaultTeachingStyle,
  isDefaultTeachingStyle,
  sanitizeTeachingStyle,
  styleToPromptFragment,
  VOICE_MAX,
  AVOID_MAX,
  type TeachingStyle,
} from "../teaching-style";

describe("defaultTeachingStyle / isDefaultTeachingStyle", () => {
  it("the default style is recognized as default and renders to nothing", () => {
    const d = defaultTeachingStyle();
    expect(isDefaultTeachingStyle(d)).toBe(true);
    expect(styleToPromptFragment(d)).toBe("");
  });

  it("any single non-default field flips it off default", () => {
    expect(isDefaultTeachingStyle({ ...defaultTeachingStyle(), tone: "warm" })).toBe(false);
    expect(isDefaultTeachingStyle({ ...defaultTeachingStyle(), useAnalogies: true })).toBe(false);
    expect(isDefaultTeachingStyle({ ...defaultTeachingStyle(), voice: "hi" })).toBe(false);
    // whitespace-only freeform still counts as default
    expect(isDefaultTeachingStyle({ ...defaultTeachingStyle(), voice: "   " })).toBe(true);
  });
});

describe("sanitizeTeachingStyle", () => {
  it("coerces garbage to the safe default", () => {
    expect(sanitizeTeachingStyle(null)).toEqual(defaultTeachingStyle());
    expect(sanitizeTeachingStyle("nope")).toEqual(defaultTeachingStyle());
    expect(sanitizeTeachingStyle(42)).toEqual(defaultTeachingStyle());
  });

  it("clamps unknown enum values back to defaults but keeps valid ones", () => {
    const s = sanitizeTeachingStyle({
      tone: "chaotic",
      approach: "socratic",
      encouragement: "hyper",
      readingLevel: "advanced",
    });
    expect(s.tone).toBe("neutral"); // invalid → default
    expect(s.approach).toBe("socratic"); // valid → kept
    expect(s.encouragement).toBe("some"); // invalid → default
    expect(s.readingLevel).toBe("advanced"); // valid → kept
  });

  it("coerces booleans strictly (only true is true) and trims + caps freeform", () => {
    const s = sanitizeTeachingStyle({
      useAnalogies: "yes",
      realWorldExamples: true,
      voice: "  hello  ",
      avoid: "x".repeat(AVOID_MAX + 50),
    });
    expect(s.useAnalogies).toBe(false); // "yes" !== true
    expect(s.realWorldExamples).toBe(true);
    expect(s.voice).toBe("hello");
    expect(s.avoid.length).toBe(AVOID_MAX);
  });

  it("caps voice to VOICE_MAX", () => {
    const s = sanitizeTeachingStyle({ voice: "v".repeat(VOICE_MAX + 100) });
    expect(s.voice.length).toBe(VOICE_MAX);
  });
});

describe("styleToPromptFragment", () => {
  it("includes a grounding guardrail and only the configured lines", () => {
    const style: TeachingStyle = {
      ...defaultTeachingStyle(),
      tone: "warm",
      approach: "socratic",
      useAnalogies: true,
      voice: "Talk like a patient TA.",
      avoid: "Never just give the answer.",
    };
    const frag = styleToPromptFragment(style);
    expect(frag).toContain("TEACHING STYLE");
    // guardrail: style never overrides grounding
    expect(frag).toContain("never invent");
    expect(frag).toContain("warm");
    expect(frag).toContain("Socratic");
    expect(frag).toContain("analogies");
    expect(frag).toContain("Talk like a patient TA.");
    expect(frag).toContain("AVOID");
    expect(frag).toContain("Never just give the answer.");
    // a default field emits no line
    expect(frag).not.toContain("Reading level");
  });

  it("returns empty string when every field is default", () => {
    expect(styleToPromptFragment(defaultTeachingStyle())).toBe("");
  });
});

describe("appendStyle", () => {
  const BASE = "BASE SYSTEM PROMPT";

  it("leaves the base prompt byte-for-byte unchanged for a default/absent style", () => {
    expect(appendStyle(BASE, undefined)).toBe(BASE);
    expect(appendStyle(BASE, null)).toBe(BASE);
    expect(appendStyle(BASE, defaultTeachingStyle())).toBe(BASE);
    expect(appendStyle(BASE, { tone: "garbage" })).toBe(BASE);
  });

  it("appends the rendered style block for a configured style", () => {
    const out = appendStyle(BASE, { tone: "playful" });
    expect(out.startsWith(BASE + "\n\n")).toBe(true);
    expect(out).toContain("playful");
    expect(out).toContain("TEACHING STYLE");
  });
});
