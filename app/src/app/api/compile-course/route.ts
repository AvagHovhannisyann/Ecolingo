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
import { appendStyle } from "@/lib/engine/teaching-style";
import { TEACHING_CHARTER } from "@/lib/ai/teaching-charter";

export const runtime = "nodejs";
// Compiling a whole course from many sections is slow (tens of seconds on the
// free models). Without this, the platform kills the function early and the
// teacher sees "the AI provider didn't answer" (D-038).
export const maxDuration = 60;

export const MODELS = [
  // FAST-FIRST (D-040): the 120B "super" answers a full compile in ~10s with
  // throughput routing, vs the 550B "ultra" at ~24s — and the compile is
  // latency-bound on the free tier, so lead with the fast, strong model and
  // keep the others as fallbacks. Quality is ample; the teacher reviews the draft.
  process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "tencent/hy3:free",
  "google/gemma-4-31b-it:free",
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

/**
 * Clarify mode (D-022): before compiling, the model may ask the teacher a few
 * SPECIFIC questions about the material and the students. Questions are
 * display-only text — sanitized, capped, never executed — and answering is
 * always optional (GATE-009: a clarify failure never blocks compiling).
 */
export const CLARIFY_SYSTEM_PROMPT =
  TEACHING_CHARTER +
  "\n\n---\n\n# TASK — CLARIFYING QUESTIONS BEFORE COMPILING\n" +
  "You are a seasoned curriculum architect about to turn a teacher's material into a course, and you know the few unknowns that most change a good design. Before building, you ask only the questions that genuinely matter. " +
  'Reply with ONLY a JSON object, no prose: {"questions":[string]}. ' +
  "Ask 3-5 SHORT, specific questions whose answers would genuinely change how you structure the course — the students' prior knowledge and level, where to spend the most time, which topics are assessed hardest, ambiguous or missing pieces in the material, or the intended pace. " +
  "Make each question answerable in a sentence. Never ask for personal data about individual students, never ask something the material already answers, and never ask vague throat-clearing questions ('what are your goals?').";

export function buildClarifyUser(sections: { id: string; heading: string; text: string }[]): string {
  const sectionList = sections.map((s) => "### " + s.heading + "\n" + s.text.slice(0, 400)).join("\n\n");
  return "SOURCE MATERIAL (excerpts):\n" + sectionList + "\n\nAsk your clarifying questions. Return the JSON object.";
}

/** display-only strings: trimmed, deduped, capped at 5 questions of ≤200 chars */
export function sanitizeClarifyQuestions(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const arr = (raw as { questions?: unknown }).questions;
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of arr) {
    if (typeof q !== "string") continue;
    const t = q.trim().slice(0, 200);
    if (t.length < 8 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length === 5) break;
  }
  return out;
}

/** teacher-supplied compile context (D-022) — every field optional, all sanitized */
export interface TeacherContext {
  /** the ENDPOINT difficulty (1-5): how strong students must be by the course's end */
  targetDifficulty?: number;
  /** roughly how many classes/lectures the course spans */
  expectedLectures?: number;
  answers?: { question: string; answer: string }[];
}

export function sanitizeTeacherContext(raw: unknown): TeacherContext {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const ctx: TeacherContext = {};
  const d = Number(r.targetDifficulty);
  if (Number.isInteger(d) && d >= 1 && d <= 5) ctx.targetDifficulty = d;
  const n = Number(r.expectedLectures);
  if (Number.isInteger(n) && n >= 1 && n <= 60) ctx.expectedLectures = n;
  if (Array.isArray(r.answers)) {
    ctx.answers = r.answers
      .filter((a): a is { question: unknown; answer: unknown } => !!a && typeof a === "object")
      .map((a) => ({
        question: String(a.question ?? "").slice(0, 200),
        answer: String(a.answer ?? "").slice(0, 500),
      }))
      .filter((a) => a.question && a.answer.trim())
      .slice(0, 5);
    if (ctx.answers.length === 0) delete ctx.answers;
  }
  return ctx;
}

