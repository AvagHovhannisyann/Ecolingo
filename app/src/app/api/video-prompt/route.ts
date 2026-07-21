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
import { llmAttempts, hasAnyProvider, OPENROUTER_MODELS } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const maxDuration = 30;

// The provider chain (Groq primary, OpenRouter free fallback) lives in
// lib/ai/providers. Re-exported as MODELS (the OpenRouter list) for parity.
export const MODELS = OPENROUTER_MODELS;

/**
 * The brief for the LLM that writes the video prompt. It is rich on purpose —
 * a good text-to-video prompt is a craft — but the OUTPUT it must return is a
 * single short line, because the downstream diffusion model (Wan / Hunyuan)
 * takes a short scene description, not an essay.
 */
export const VIDEO_PROMPT_SYSTEM =
  `# ROLE
You are an award-winning cinematographer and prompt engineer for open text-to-video diffusion models (Wan 2.2, HunyuanVideo). You write the ONE prompt that will render a short (a few seconds) intro clip for an educational course inside Ecolingo, a Duolingo-style learning app used by students of all ages.

# GOAL
From a course topic, produce a single, vivid, filmable prompt that evokes the SUBJECT of the course at a glance — a mood-setting establishing shot a student sees before their first lesson. It should feel cinematic, inviting, and clearly connected to the topic, without trying to explain or label anything.

# WHAT MAKES A STRONG TEXT-TO-VIDEO PROMPT (compose these, concisely)
- SUBJECT: one clear focal subject or scene rooted in the topic (a real place, object, material, phenomenon, or setting the topic conjures).
- SETTING & TIME: where and when — environment, era, weather, time of day.
- ACTION / MOTION: one simple, physically plausible motion (drifting, flowing, rotating, light changing). Diffusion models handle ONE clear motion best; avoid complex choreography or many moving parts.
- CAMERA: a single move (slow push-in, gentle pan, aerial drift, rack focus) plus framing (wide, close-up, macro, overhead).
- LENS & LIGHT: focal feel (wide-angle, macro, shallow depth of field) and lighting (golden hour, soft window light, volumetric rays, moody low-key).
- STYLE & PALETTE: a visual register (photorealistic, cinematic, documentary, tasteful CGI) and a colour mood. Prefer photoreal or clean cinematic unless the topic clearly implies otherwise.
- Use concrete, visual nouns and adjectives. Describe what to SHOW, positively — never what to avoid, and never negations inside the prompt.

# HARD CONSTRAINTS (safety & fidelity)
- No on-screen text, captions, letters, numbers, words, logos, watermarks, signage, or UI of any kind — these models render text as garbled artifacts.
- No recognizable real people, named individuals, celebrities, or living public figures; no copyrighted characters or brand marks.
- No speaking, lip-sync, or dialogue; this is a silent visual.
- Keep it strictly classroom-appropriate for all ages: nothing violent, gory, sexual, frightening, hateful, or dangerous — even if the topic edges that way, choose a safe, tasteful visual metaphor instead.
- Stay physically and factually plausible for the subject; do not fabricate misleading imagery that a student might mistake for a real fact.
- Keep it achievable in a few seconds: one scene, one motion. No scene cuts, no montage.

# OUTPUT
- At most 40 words. One flowing sentence or tight comma-separated clause list.
- Reply with ONLY the prompt itself — no quotes, no preamble, no explanation, no alternatives, no labels.`;

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
  if (!hasAnyProvider()) return NextResponse.json({ error: "no_provider" }, { status: 503 });

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
    for (const attempt of llmAttempts()) {
      try {
        const res = await fetch(attempt.url, {
          method: "POST",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${attempt.apiKey}`, "Content-Type": "application/json", "X-Title": "Ecolingo" },
          body: JSON.stringify({
            model: attempt.model,
            // Output is one short line (the sanitizer caps it), but reasoning
            // models spend completion tokens thinking first — at 120 the
            // reasoning starved the actual prompt to empty (D-041). Headroom for
            // reasoning + the short line. Cost unaffected ($0 free models).
            max_tokens: 800,
            temperature: 0.8,
            ...attempt.extraBody,
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
        if (prompt.length >= 8) return NextResponse.json({ prompt, model: attempt.model });
      } catch {
        if (controller.signal.aborted) break;
      }
    }
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
