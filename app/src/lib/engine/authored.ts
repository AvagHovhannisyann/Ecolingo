/**
 * AI-drafted practice questions (docs/04 §20 item-writer, decision D-014).
 *
 * The model DRAFTS question prose (stem + options) grounded in an approved
 * section. It never decides scoring: the teacher ratifies the correct answer,
 * and the resulting question is a normal deterministic `mc_single` scored by
 * engine/scoring.ts against the teacher-approved key (GATE-002 — answer keys /
 * scoring are never AI-generated). A draft only becomes a live question through
 * explicit teacher approval (GATE-001 pattern).
 */

import type { McMultiQuestion, McSingleQuestion, NumericQuestion } from "./types";
import { stableId } from "./ingest";

/** the difficulty tier a batch was generated at (D-020 question factory) */
export type QuestionTier = "easy" | "hard" | "mixed";

export interface DraftQuestion {
  stem: string;
  options: string[];
  /** the model's *suggested* correct option — advisory; the teacher confirms */
  suggestedIndex: number;
  rationale?: string;
  /** difficulty tier this draft was generated at (advisory; flows to the stored question) */
  difficulty?: 1 | 2 | 3 | 4 | 5;
  transferDistance?: 0 | 1 | 2;
}

/**
 * Validate raw model output into well-formed drafts. Anything malformed (wrong
 * option count, out-of-range index, empty text) is dropped — a broken draft
 * never reaches the teacher's review panel. Deterministic: dedupes by stem,
 * caps the count.
 */
export function sanitizeDraftedQuestions(raw: unknown, max = 8): DraftQuestion[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DraftQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const stem = typeof r.stem === "string" ? r.stem.trim() : "";
    const options = Array.isArray(r.options)
      ? r.options.map((o) => (typeof o === "string" ? o.trim() : "")).filter(Boolean)
      : [];
    if (!stem || options.length < 3 || options.length > 5) continue;
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) continue; // dup options
    let idx = typeof r.correctIndex === "number" ? Math.trunc(r.correctIndex) : -1;
    if (idx < 0 || idx >= options.length) idx = 0;
    const key = stem.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const rationale = typeof r.rationale === "string" ? r.rationale.trim().slice(0, 200) : "";
    out.push({ stem, options, suggestedIndex: idx, rationale });
    if (out.length >= max) break;
  }
  return out;
}

const OPTION_IDS = ["a", "b", "c", "d", "e"];

/** knobs shared by all authored-question converters (all optional, all back-compat) */
export interface AuthoredOptions {
  /** override the deterministic id (e.g. the compiler's `q-gen-<slug>-<n>` scheme) */
  id?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  transferDistance?: 0 | 1 | 2;
  expectedSeconds?: number;
  hint?: string;
}

/**
 * Turn a teacher-ratified draft into a real deterministic question. `correct
 * Index` is what the TEACHER confirmed (defaults to the model's suggestion only
 * if the teacher left it). Provenance is "ai_approved": drafted by AI, ratified
 * by a human. Difficulty/transferDistance flow from the draft's tier (or opts)
 * to the stored question; unset → the legacy defaults (difficulty 2, transfer 0)
 * so existing callers are unaffected.
 */
export function toAuthoredQuestion(
  draft: DraftQuestion,
  conceptSlug: string,
  correctIndex: number,
  citationIds: string[] = [],
  opts: AuthoredOptions = {}
): McSingleQuestion {
  const safeIndex = correctIndex >= 0 && correctIndex < draft.options.length ? correctIndex : draft.suggestedIndex;
  const id = opts.id ?? `q-authored-${conceptSlug}-${stableId(draft.stem)}`;
  const difficulty = opts.difficulty ?? draft.difficulty ?? 2;
  const transferDistance = opts.transferDistance ?? draft.transferDistance ?? 0;
  return {
    id,
    conceptSlug,
    type: "mc_single",
    stem: draft.stem,
    difficulty,
    expectedSeconds: opts.expectedSeconds ?? 40,
    transferDistance,
    provenance: "ai_approved",
    hint: opts.hint ?? "Think back to the teacher-approved source for this concept.",
    citationIds,
    options: draft.options.map((text, i) => ({ id: OPTION_IDS[i], text })),
    answerKey: { correctOptionId: OPTION_IDS[safeIndex] },
  };
}

