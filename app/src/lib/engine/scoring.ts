/**
 * Deterministic question scoring for the six MVP formats (IDEA-085..090)
 * with misconception mapping (IDEA-099, MOAT-03). AI never scores (§4).
 */

import type { Question } from "./types";
import { checkNumericAnswer } from "./equivalence";
import { scoreMatchPairs, type MatchPairsAnswer } from "./match-pairs";
import { scoreCloze } from "./cloze";

export type Answer =
  | { type: "mc_single"; optionId: string }
  | { type: "mc_multi"; optionIds: string[] }
  | { type: "numeric"; raw: string }
  | { type: "equation_assembly"; orderedTokenIds: string[] }
  | { type: "diagram_label"; slotToLabel: Record<string, string> }
  | { type: "causal_order"; orderedItemIds: string[] }
  | MatchPairsAnswer;
  | { type: "cloze"; fills: Record<string, string> };

export interface ScoreResult {
  correct: boolean;
  /** misconceptions evidenced by this specific wrong answer */
  misconceptionSlugs: string[];
  /** which reasoning step failed, when determinable (spec §23) */
  failedStep: string | null;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

const sameSeq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function scoreAnswer(q: Question, answer: Answer): ScoreResult {
  if (q.type !== answer.type) {
    throw new Error(`answer type ${answer.type} does not match question type ${q.type}`);
  }

  switch (q.type) {
    case "mc_single": {
      const a = answer as Extract<Answer, { type: "mc_single" }>;
      if (a.optionId === q.answerKey.correctOptionId) return ok();
      const chosen = q.options.find((o) => o.id === a.optionId);
      return bad(chosen?.misconceptionSlug ? [chosen.misconceptionSlug] : [], "option_choice");
    }
    case "mc_multi": {
      const a = answer as Extract<Answer, { type: "mc_multi" }>;
      if (sameSet(a.optionIds, q.answerKey.correctOptionIds)) return ok();
      const wrongPicks = a.optionIds.filter((id) => !q.answerKey.correctOptionIds.includes(id));
      const slugs = wrongPicks
        .map((id) => q.options.find((o) => o.id === id)?.misconceptionSlug)
        .filter((s): s is string => !!s);
      const missed = q.answerKey.correctOptionIds.filter((id) => !a.optionIds.includes(id));
      return bad([...new Set(slugs)], wrongPicks.length ? "included_incorrect_option" : missed.length ? "missed_correct_option" : null);
    }
    case "numeric": {
      const a = answer as Extract<Answer, { type: "numeric" }>;
      const verdict = checkNumericAnswer(a.raw, q.answerKey);
      if (verdict.correct) return ok();
      return bad([], verdict.reason === "unparseable" ? "answer_format" : "calculation");
    }
    case "equation_assembly": {
      const a = answer as Extract<Answer, { type: "equation_assembly" }>;
      if (sameSeq(a.orderedTokenIds, q.answerKey.orderedTokenIds)) return ok();
      const known = q.misconceptionOrders?.find((m) => sameSeq(m.orderedTokenIds, a.orderedTokenIds));
      return bad(known ? [known.misconceptionSlug] : [], "equation_structure");
    }
    case "diagram_label": {
      const a = answer as Extract<Answer, { type: "diagram_label" }>;
      const slots = Object.keys(q.answerKey.slotToLabel);
      const wrong = slots.filter((s) => a.slotToLabel[s] !== q.answerKey.slotToLabel[s]);
      if (wrong.length === 0) return ok();
      return bad([], `mislabeled:${wrong.join(",")}`);
    }
    case "causal_order": {
      const a = answer as Extract<Answer, { type: "causal_order" }>;
      if (sameSeq(a.orderedItemIds, q.answerKey.orderedItemIds)) return ok();
      // first divergence identifies the failed reasoning step
      const idx = q.answerKey.orderedItemIds.findIndex((id, i) => a.orderedItemIds[i] !== id);
      return bad([], idx >= 0 ? `causal_step_${idx + 1}` : null);
    }
    case "match_pairs": {
      const a = answer as Extract<Answer, { type: "match_pairs" }>;
      return scoreMatchPairs(q, a);
    case "cloze": {
      const a = answer as Extract<Answer, { type: "cloze" }>;
      return scoreCloze(q, a);
    }
  }
}

function ok(): ScoreResult {
  return { correct: true, misconceptionSlugs: [], failedStep: null };
}
function bad(misconceptionSlugs: string[], failedStep: string | null): ScoreResult {
  return { correct: false, misconceptionSlugs, failedStep };
}

/** adaptive difficulty rules (IDEA-102/103): step down on struggle, transfer up on success */
export function nextDifficulty(current: 1 | 2 | 3 | 4 | 5, lastCorrect: boolean, hintsUsed: number): 1 | 2 | 3 | 4 | 5 {
  if (!lastCorrect || hintsUsed >= 2) return Math.max(1, current - 1) as 1 | 2 | 3 | 4 | 5;
  return Math.min(5, current + 1) as 1 | 2 | 3 | 4 | 5;
}
