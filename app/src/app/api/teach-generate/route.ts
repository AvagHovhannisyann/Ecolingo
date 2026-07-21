/**
 * Grounded teacher-document generator (D-030). One route, several modes —
 * study guide, worked examples, key-points cheat sheet — each turning the
 * teacher's OWN uploaded sections into a printable handout. SERVER-SIDE key.
 *
 * Grounding contract, same posture as the tutor route (GATE-001/002): the model
 * writes prose ONLY from the supplied sections, never invents numbers, never
 * cites or names sources (the handout is the teacher's own material). Output is
 * re-sanitized into a fixed {sections:[{heading,body}]} shape; any failure
 * returns an empty section list so the UI degrades honestly (GATE-009). The
 * teacher reviews the result before printing — nothing is auto-published.
 */

import { NextResponse } from "next/server";
import { appendStyle } from "@/lib/engine/teaching-style";
import { TEACHING_CHARTER } from "@/lib/ai/teaching-charter";
import { llmAttempts, hasAnyProvider, OPENROUTER_MODELS } from "@/lib/ai/providers";

export const runtime = "nodejs";
// Handout generation runs the same slow free models as the compiler (D-038).
export const maxDuration = 60;

// The provider chain (Groq primary, OpenRouter free fallback) lives in
// lib/ai/providers. Re-exported as MODELS (the OpenRouter list) for parity with
// the other AI routes and the opt-in live evals.
export const MODELS = OPENROUTER_MODELS;

export type GenerateMode =
  | "study_guide"
  | "worked_examples"
  | "key_points"
  | "flashcards"
  | "misconceptions"
  | "rubric"
  | "reading_level";

const MODE_INSTRUCTION: Record<GenerateMode, string> = {
  study_guide:
    "Produce a STUDY GUIDE: for each major topic in the material, a short heading and a 2–4 sentence revision summary in plain language. Cover the whole material; do not add topics the material does not contain.",
  worked_examples:
    "Produce WORKED EXAMPLES: for each concept that admits one, a heading naming the concept and a body that walks through one example step by step. Use ONLY quantities and facts that appear in the material — never invent numbers. If the material contains no numbers for a concept, give a concrete qualitative walkthrough instead.",
  key_points:
    "Produce a KEY-POINTS CHEAT SHEET: for each topic, a short heading and 1–3 crisp must-know bullet-style sentences (write them as sentences, not with bullet characters). Keep it tight — this is a one-pager.",
  flashcards:
    "Produce FLASHCARDS: each heading is the FRONT of a card (a short question or a term to recall), each body is the BACK (the concise, correct answer). Make one card per key fact or term in the material; ground every card strictly in it and never invent facts.",
  misconceptions:
    "Produce a MISCONCEPTIONS guide: for each concept in the material, a heading naming the concept, and a body covering the ONE or TWO most common misconceptions students actually hold about it. For EACH misconception, write three labelled parts in the body as plain sentences: \"Misconception: <what students wrongly believe>. Why it sticks: <the intuitive but flawed reasoning that leads there>. Correct it: <the accurate account, plus a concrete way to show or check it>.\" Ground every correction strictly in the material; never invent facts. Prefer specific, diagnosable misconceptions over vague ones.",
  rubric:
    "Produce a GRADING RUBRIC for the assignment or prompt described in the material: each heading is one criterion being assessed, and its body describes what distinguishes performance levels (Excellent / Proficient / Developing) for that criterion. Keep criteria specific to the assignment; do not invent requirements the prompt doesn't imply.",
  reading_level:
    "Re-pitch the passage in the material to a different reading level. Keep EVERY fact identical — change only wording, sentence length and complexity, never the meaning. Return a single section: heading \"Adapted passage\", body = the rewritten passage.",
};

/** Modes whose "material" is text the teacher typed (a prompt/passage), not
 *  uploaded documents — the UI collects it inline. */
export const FREEFORM_MODES: GenerateMode[] = ["rubric", "reading_level"];

const ALL_MODES: GenerateMode[] = [
  "study_guide",
  "worked_examples",
  "key_points",
  "flashcards",
  "misconceptions",
  "rubric",
  "reading_level",
];

export function normalizeMode(v: unknown): GenerateMode {
  return typeof v === "string" && (ALL_MODES as string[]).includes(v) ? (v as GenerateMode) : "study_guide";
}

export type ReadingLevel = "simpler" | "advanced";
export function normalizeLevel(v: unknown): ReadingLevel {
  return v === "advanced" ? "advanced" : "simpler";
}

export const GENERATE_SYSTEM_PROMPT =
  TEACHING_CHARTER +
  "\n\n---\n\n# TASK — AUTHOR A STUDENT HANDOUT\n" +
  "You are a master teaching-materials author — the person other teachers wish had made their handouts. You turn a teacher's own course material into a clear, well-organised study document their students will actually learn from. " +
  'Reply with ONLY a JSON object, no prose: {"sections":[{"heading":string,"body":string}]}. ' +
  "STRUCTURE: give each section a heading that names one idea, order the sections so each builds on the last, and make every body self-contained and skimmable. Explain, don't just list; prefer plain language and a concrete example over abstraction. " +
  "GROUNDING (non-negotiable): use ONLY the facts in the provided material — never add outside claims, never invent numbers or data, and never cite or name sources or page numbers (this is the teacher's own material). If the material is thin on a point, cover it briefly rather than padding with invented detail. " +
  "FORMAT: clear, plain prose. No markdown headers, no LaTeX, no bullet characters inside body text.";

