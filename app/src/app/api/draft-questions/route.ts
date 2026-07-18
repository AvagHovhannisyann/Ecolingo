/**
 * AI item-writer (docs/04 §20, decision D-014). Drafts multiple-choice practice
 * questions grounded in a teacher-approved section. SERVER-SIDE key only.
 *
 * The model returns prose only (stem + options + a *suggested* answer). It is
 * never authoritative: sanitizeDraftedQuestions validates the shape, the teacher
 * confirms the correct option in the review panel, and the live question is
 * scored deterministically against that ratified key (GATE-002). Failure →
 * empty list, and the teacher simply sees no drafts (GATE-009).
 */

import { NextResponse } from "next/server";
import { sanitizeDraftedQuestions } from "@/lib/engine/authored";

export const runtime = "nodejs";

const MODELS = [
  process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

function extractJsonArray(s: string): unknown {
  const f = s.replace(/```(?:json)?/gi, "");
  const a = f.indexOf("[");
  const b = f.lastIndexOf("]");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(f.slice(a, b + 1));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "no_provider", drafts: [] }, { status: 503 });

  let body: { conceptName?: unknown; definition?: unknown; sectionText?: unknown; count?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", drafts: [] }, { status: 400 });
  }
  const conceptName = typeof body.conceptName === "string" ? body.conceptName : "";
  const definition = typeof body.definition === "string" ? body.definition : "";
  const sectionText = typeof body.sectionText === "string" ? body.sectionText.slice(0, 1500) : "";
  const count = Math.min(Math.max(typeof body.count === "number" ? body.count : 3, 1), 5);
  if (!conceptName || !definition) return NextResponse.json({ error: "bad_request", drafts: [] }, { status: 400 });

  const system =
    'You write multiple-choice practice questions for an intro macroeconomics course. Reply with ONLY a JSON array, no prose. Each element: {"stem": string, "options": string[4], "correctIndex": number, "rationale": string}. Exactly 4 options, exactly one correct, correctIndex is its 0-based position. Ground every question strictly in the provided facts — never introduce outside claims or numbers. Distractors must be plausible common mistakes. rationale is one sentence on why the correct option is right.';
  const facts = [
    `Concept: ${conceptName}`,
    `Definition (authoritative): ${definition}`,
    sectionText ? `Teacher's source text:\n${sectionText}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const user = `${facts}\n\nWrite ${count} distinct multiple-choice questions testing understanding of this concept. Return the JSON array.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  try {
    for (const model of MODELS) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Ecolingo" },
          body: JSON.stringify({
            model,
            max_tokens: 900,
            temperature: 0.4,
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
        if (parsed !== null) return NextResponse.json({ drafts: sanitizeDraftedQuestions(parsed, count), model });
      } catch {
        if (controller.signal.aborted) break;
      }
    }
    return NextResponse.json({ error: "upstream_unavailable", drafts: [] }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
