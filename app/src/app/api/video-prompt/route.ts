/**
 * Auto video-prompt writer (D-032). The app generates course intro clips
 * automatically — the teacher never writes a video prompt. This route asks the
 * LLM (OpenRouter, server-side key) to turn a course's topic + unit titles into
 * ONE vivid, cinematic text-to-video prompt, which the caller then feeds to the
 * HunyuanVideo generator. Prose-only, decorative — the clip is illustrative, so
 * this prompt is creative rather than grounded, but it must stay on-topic and
 * contain no on-screen text instructions.
 *
 * Honest degrade (GATE-009): no OpenRouter key → 503, and the auto-video step
 * simply doesn't run.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const MODELS = [
  process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "tencent/hy3:free",
  "google/gemma-4-31b-it:free",
];

export const VIDEO_PROMPT_SYSTEM =
  "You are a cinematographer writing a single text-to-video prompt for a short (a few seconds) course-intro clip. " +
  "Given a course topic, write ONE vivid, concrete, filmable prompt of at most 40 words: describe a real scene, camera move, lighting and mood that evokes the subject. " +
  "No on-screen text, captions, letters, numbers, logos, or UI. No people speaking. Reply with ONLY the prompt sentence — no quotes, no preamble, no options.";

export function buildVideoPromptUser(title: string, units: string[]): string {
  const u = units.filter(Boolean).slice(0, 8);
  return `Course: "${title}"${u.length ? `\nTopics: ${u.join("; ")}` : ""}\n\nWrite the single video prompt.`;
}

/** collapse the model's reply to one clean prompt line, capped */
export function sanitizeVideoPrompt(raw: string): string {
  return raw
    .replace(/```/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)[0]
    ?.replace(/^["'`]|["'`]$/g, "")
    .slice(0, 300)
    ?? "";
}

export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "no_provider" }, { status: 503 });

  let body: { title?: unknown; units?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const units = Array.isArray(body.units)
    ? body.units.filter((u): u is string => typeof u === "string").map((u) => u.slice(0, 120))
    : [];
  if (!title) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    for (const model of MODELS) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Ecolingo" },
          body: JSON.stringify({
            model,
            max_tokens: 120,
            temperature: 0.8,
            messages: [
              { role: "system", content: VIDEO_PROMPT_SYSTEM },
              { role: "user", content: buildVideoPromptUser(title, units) },
            ],
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const content: string = data?.choices?.[0]?.message?.content ?? "";
        const prompt = sanitizeVideoPrompt(content);
        if (prompt.length >= 8) return NextResponse.json({ prompt, model });
      } catch {
        if (controller.signal.aborted) break;
      }
    }
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
