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

export const runtime = "nodejs";
// Handout generation runs the same slow free models as the compiler (D-038).
export const maxDuration = 60;

export const MODELS = [
  process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "tencent/hy3:free",
  "google/gemma-4-31b-it:free",
];

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
    "Produce a MISCONCEPTIONS guide: for each concept in the material, a heading naming the concept and a body stating the single most common misconception students hold about it and how to correct it. Ground the correction in the material; never invent facts.",
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

export function buildGenerateUser(
  mode: GenerateMode,
  sections: { heading: string; text: string }[],
  level?: ReadingLevel,
): string {
  const material = sections.map((s) => `### ${s.heading}\n${s.text}`).join("\n\n");
  let task = MODE_INSTRUCTION[mode];
  if (mode === "reading_level") {
    task +=
      level === "advanced"
        ? " Target a MORE ADVANCED reader: you may use precise terminology and assume strong background."
        : " Target a SIMPLER reader: use short sentences and plain words a beginner can follow; define any term you must keep.";
  }
  return `MATERIAL:\n${material}\n\nTask: ${task}\n\nReturn the JSON object.`;
}

interface InSection {
  heading?: unknown;
  text?: unknown;
}

export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "no_provider", sections: [] }, { status: 503 });

  let body: { mode?: unknown; sections?: InSection[]; style?: unknown; level?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", sections: [] }, { status: 400 });
  }

  const mode = normalizeMode(body.mode);
  const level = normalizeLevel(body.level);
  const sections = (body.sections ?? [])
    .map((s) => ({
      heading: typeof s.heading === "string" ? s.heading.slice(0, 200) : "",
      text: typeof s.text === "string" ? s.text.slice(0, 1500) : "",
    }))
    .filter((s) => s.text)
    .slice(0, 24);
  if (sections.length === 0) return NextResponse.json({ sections: [] });

  const system = appendStyle(GENERATE_SYSTEM_PROMPT, body.style);
  const user = buildGenerateUser(mode, sections, level);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    for (const model of MODELS) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Ecolingo" },
          body: JSON.stringify({
            model,
            max_tokens: 2000,
            temperature: 0.3,
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
        return NextResponse.json({ sections: guideSections, model, mode });
      } catch {
        if (controller.signal.aborted) break;
      }
    }
    return NextResponse.json({ error: "upstream_unavailable", sections: [] }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
