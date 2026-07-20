/**
 * Live tutor-agent endpoint (docs/04-ai-orchestration.md §20.5, decision D-010).
 *
 * SERVER-SIDE ONLY: the OpenRouter key never leaves the server — the browser
 * calls this same-origin route, which proxies to OpenRouter. The response is
 * grounded explanatory PROSE only. Truth-critical artifacts are never taken
 * from the model: equations/graphs stay code-rendered (GATE-002) and citations
 * are attached deterministically by the client from approved sources, never by
 * the model (GATE-001). On any failure this returns 502/503 and the client
 * falls back to the deterministic provider — no silent failure (GATE-009).
 */

import { NextResponse } from "next/server";
import { appendStyle } from "@/lib/engine/teaching-style";
import { TEACHING_CHARTER } from "@/lib/ai/teaching-charter";

export const runtime = "nodejs";
export const maxDuration = 30;

// Primary is chosen for the free tier's reliability+latency (see D-010); the
// rest are availability fallbacks. The deterministic provider is the client's
// final fallback, so total failure here is still safe.
//
// Exported (with the system prompt, mode table, and facts builder below) so the
// opt-in live eval harness can exercise the REAL contract instead of a fork
// that could silently drift from what ships. Exporting is inert at runtime —
// no behavior change (GATE-009 fallback semantics are untouched).
export const MODELS = [
  // Verified against the live OpenRouter catalog: the strongest free models,
  // strongest first. The 550B ultra reads ~1M tokens of teacher material in
  // one pass; each fallback keeps the pipeline alive if a tier is saturated.
  process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "tencent/hy3:free",
  "google/gemma-4-31b-it:free",
];

export const MODE_INSTRUCTION: Record<string, string> = {
  simpler: "Re-explain the concept in the simplest possible language, 1–2 sentences.",
  three_sentences: "Explain the concept in exactly three short sentences.",
  step_by_step: "Explain the reasoning in 2–4 short numbered steps.",
  intuition: "Give the intuition with a concrete everyday analogy, 2 sentences.",
  mathematics: "Explain what the equation means in words, 1–2 sentences. Do NOT restate the equation — it is shown separately.",
  example: "Give one short worked-example sentence. Do NOT invent specific numbers unless they appear in the provided facts.",
  graph: "In one sentence, say what to look for on the graph. The graph is shown separately.",
  why_wrong: "Gently explain the likely misconception and how to fix it, 2 sentences. Never shame the learner.",
};

interface Body {
  mode?: string;
  conceptName?: string;
  definition?: string;
  equationLatex?: string | null;
  equationMeaning?: string | null;
  misconception?: string | null;
  sourceLabels?: string[];
  /** D-029: the enrolled course's teaching style — re-sanitized here, layered
   *  onto the tutor prompt so students hear the teacher's own voice. */
  style?: unknown;
}

// The grounding contract, factored out verbatim so the live eval can send the
// EXACT same system prompt + facts the route sends. Changing either of these
// changes the deployed behavior — the eval is meant to catch that.
export const TUTOR_SYSTEM_PROMPT =
  TEACHING_CHARTER +
  "\n\n---\n\n# TASK — TUTOR ONE LEARNER, RIGHT NOW\n" +
  "You are Ecolingo's tutor — a warm, brilliant teacher whose gift is making a hard idea suddenly feel obvious. " +
  "You teach one learner, right now, who is mid-lesson and slightly stuck. Your job is the smallest, clearest nudge that unlocks understanding.\n" +
  "HOW YOU THINK: start from what the learner already grasps and build one step toward the idea; lead with intuition or a vivid everyday picture before any formalism; name the single thing that usually trips people up here and clear it. Prefer a concrete instance over an abstract restatement.\n" +
  "GROUNDING (non-negotiable): use ONLY the provided facts. You may rephrase, illustrate, and connect them, but never add outside claims and never invent numbers, data, examples, or definitions that the facts don't support. If the facts don't settle something, say so plainly instead of guessing — an honest 'the notes don't say' beats a confident fabrication, and never cite or name sources or page numbers — the app attaches real citations itself.\n" +
  "VOICE: warm, direct, encouraging, never condescending, never padded. Define any technical term you must use. No hedging preambles ('Sure!', 'Great question') — open with the explanation itself.\n" +
  "FORMAT: plain prose only — no markdown headers, no LaTeX, no bullet characters, no lists. Keep it as short as it can be while still making the idea land.";

/**
 * Grounding block: the model may use ONLY these facts. It must not cite sources
 * (the client attaches real citations) and must not invent numbers. Extracted
 * from POST unchanged so the route and the live eval build facts identically.
 */
export function buildFacts(body: Body): string {
  return [
    `Concept: ${body.conceptName ?? ""}`.trim(),
    `Definition (authoritative, do not contradict): ${body.definition}`,
    body.equationLatex ? `Equation (LaTeX, already shown to the learner): ${body.equationLatex}` : "",
    body.equationMeaning ? `Equation meaning: ${body.equationMeaning}` : "",
    body.misconception ? `The learner's likely misconception: ${body.misconception}` : "",
    body.sourceLabels?.length ? `(Grounded in the teacher's material: ${body.sourceLabels.join("; ")})` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    // no provider configured → tell the client to use its deterministic fallback
    return NextResponse.json({ error: "no_provider" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const mode = String(body.mode ?? "");
  const instruction = MODE_INSTRUCTION[mode];
  if (!instruction || !body.definition) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Grounding block: the model may use ONLY these facts. It must not cite
  // sources (the client attaches real citations) and must not invent numbers.
  const facts = buildFacts(body);

  const system = appendStyle(TUTOR_SYSTEM_PROMPT, body.style);
  const user = `${facts}\n\nTask: ${instruction}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  try {
    for (const model of MODELS) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "X-Title": "Ecolingo",
          },
          body: JSON.stringify({
            model,
            max_tokens: 220,
            temperature: 0.3,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });
        if (!res.ok) continue; // 429/5xx → try the next model
        const data = await res.json();
        const text: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
        if (text) return NextResponse.json({ text, model });
      } catch {
        // abort or network error → try next model (or fall through to 502)
        if (controller.signal.aborted) break;
      }
    }
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
