/**
 * AI-assisted ingestion (docs/04-ai-orchestration.md §20.3 curriculum agent,
 * decision D-011). The model reads the teacher's document sections and the
 * course concepts and *suggests* semantic concept↔section links the
 * deterministic keyword matcher misses. It is strictly advisory:
 *
 *   - SERVER-SIDE key only (same as /api/explain); browser never sees it.
 *   - Output is validated against real concept slugs + section ids
 *     (sanitizeAiSuggestions) — a hallucinated link is dropped, never shown.
 *   - Every suggestion still lands in the teacher review queue and requires
 *     explicit approval to become a citation (GATE-001). The AI never writes a
 *     citation; it only nominates candidates for a human to approve.
 *   - Any failure returns [] and the queue simply shows the deterministic
 *     proposals (GATE-009).
 */

import { NextResponse } from "next/server";
import { concepts } from "@/content/econ13210";
import { sanitizeAiSuggestions } from "@/lib/engine/ingest";

export const runtime = "nodejs";

const MODELS = [
  process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

interface InSection {
  id?: unknown;
  heading?: unknown;
  text?: unknown;
}

/** pull the first JSON array out of a model response that may wrap it in prose */
function extractJsonArray(s: string): unknown {
  const fenced = s.replace(/```(?:json)?/gi, "");
  const start = fenced.indexOf("[");
  const end = fenced.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "no_provider", suggestions: [] }, { status: 503 });

  let body: { sections?: InSection[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", suggestions: [] }, { status: 400 });
  }

  const sections = (body.sections ?? [])
    .map((s) => ({
      id: typeof s.id === "string" ? s.id : "",
      heading: typeof s.heading === "string" ? s.heading : "",
      text: typeof s.text === "string" ? s.text.slice(0, 600) : "",
    }))
    .filter((s) => s.id && s.text)
    .slice(0, 24); // bound the prompt
  if (sections.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const allowedSlugs = new Set(concepts.map((c) => c.slug));
  const allowedSectionIds = new Set(sections.map((s) => s.id));

  const conceptList = concepts
    .map((c) => `- slug "${c.slug}" — ${c.name}: ${c.definition}`)
    .join("\n");
  const sectionList = sections
    .map((s) => `### section id "${s.id}" (heading: ${s.heading})\n${s.text}`)
    .join("\n\n");

  const system =
    'You match course concepts to the document section that best teaches each one. Reply with ONLY a JSON array, no prose. Each element: {"conceptSlug": string, "sectionId": string, "reason": string}. Use only the exact slugs and section ids given. Include a pair only when the section genuinely explains that concept; omit weak matches. reason must be one short sentence. Never invent slugs or ids.';
  const user = `CONCEPTS:\n${conceptList}\n\nDOCUMENT SECTIONS:\n${sectionList}\n\nReturn the JSON array of strong concept-to-section matches.`;

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
            max_tokens: 500,
            temperature: 0.2,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const content: string = data?.choices?.[0]?.message?.content ?? "";
        const parsed = extractJsonArray(content);
        const suggestions = sanitizeAiSuggestions(parsed, allowedSlugs, allowedSectionIds);
        // an empty-but-valid parse is a legitimate "no strong matches" answer
        if (parsed !== null) return NextResponse.json({ suggestions, model });
      } catch {
        if (controller.signal.aborted) break;
      }
    }
    return NextResponse.json({ error: "upstream_unavailable", suggestions: [] }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
