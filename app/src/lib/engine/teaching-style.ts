/**
 * Teaching style — "teach like me" (D-029).
 *
 * A teacher describes HOW they teach: tone, pedagogical approach, how much
 * encouragement, reading level, whether to lean on analogies / real-world
 * examples, plus two freeform fields (their own words, and things to avoid).
 * That description is rendered into a compact instruction block and layered
 * onto every AI system prompt — the course compiler, the item-writer, and the
 * student-facing tutor — so the AI adopts THIS teacher's voice and approach.
 *
 * Hard boundary (GATE-001 / GATE-002): the style shapes TONE and STRUCTURE
 * only. It never licenses the model to invent facts, numbers, equations, or
 * citations — the rendered block says so explicitly, and the grounding rules in
 * each system prompt still stand. A default (unconfigured) style renders to the
 * empty string, so prompts are byte-for-byte unchanged until a teacher opts in.
 *
 * Pure and dependency-free so it is trivially unit-tested and safe to import on
 * both the client (the editor, the compile client) and the server (the API
 * routes that must re-sanitize whatever the client sends — never trust it).
 */

export type TeacherTone = "neutral" | "warm" | "rigorous" | "playful";
export type TeachingApproach =
  | "balanced"
  | "intuition_first"
  | "formal_first"
  | "socratic"
  | "example_driven";
export type Encouragement = "some" | "high" | "minimal";
export type ReadingLevel = "standard" | "simple" | "advanced";

export interface TeachingStyle {
  version: 1;
  tone: TeacherTone;
  approach: TeachingApproach;
  encouragement: Encouragement;
  readingLevel: ReadingLevel;
  useAnalogies: boolean;
  realWorldExamples: boolean;
  /** freeform: the teacher's own words for how the AI should sound */
  voice: string;
  /** freeform: things the AI should never do in this course */
  avoid: string;
}

export const VOICE_MAX = 800;
export const AVOID_MAX = 400;

const TONES: readonly TeacherTone[] = ["neutral", "warm", "rigorous", "playful"];
const APPROACHES: readonly TeachingApproach[] = [
  "balanced",
  "intuition_first",
  "formal_first",
  "socratic",
  "example_driven",
];
const ENCOURAGEMENTS: readonly Encouragement[] = ["some", "high", "minimal"];
const READING_LEVELS: readonly ReadingLevel[] = ["standard", "simple", "advanced"];

export function defaultTeachingStyle(): TeachingStyle {
  return {
    version: 1,
    tone: "neutral",
    approach: "balanced",
    encouragement: "some",
    readingLevel: "standard",
    useAnalogies: false,
    realWorldExamples: false,
    voice: "",
    avoid: "",
  };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Coerce anything (localStorage blob, request body) into a valid TeachingStyle:
 * every enum clamped to its allowed set, booleans coerced, freeform trimmed and
 * length-capped. Never throws — an unrecognized input degrades to the default
 * (which renders to no prompt change at all).
 */
export function sanitizeTeachingStyle(raw: unknown): TeachingStyle {
  if (!raw || typeof raw !== "object") return defaultTeachingStyle();
  const r = raw as Record<string, unknown>;
  return {
    version: 1,
    tone: oneOf(r.tone, TONES, "neutral"),
    approach: oneOf(r.approach, APPROACHES, "balanced"),
    encouragement: oneOf(r.encouragement, ENCOURAGEMENTS, "some"),
    readingLevel: oneOf(r.readingLevel, READING_LEVELS, "standard"),
    useAnalogies: r.useAnalogies === true,
    realWorldExamples: r.realWorldExamples === true,
    voice: typeof r.voice === "string" ? r.voice.trim().slice(0, VOICE_MAX) : "",
    avoid: typeof r.avoid === "string" ? r.avoid.trim().slice(0, AVOID_MAX) : "",
  };
}

/** True when the style is entirely defaults + no freeform — i.e. nothing to inject. */
export function isDefaultTeachingStyle(style: TeachingStyle): boolean {
  const d = defaultTeachingStyle();
  return (
    style.tone === d.tone &&
    style.approach === d.approach &&
    style.encouragement === d.encouragement &&
    style.readingLevel === d.readingLevel &&
    style.useAnalogies === d.useAnalogies &&
    style.realWorldExamples === d.realWorldExamples &&
    style.voice.trim() === "" &&
    style.avoid.trim() === ""
  );
}

const TONE_LINE: Record<TeacherTone, string> = {
  neutral: "",
  warm: "Tone: warm, friendly and encouraging.",
  rigorous: "Tone: precise and rigorous — hold a high bar and be exact.",
  playful: "Tone: playful and light, with a little humor where it fits.",
};

const APPROACH_LINE: Record<TeachingApproach, string> = {
  balanced: "",
  intuition_first: "Approach: build the intuition first, then introduce the formal definition.",
  formal_first: "Approach: state the precise definition first, then unpack the intuition behind it.",
  socratic: "Approach: teach Socratically — guide with a leading question before revealing the answer.",
  example_driven: "Approach: lead with a concrete example, then generalise to the idea.",
};

const ENCOURAGEMENT_LINE: Record<Encouragement, string> = {
  some: "",
  high: "Be especially encouraging: acknowledge effort and reassure the learner when the material is hard.",
  minimal: "Keep encouragement minimal and matter-of-fact — focus on the content, not praise.",
};

const READING_LINE: Record<ReadingLevel, string> = {
  standard: "",
  simple: "Reading level: use simple, plain language a beginner can follow; avoid jargon unless you define it.",
  advanced: "Reading level: you may use precise, advanced terminology and assume a strong background.",
};

/**
 * Render the style into a system-prompt block. Returns "" for a default style
 * so callers can append unconditionally without changing unconfigured prompts.
 * The leading guardrail keeps the style subordinate to grounding.
 */
export function styleToPromptFragment(style: TeachingStyle): string {
  if (isDefaultTeachingStyle(style)) return "";
  const lines: string[] = [];
  const push = (s: string) => {
    if (s) lines.push(`- ${s}`);
  };
  push(TONE_LINE[style.tone]);
  push(APPROACH_LINE[style.approach]);
  if (style.useAnalogies) push("Lean on everyday analogies and mental pictures to make ideas stick.");
  if (style.realWorldExamples) push("Bring in real-world examples where they illuminate the concept.");
  push(READING_LINE[style.readingLevel]);
  push(ENCOURAGEMENT_LINE[style.encouragement]);
  if (style.voice) push(`In the teacher's own words (match this voice): "${style.voice}"`);
  if (style.avoid) push(`The teacher asks you to AVOID: "${style.avoid}"`);
  if (lines.length === 0) return "";
  return (
    "TEACHING STYLE — adopt this teacher's voice and approach. It shapes TONE and STRUCTURE only; " +
    "it never overrides the grounding rules above: keep using ONLY the provided facts, and never invent " +
    "numbers, equations, or citations.\n" +
    lines.join("\n")
  );
}

/**
 * Append a (client-supplied, re-sanitized) teaching style to a base system
 * prompt. Used by every AI route so a teacher's voice reaches the compiler, the
 * item-writer, and the tutor identically. A default/unconfigured style leaves
 * the base prompt byte-for-byte unchanged, so prompt-contract tests that pin a
 * base prompt verbatim keep passing.
 */
export function appendStyle(base: string, rawStyle: unknown): string {
  const fragment = styleToPromptFragment(sanitizeTeachingStyle(rawStyle));
  return fragment ? `${base}\n\n${fragment}` : base;
}