// ===========================================================================
// mc_multi (select-all) — the second factory shape (D-020)
// ===========================================================================

export interface DraftMultiQuestion {
  stem: string;
  options: string[];
  /** the model's *suggested* correct options — advisory; the teacher confirms */
  suggestedIndices: number[];
  rationale?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  transferDistance?: 0 | 1 | 2;
}

/**
 * Validate raw model output into well-formed select-all drafts. A select-all is
 * only meaningful with MORE THAN ONE correct answer and at least one distractor,
 * so the rules are stricter than mc_single: 4–5 distinct options, 2–3 distinct
 * in-range correct indices (never all of them). Anything else is dropped — a
 * broken draft never reaches the teacher. Deterministic: dedupes by stem, caps.
 */
export function sanitizeDraftedQuestionsMulti(raw: unknown, max = 8): DraftMultiQuestion[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DraftMultiQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const stem = typeof r.stem === "string" ? r.stem.trim() : "";
    const options = Array.isArray(r.options)
      ? r.options.map((o) => (typeof o === "string" ? o.trim() : "")).filter(Boolean)
      : [];
    if (!stem || options.length < 4 || options.length > 5) continue;
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) continue; // dup options

    const rawIdx = Array.isArray(r.correctIndices) ? r.correctIndices : [];
    const indices = [
      ...new Set(
        rawIdx
          .map((n) => (typeof n === "number" ? Math.trunc(n) : NaN))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < options.length)
      ),
    ].sort((a, b) => a - b);
    // must be a genuine select-all: 2–3 correct, and at least one wrong option left
    if (indices.length < 2 || indices.length > 3 || indices.length >= options.length) continue;

    const key = stem.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const rationale = typeof r.rationale === "string" ? r.rationale.trim().slice(0, 200) : "";
    out.push({ stem, options, suggestedIndices: indices, rationale });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Turn a teacher-ratified select-all draft into a real deterministic
 * `mc_multi`. `correctIndices` is what the TEACHER confirmed; if the teacher's
 * set is empty or malformed we fall back to the model's suggestion. Scored by
 * the existing engine against the teacher's key (GATE-002).
 */
export function toAuthoredQuestionMulti(
  draft: DraftMultiQuestion,
  conceptSlug: string,
  correctIndices: number[],
  citationIds: string[] = [],
  opts: AuthoredOptions = {}
): McMultiQuestion {
  const cleaned = [
    ...new Set((correctIndices ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < draft.options.length)),
  ];
  const chosen = cleaned.length >= 1 ? cleaned : draft.suggestedIndices;
  const id = opts.id ?? `q-authored-${conceptSlug}-${stableId(draft.stem)}`;
  return {
    id,
    conceptSlug,
    type: "mc_multi",
    stem: draft.stem,
    difficulty: opts.difficulty ?? draft.difficulty ?? 3,
    expectedSeconds: opts.expectedSeconds ?? 55,
    transferDistance: opts.transferDistance ?? draft.transferDistance ?? 0,
    provenance: "ai_approved",
    hint: opts.hint ?? "More than one option is correct — check each against the teacher-approved source.",
    citationIds,
    options: draft.options.map((text, i) => ({ id: OPTION_IDS[i], text })),
    answerKey: { correctOptionIds: chosen.sort((a, b) => a - b).map((i) => OPTION_IDS[i]) },
  };
}

// ===========================================================================
// numeric — with a conservative anti-hallucination check (D-020)
// ===========================================================================

export interface DraftNumericQuestion {
  stem: string;
  /** the model's *suggested* numeric answer key — advisory; the teacher confirms */
  suggestedValue: number;
  unitLabel?: string;
  rationale?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  transferDistance?: 0 | 1 | 2;
}

