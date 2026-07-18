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

import type { McSingleQuestion } from "./types";
import { stableId } from "./ingest";

export interface DraftQuestion {
  stem: string;
  options: string[];
  /** the model's *suggested* correct option — advisory; the teacher confirms */
  suggestedIndex: number;
  rationale?: string;
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

/**
 * Turn a teacher-ratified draft into a real deterministic question. `correct
 * Index` is what the TEACHER confirmed (defaults to the model's suggestion only
 * if the teacher left it). Provenance is "ai_approved": drafted by AI, ratified
 * by a human.
 */
export function toAuthoredQuestion(
  draft: DraftQuestion,
  conceptSlug: string,
  correctIndex: number,
  citationIds: string[] = []
): McSingleQuestion {
  const safeIndex = correctIndex >= 0 && correctIndex < draft.options.length ? correctIndex : draft.suggestedIndex;
  const id = `q-authored-${conceptSlug}-${stableId(draft.stem)}`;
  return {
    id,
    conceptSlug,
    type: "mc_single",
    stem: draft.stem,
    difficulty: 2,
    expectedSeconds: 40,
    transferDistance: 0,
    provenance: "ai_approved",
    hint: "Think back to the teacher-approved source for this concept.",
    citationIds,
    options: draft.options.map((text, i) => ({ id: OPTION_IDS[i], text })),
    answerKey: { correctOptionId: OPTION_IDS[safeIndex] },
  };
}
