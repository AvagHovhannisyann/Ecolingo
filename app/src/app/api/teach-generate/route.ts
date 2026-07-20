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

export const runtime = "nodejs";

export const MODELS = [
  process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "tencent/hy3:free",
  "google/gemma-4-31b-it:free",
];

export type GenerateMode = "study_guide" | "worked_examples" | "key_points";

const MODE_INSTRUCTION: Record<GenerateMode, string> = {
  study_guide:
    "Produce a STUDY GUIDE: for each major topic in the material, a short heading and a 2–4 sentence revision summary in plain language. Cover the whole material; do not add topics the material does not contain.",
  worked_examples:
    "Produce WORKED EXAMPLES: for each concept that admits one, a heading naming the concept and a body that walks through one example step by step. Use ONLY quantities and facts that appear in the material — never invent numbers. If the material contains no numbers for a concept, give a concrete qualitative walkthrough instead.",
  key_points:
    "Produce a KEY-POINTS CHEAT SHEET: for each topic, a short heading and 1–3 crisp must-know bullet-style sentences (write them as sentences, not with bullet characters). Keep it tight — this is a one-pager.",
};

export function normalizeMode(v: unknown): GenerateMode {
  return v === "worked_examples" || v === "key_points" ? v : "study_guide";
}

export const GENERATE_SYSTEM_PROMPT =
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
): string {
  const material = sections.map((s) => `### ${s.heading}\n${s.text}`).join("\n\n");
  return `MATERIAL:\n${material}\n\nTask: ${MODE_INSTRUCTION[mode]}\n\nReturn the JSON object.`;
}

interface InSection {
  heading?: unknown;
  text?: unknown;
}

export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "no_provider", sections: [] }, { status: 503 });

  let body: { mode?: unknown; sections?: InSection[]; style?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", sections: [] }, { status: 400 });
  }

  const mode = normalizeMode(body.mode);
  const sections = (body.sections ?? [])
    .map((s) => ({
      heading: typeof s.heading === "string" ? s.heading.slice(0, 200) : "",
      text: typeof s.text === "string" ? s.text.slice(0, 1500) : "",
    }))
    .filter((s) => s.text)
    .slice(0, 24);
  if (sections.length === 0) return NextResponse.json({ sections: [] });

  const system = appendStyle(GENERATE_SYSTEM_PROMPT, body.style);
  const user = buildGenerateUser(mode, sections);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
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