/** every maximal digit-run (integer or decimal) appearing in a string */
function digitStrings(s: string): string[] {
  return s.match(/\d+(?:\.\d+)?/g) ?? [];
}

/**
 * Validate raw model output into numeric drafts, with a CONSERVATIVE
 * anti-hallucination guard (GATE-002 substrate):
 *
 *   - the answer key must be a FINITE number;
 *   - the stem must contain EVERY digit-string the model uses as an operand
 *     (i.e. every number in `operands` must literally appear in the stem).
 *
 * The intent: the model may only pose an arithmetic question whose inputs it
 * actually stated. It can't invent "GDP grew 7%" out of thin air — if 7 is used
 * as an operand it must be written in the stem. The answer VALUE itself is NOT
 * required to appear in the stem (that would defeat the exercise); only the
 * inputs are checked. Malformed / unguarded drafts are dropped.
 *
 * This check is deliberately strict and can be brittle when a model paraphrases
 * numbers; see the route/report for why numeric is not part of the default
 * factory prompt.
 */
export function sanitizeDraftedNumeric(raw: unknown, max = 8): DraftNumericQuestion[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: DraftNumericQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const stem = typeof r.stem === "string" ? r.stem.trim() : "";
    if (!stem) continue;
    const value = typeof r.value === "number" ? r.value : NaN;
    if (!Number.isFinite(value)) continue;

    const operands = Array.isArray(r.operands)
      ? r.operands.map((o) => (typeof o === "number" ? o : typeof o === "string" ? o : "")).filter((o) => o !== "")
      : [];
    // every operand's digit-string must be present in the stem
    const stemDigits = new Set(digitStrings(stem));
    const allOperandsGrounded = operands.every((o) =>
      digitStrings(String(o)).every((d) => stemDigits.has(d))
    );
    // require at least one operand so the guard actually bites
    if (operands.length === 0 || !allOperandsGrounded) continue;

    const key = stem.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      stem,
      suggestedValue: value,
      unitLabel: typeof r.unitLabel === "string" ? r.unitLabel.trim().slice(0, 60) : undefined,
      rationale: typeof r.rationale === "string" ? r.rationale.trim().slice(0, 200) : "",
    });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Turn a teacher-ratified numeric draft into a real deterministic `numeric`.
 * The teacher confirms the value (`value`); relTolerance defaults to 1%. The
 * engine scores against this teacher-ratified key (GATE-002).
 */
export function toAuthoredNumeric(
  draft: DraftNumericQuestion,
  conceptSlug: string,
  value: number,
  citationIds: string[] = [],
  opts: AuthoredOptions = {}
): NumericQuestion {
  const key = Number.isFinite(value) ? value : draft.suggestedValue;
  const id = opts.id ?? `q-authored-${conceptSlug}-${stableId(draft.stem)}`;
  return {
    id,
    conceptSlug,
    type: "numeric",
    stem: draft.stem,
    difficulty: opts.difficulty ?? draft.difficulty ?? 3,
    expectedSeconds: opts.expectedSeconds ?? 75,
    transferDistance: opts.transferDistance ?? draft.transferDistance ?? 0,
    provenance: "ai_approved",
    hint: opts.hint ?? "Work it out from the numbers stated in the question.",
    citationIds,
    unitLabel: draft.unitLabel,
    answerKey: { value: key, relTolerance: 0.01 },
  };
}

/** deterministic tier → (difficulty, transferDistance) mapping used by the factory */
export function tierParams(tier: QuestionTier): { difficulty: 1 | 2 | 3 | 4 | 5; transferDistance: 0 | 1 | 2 } {
  switch (tier) {
    case "easy":
      return { difficulty: 2, transferDistance: 0 };
    case "hard":
      return { difficulty: 4, transferDistance: 1 };
    case "mixed":
    default:
      return { difficulty: 3, transferDistance: 0 };
  }
}
