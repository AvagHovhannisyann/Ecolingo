/**
 * AI course compiler (decision D-020). Given a teacher's ingested document
 * sections, an instructional-design model proposes a whole COURSE plan
 * (units → lessons + prerequisite edges). SERVER-SIDE key only.
 *
 * The plan is strictly a DRAFT. The route validates it with
 * `sanitizeCoursePlan`: every slug is derived deterministically, every source-
 * section reference is checked against the sections the teacher actually sent,
 * and the prerequisite edges are forced to a DAG. Nothing here becomes course
 * content until the teacher ratifies it downstream (GATE-001); no equations or
 * answer keys are invented (GATE-002). Any failure returns an empty plan so the
 * teacher simply sees no compiled draft (GATE-009).
 */

import { NextResponse } from "next/server";
import { sanitizeCoursePlan, type DraftCoursePlan } from "@/lib/engine/compile-course";

export const runtime = "nodejs";

export const MODELS = [
  process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

interface InSection {
  id?: unknown;
  heading?: unknown;
  text?: unknown;
}

/** pull the first JSON object out of a model response that may wrap it in prose */
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

export const COMPILE_SYSTEM_PROMPT =
  "You are an expert instructional designer decomposing a teacher's source material into a Duolingo-style course. " +
  'Reply with ONLY a JSON object, no prose: {"units":[{"title":string,"lessons":[{"title":string,"conceptName":string,"definition":string,"coreIdea":string,"intuition":string,"estimatedMinutes":number,"sourceSectionIds":string[]}]}],"prereqPairs":[[fromConceptName,toConceptName]]}. ' +
  "Rules: identify 3–8 distinct concepts for a typical lecture document, one lesson per concept. Give each lesson a short, friendly title (like a game level). " +
  "definition, coreIdea and intuition must be grounded ONLY in the provided source text — never introduce outside facts, numbers, or claims. coreIdea is 1–2 sentences stating the concept plainly; intuition is a short everyday analogy or mental picture. " +
  "sourceSectionIds must be chosen ONLY from the exact section ids given. " +
  "prereqPairs lists ordered [before, after] concept-name pairs ONLY where the source implies one concept must be understood before another; omit weak or speculative dependencies and never create a cycle.";

/** the exact user message the route sends — exported so the live eval can't drift */
export function buildCompileUser(sections: { id: string; heading: string; text: string }[]): string {
  const sectionList = sections
    .map((s) => `### section id "${s.id}" (heading: ${s.heading})\n${s.text}`)
    .join("\n\n");
  return `DOCUMENT SECTIONS:\n${sectionList}\n\nCompile the course plan. Return the JSON object.`;
}

export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  const empty: DraftCoursePlan = { units: [], prereqPairs: [] };
  if (!key) return NextResponse.json({ error: "no_provider", plan: empty }, { status: 503 });

  let body: { sections?: InSection[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", plan: empty }, { status: 400 });
  }

  const sections = (body.sections ?? [])
    .map((s) => ({
      id: typeof s.id === "string" ? s.id : "",
      heading: typeof s.heading === "string" ? s.heading : "",
      text: typeof s.text === "string" ? s.text.slice(0, 1200) : "",
    }))
    .filter((s) => s.id && s.text)
    .slice(0, 30); // bound the prompt
  if (sections.length === 0) return NextResponse.json({ plan: empty });

  const allowedSectionIds = new Set(sections.map((s) => s.id));
  const system = COMPILE_SYSTEM_PROMPT;
  const user = buildCompileUser(sections);

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
            max_tokens: 2200,
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
        const { plan } = sanitizeCoursePlan(parsed, allowedSectionIds);
        // a valid parse that sanitizes to zero usable units is still a legitimate answer
        return NextResponse.json({ plan, model });
      } catch {
        if (controller.signal.aborted) break;
      }
    }
    return NextResponse.json({ error: "upstream_unavailable", plan: empty }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