export const COMPILE_SYSTEM_PROMPT =
  TEACHING_CHARTER +
  "\n\n---\n\n# TASK — COMPILE A COURSE\n" +
  "You are a world-class curriculum architect and instructional designer. You take a teacher's raw material and design a Duolingo-style course that a motivated beginner could climb from zero to real competence — sequenced so every step is reachable from the last, with cognitive load managed and nothing introduced before its prerequisites. " +
  'Reply with ONLY a JSON object, no prose: {"units":[{"title":string,"lessons":[{"title":string,"conceptName":string,"definition":string,"coreIdea":string,"intuition":string,"estimatedMinutes":number,"sourceSectionIds":string[]}]}],"prereqPairs":[[fromConceptName,toConceptName]]}. ' +
  "Rules: identify 3–6 distinct concepts for a typical document, one lesson per concept, each a single teachable idea (split anything that bundles two). Give each lesson a short, friendly title (like a game level). " +
  "Group lessons into coherent UNITS of 3–5 that build on each other; each unit title is a short student-facing GOAL shown as a banner on the learning roadmap (e.g. \"Master the demand curve\") — an outcome phrase, never a chapter number or heading copied verbatim. " +
  "definition, coreIdea and intuition must be grounded ONLY in the provided source text — never introduce outside facts, numbers, or claims. Keep EACH of definition, coreIdea and intuition to ONE concise sentence: definition states the concept plainly, intuition gives a short everyday analogy or mental picture. Be brief — a tight plan is better than a long one. " +
  "sourceSectionIds must be chosen ONLY from the exact section ids given. " +
  "prereqPairs lists ordered [before, after] concept-name pairs ONLY where the source implies one concept must be understood before another; omit weak or speculative dependencies and never create a cycle.";

/** the exact user message the route sends — exported so the live eval can't drift */
export function buildCompileUser(
  sections: { id: string; heading: string; text: string }[],
  context: TeacherContext = {}
): string {
  const sectionList = sections
    .map((s) => `### section id "${s.id}" (heading: ${s.heading})\n${s.text}`)
    .join("\n\n");
  const ctxLines: string[] = [];
  if (context.targetDifficulty)
    ctxLines.push(
      `Target END-OF-COURSE difficulty: ${context.targetDifficulty}/5. This is the level students must REACH by the end — early lessons still start accessible and ramp up.`
    );
  if (context.expectedLectures) ctxLines.push(`The course spans roughly ${context.expectedLectures} classes; size the unit/lesson count accordingly.`);
  for (const a of context.answers ?? []) ctxLines.push(`Teacher was asked: "${a.question}" — answered: "${a.answer}"`);
  const ctxBlock = ctxLines.length > 0 ? `\n\nTEACHER CONTEXT (authoritative):\n- ${ctxLines.join("\n- ")}` : "";
  return `DOCUMENT SECTIONS:\n${sectionList}${ctxBlock}\n\nCompile the course plan. Return the JSON object.`;
}

export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  const empty: DraftCoursePlan = { units: [], prereqPairs: [] };
  if (!key) return NextResponse.json({ error: "no_provider", plan: empty }, { status: 503 });

  let body: { sections?: InSection[]; mode?: unknown; context?: unknown; style?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", plan: empty }, { status: 400 });
  }
  const mode = body.mode === "clarify" ? "clarify" : "compile";
  const context = sanitizeTeacherContext(body.context);

  const sections = (body.sections ?? [])
    .map((s) => ({
      id: typeof s.id === "string" ? s.id : "",
      heading: typeof s.heading === "string" ? s.heading : "",
      text: typeof s.text === "string" ? s.text.slice(0, 650) : "",
    }))
    .filter((s) => s.id && s.text)
    .slice(0, 22); // bound the prompt: fewer, shorter sections keep the free
    // models fast enough to answer within the function budget (D-040). The
    // model only distils 3–8 concepts regardless, so this doesn't lose the plan.
  if (sections.length === 0) return NextResponse.json({ plan: empty });

  const allowedSectionIds = new Set(sections.map((s) => s.id));
  const baseSystem = mode === "clarify" ? CLARIFY_SYSTEM_PROMPT : COMPILE_SYSTEM_PROMPT;
  const system = appendStyle(baseSystem, body.style);
  const user = mode === "clarify" ? buildClarifyUser(sections) : buildCompileUser(sections, context);

  // PER-MODEL timeout with a global deadline (D-040). Free models vary wildly
  // in latency minute to minute; a single shared timeout burns the whole budget
  // on a slow primary and never reaches the fallbacks. Instead each model gets a
  // bounded slice, so a hung model is dropped fast and the next one gets a real
  // chance — all within the function's maxDuration.
  const deadline = Date.now() + 55_000;
  for (const model of MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < 8_000) break; // not enough time left for another honest attempt
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(32_000, remaining));
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Ecolingo" },
        body: JSON.stringify({
          model,
          max_tokens: 1100,
          temperature: 0.3,
          // Route to the fastest available provider for this free model — the
          // compile is latency-bound on the free tier (D-040).
          provider: { sort: "throughput" },
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
      if (mode === "clarify") {
        const questions = sanitizeClarifyQuestions(parsed);
        if (questions.length === 0) continue;
        return NextResponse.json({ questions, model });
      }
      const { plan } = sanitizeCoursePlan(parsed, allowedSectionIds);
      // a valid parse that sanitizes to zero usable units is still a legitimate answer
      return NextResponse.json({ plan, model });
    } catch {
      // per-model timeout or network error → move on to the next model
    } finally {
      clearTimeout(timeout);
    }
  }
  return NextResponse.json({ error: "upstream_unavailable", plan: empty }, { status: 502 });
}
