/**
 * AI item-writer (docs/04 §20, decisions D-014 + D-020). Drafts practice
 * questions grounded in a teacher-approved section. SERVER-SIDE key only.
 *
 * The model returns prose only (stems + options + a *suggested* answer). It is
 * never authoritative: the sanitizers drop malformed output, the teacher
 * confirms the correct answer in the review panel, and the live question is
 * scored deterministically against that ratified key (GATE-002). Failure →
 * empty lists, and the teacher simply sees no drafts (GATE-009).
 *
 * D-020 extends this to a QUESTION FACTORY: a `tier` ("easy" | "hard" |
 * "mixed") drives difficulty and transfer, and the batch mixes single-answer
 * (mc_single) and select-all (mc_multi) questions. Back-compat: a request with
 * no `tier` behaves like the D-014 route (mixed tier; `drafts` is still the
 * mc_single list). Numeric generation is intentionally NOT part of this prompt —
 * see the note in engine/authored.ts `sanitizeDraftedNumeric`.
 */

import { NextResponse } from "next/server";
import { appendStyle } from "@/lib/engine/teaching-style";
import {
  sanitizeDraftedQuestions,
  sanitizeDraftedQuestionsMulti,
  tierParams,
  type DraftMultiQuestion,
  type DraftQuestion,
  type QuestionTier,
} from "@/lib/engine/authored";

export const runtime = "nodejs";

export const MODELS = [
  // Verified against the live OpenRouter catalog: the strongest free models,
  // strongest first. The 550B ultra reads ~1M tokens of teacher material in
  // one pass; each fallback keeps the pipeline alive if a tier is saturated.
  process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "tencent/hy3:free",
  "google/gemma-4-31b-it:free",
];

export function extractJsonArray(s: string): unknown {
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

function normalizeTier(v: unknown): QuestionTier {
  return v === "easy" || v === "hard" || v === "mixed" ? v : "mixed";
}

/** the tier-specific instruction that shapes difficulty + cognitive demand */
function tierInstruction(tier: QuestionTier): string {
  switch (tier) {
    case "easy":
      return "Make these EASY (difficulty 1–2): recall and recognition of the definition and key terms, tested in the same context they were taught. Short stems, one clearly correct answer.";
    case "hard":
      return "Make these HARD (difficulty 4–5): application and transfer to a NEW situation not stated verbatim in the source — the learner must reason with the concept, not just recognize it. Distractors should encode tempting but wrong lines of reasoning.";
    case "mixed":
    default:
      return "Mix difficulties: some straightforward recall, some application to a new situation.";
  }
}

export interface BuildDraftPromptArgs {
  conceptName: string;
  definition: string;
  sectionText: string;
  count: number;
  tier: QuestionTier;
}

/** the exact system+user the route sends — exported so the live eval can't drift */
export function buildDraftPrompt(args: BuildDraftPromptArgs): { system: string; user: string } {
  const system =
    'You write multiple-choice practice questions for a course, grounded strictly in the teacher-supplied material. Reply with ONLY a JSON array, no prose. Each element is one of:\n' +
    '  single-answer: {"kind":"single","stem":string,"options":string[4],"correctIndex":number,"rationale":string}\n' +
    '  select-all:    {"kind":"multi","stem":string,"options":string[4-5],"correctIndices":number[2-3],"rationale":string}\n' +
    "For single: exactly 4 options, exactly one correct. For multi: 4–5 options, 2–3 correct (never all). All indices 0-based. Ground every question strictly in the provided facts — never introduce outside claims or numbers. Distractors must be plausible common mistakes. rationale is one sentence on why the correct answer(s) are right.";
  const facts = [
    `Concept: ${args.conceptName}`,
    `Definition (authoritative): ${args.definition}`,
    args.sectionText ? `Teacher's source text:\n${args.sectionText}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const user = `${facts}\n\n${tierInstruction(args.tier)}\n\nWrite ${args.count} distinct questions. Make MOST of them single-answer ("single"); include one select-all ("multi") only when count ≥ 3. Return the JSON array.`;
  return { system, user };
}

/** split a mixed raw array into single-shaped and multi-shaped candidates */
function partitionRaw(parsed: unknown): { singles: unknown[]; multis: unknown[] } {
  const singles: unknown[] = [];
  const multis: unknown[] = [];
  if (!Array.isArray(parsed)) return { singles, multis };
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (r.kind === "multi" || Array.isArray(r.correctIndices)) multis.push(item);
    else singles.push(item);
  }
  return { singles, multis };
}

export async function POST(req: Request) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "no_provider", drafts: [], multiDrafts: [] }, { status: 503 });

  let body: {
    conceptName?: unknown;
    definition?: unknown;
    sectionText?: unknown;
    count?: unknown;
    tier?: unknown;
    style?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request", drafts: [], multiDrafts: [] }, { status: 400 });
  }
  const conceptName = typeof body.conceptName === "string" ? body.conceptName : "";
  const definition = typeof body.definition === "string" ? body.definition : "";
  const sectionText = typeof body.sectionText === "string" ? body.sectionText.slice(0, 1500) : "";
  const count = Math.min(Math.max(typeof body.count === "number" ? body.count : 3, 1), 8);
  const tier = normalizeTier(body.tier);
  if (!conceptName || !definition)
    return NextResponse.json({ error: "bad_request", drafts: [], multiDrafts: [] }, { status: 400 });

  const { system: baseSystem, user } = buildDraftPrompt({ conceptName, definition, sectionText, count, tier });
  const system = appendStyle(baseSystem, body.style);
  const { difficulty, transferDistance } = tierParams(tier);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    for (const model of MODELS) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Ecolingo" },
          body: JSON.stringify({
            model,
            max_tokens: 1100,
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
        if (parsed === null) continue;
        const { singles, multis } = partitionRaw(parsed);
        // stamp the tier's difficulty/transfer onto every draft so it flows to the stored question
        const drafts: DraftQuestion[] = sanitizeDraftedQuestions(singles, count).map((d) => ({
          ...d,
          difficulty,
          transferDistance,
        }));
        const multiDrafts: DraftMultiQuestion[] = sanitizeDraftedQuestionsMulti(multis, count).map((d) => ({
          ...d,
          difficulty,
          transferDistance,
        }));
        return NextResponse.json({ drafts, multiDrafts, model, tier });
      } catch {
        if (controller.signal.aborted) break;
      }
    }
    return NextResponse.json({ error: "upstream_unavailable", drafts: [], multiDrafts: [] }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