/** pull the first JSON object out of a response that may wrap it in prose */
export function extractJsonObject(s: string): unknown {
  const fenced = s.replace(/```(?:json)?/gi, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

export interface GuideSection {
  heading: string;
  body: string;
}

/** coerce model output into at most 20 clean {heading, body} sections */
export function sanitizeGuide(raw: unknown): GuideSection[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = (raw as { sections?: unknown }).sections;
  if (!Array.isArray(arr)) return [];
  const out: GuideSection[] = [];
  for (const s of arr) {
    if (!s || typeof s !== "object") continue;
    const r = s as Record<string, unknown>;
    const heading = typeof r.heading === "string" ? r.heading.trim().slice(0, 120) : "";
    const body = typeof r.body === "string" ? r.body.trim().slice(0, 1200) : "";
    if (!heading || !body) continue;
    out.push({ heading, body });
    if (out.length === 20) break;
  }
  return out;
}

/** extra, per-mode knobs (all optional, all sanitized) that refine the task. */
export interface GenerateOptions {
  /** reading_level: a concrete target audience, e.g. "a middle-school student" */
  audience?: string;
  /** rubric: how many performance levels the descriptors should span (2–5) */
  rubricLevels?: number;
  /** rubric: total points the criteria should sum to (assign per-criterion weights) */
  rubricPoints?: number;
}

export function buildGenerateUser(
  mode: GenerateMode,
  sections: { heading: string; text: string }[],
  level?: ReadingLevel,
  opts: GenerateOptions = {},
): string {
  const material = sections.map((s) => `### ${s.heading}\n${s.text}`).join("\n\n");
  let task = MODE_INSTRUCTION[mode];
  if (mode === "reading_level") {
    task +=
      level === "advanced"
        ? " Target a MORE ADVANCED reader: you may use precise terminology and assume strong background."
        : " Target a SIMPLER reader: use short sentences and plain words a beginner can follow; define any term you must keep.";
    if (opts.audience) task += ` Aim it specifically at ${opts.audience}.`;
  }
  if (mode === "rubric" && opts.rubricLevels) {
    task += ` Use exactly ${opts.rubricLevels} performance levels, from strongest to weakest, and describe each level for every criterion.`;
    if (opts.rubricPoints) {
      task += ` Give each criterion a point value in its heading (e.g. "Evidence (8 pts)") so the criteria sum to ${opts.rubricPoints} total points.`;
    }
  }
  return `MATERIAL:\n${material}\n\nTask: ${task}\n\nReturn the JSON object.`;
}

interface InSection {
  heading?: unknown;
  text?: unknown;
}

export async function POST(req: Request) {
  if (!hasAnyProvider()) return NextResponse.json({ error: "no_provider", sections: [] }, { status: 503 });

  let body: {
    mode?: unknown;
    sections?: InSection[];
    style?: unknown;
    level?: unknown;
    audience?: unknown;
    rubricLevels?: unknown;
    rubricPoints?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", sections: [] }, { status: 400 });
  }

  const mode = normalizeMode(body.mode);
  const level = normalizeLevel(body.level);
  const genOpts: GenerateOptions = {};
  if (typeof body.audience === "string" && body.audience.trim()) genOpts.audience = body.audience.trim().slice(0, 120);
  const rl = Number(body.rubricLevels);
  if (Number.isInteger(rl) && rl >= 2 && rl <= 5) genOpts.rubricLevels = rl;
  const rp = Number(body.rubricPoints);
  if (Number.isInteger(rp) && rp >= 1 && rp <= 1000) genOpts.rubricPoints = rp;
  const sections = (body.sections ?? [])
    .map((s) => ({
      heading: typeof s.heading === "string" ? s.heading.slice(0, 200) : "",
      text: typeof s.text === "string" ? s.text.slice(0, 1500) : "",
    }))
    .filter((s) => s.text)
    .slice(0, 24);
  if (sections.length === 0) return NextResponse.json({ sections: [] });

  const system = appendStyle(GENERATE_SYSTEM_PROMPT, body.style);
  const user = buildGenerateUser(mode, sections, level, genOpts);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    for (const attempt of llmAttempts()) {
      try {
        const res = await fetch(attempt.url, {
          method: "POST",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${attempt.apiKey}`, "Content-Type": "application/json", "X-Title": "Ecolingo" },
          body: JSON.stringify({
            model: attempt.model,
            // Reasoning models burn completion tokens thinking before the JSON;
            // too small a budget returns empty content on a 200 (D-041).
            // Headroom for reasoning + a full multi-section handout. Cost $0.
            max_tokens: 3500,
            temperature: 0.3,
            ...attempt.extraBody,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const content: string = data?.choices?.[0]?.message?.content ?? "";
        const parsed = extractJsonObject(content);
        if (parsed === null) continue;
        const guideSections = sanitizeGuide(parsed);
        if (guideSections.length === 0) continue;
        return NextResponse.json({ sections: guideSections, model: attempt.model, mode });
      } catch {
        if (controller.signal.aborted) break;
      }
    }
    return NextResponse.json({ error: "upstream_unavailable", sections: [] }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
