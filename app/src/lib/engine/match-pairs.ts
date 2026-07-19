/**
 * MATCH PAIRS — Duolingo-style "tap the matching pairs" exercise format
 * (Wave 2 Stream AC, D-020). AI never scores (§4): a pair's shared `id` in
 * `MatchPairsQuestion.pairs` IS the answer key, and this module is the only
 * place that decides correctness or lays out the two tappable columns.
 *
 * Scoring follows the same idiom as diagram_label in scoring.ts: boolean
 * `correct` (no partial credit — mc_multi in scoring.ts confirms that's the
 * house style, not an exception), with a `failedStep` string carrying a
 * per-pair correctness breakdown for feedback, all inside the unmodified
 * `ScoreResult` shape. Duplicate or unknown ids in a submitted answer are
 * rejected outright; this function never throws.
 */

import type { MatchPairsQuestion } from "./types";
import type { ScoreResult } from "./scoring";

export interface MatchPairsAnswer {
  type: "match_pairs";
  /**
   * Each entry claims "the left card from pair `leftId` belongs with the
   * right card from pair `rightId`". A claim is correct iff leftId ===
   * rightId (both name the same canonical pair) — that's the whole answer
   * key, so there is nothing else to validate against.
   */
  matches: { leftId: string; rightId: string }[];
}

function ok(): ScoreResult {
  return { correct: true, misconceptionSlugs: [], failedStep: null };
}
function bad(failedStep: string | null): ScoreResult {
  return { correct: false, misconceptionSlugs: [], failedStep };
}

/**
 * Deterministic scoring for match_pairs. All pairs correctly recombined →
 * correct. Anything else → incorrect, with `failedStep` set to
 * `mismatched:<sorted pair ids>` naming every pair that was either matched
 * wrong or never submitted at all — the per-pair breakdown feedback needs.
 * A malformed answer (duplicate or unknown ids on either side) is rejected
 * with a distinct diagnostic `failedStep` rather than crashing or silently
 * mis-scoring.
 */
export function scoreMatchPairs(question: MatchPairsQuestion, answer: MatchPairsAnswer): ScoreResult {
  const validIds = new Set(question.pairs.map((p) => p.id));
  const leftIds = answer.matches.map((m) => m.leftId);
  const rightIds = answer.matches.map((m) => m.rightId);

  if (new Set(leftIds).size !== leftIds.length || new Set(rightIds).size !== rightIds.length) {
    return bad("duplicate_match_id");
  }
  if (leftIds.some((id) => !validIds.has(id)) || rightIds.some((id) => !validIds.has(id))) {
    return bad("unknown_match_id");
  }

  const wrongPairIds = answer.matches.filter((m) => m.leftId !== m.rightId).map((m) => m.leftId);
  const matchedLeftIds = new Set(leftIds);
  const missingPairIds = [...validIds].filter((id) => !matchedLeftIds.has(id));

  const allCorrect = wrongPairIds.length === 0 && answer.matches.length === question.pairs.length;
  if (allCorrect) return ok();

  const breakdown = [...new Set([...wrongPairIds, ...missingPairIds])].sort();
  return bad(`mismatched:${breakdown.join(",")}`);
}

export interface ShuffledCard {
  pairId: string;
  text: string;
}

export interface ShuffledSides {
  left: ShuffledCard[];
  right: ShuffledCard[];
}

/** Numerical-Recipes-style LCG step, kept in [0, 233280) — same constants as
 *  the seeded shuffle already used for equation_assembly / causal_order in
 *  QuestionCard.tsx, so the codebase has one deterministic-shuffle idiom. */
function lcgNext(state: number): number {
  return (state * 9301 + 49297) % 233280;
}

function normalizeSeed(seed: number): number {
  const n = Math.abs(Math.trunc(seed)) % 233280;
  return n === 0 ? 1 : n;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const a = [...items];
  let s = normalizeSeed(seed);
  for (let i = a.length - 1; i > 0; i--) {
    s = lcgNext(s);
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** salt that separates the right column's permutation from the left
 *  column's for the same seed — without it, both columns would shuffle in
 *  lockstep and every left[i]/right[i] pair would trivially align */
const RIGHT_COLUMN_SALT = 0x9e3779b9;

/**
 * Seeded, deterministic layout for the two tappable columns: same
 * (question, seed) always reproduces byte-identical order (no `Math.random`
 * anywhere), so a re-render or a resumed session shows the same board. The
 * two columns are shuffled independently; if that ever coincidentally lines
 * every pair up by position (the puzzle would already be "solved" just by
 * reading top-to-bottom), one swap on the right column guarantees at least
 * one pair is displaced whenever more than one pair exists.
 */
export function shuffledSides(question: MatchPairsQuestion, seed: number): ShuffledSides {
  const left = seededShuffle(
    question.pairs.map((p) => ({ pairId: p.id, text: p.left })),
    seed
  );
  const right = seededShuffle(
    question.pairs.map((p) => ({ pairId: p.id, text: p.right })),
    seed + RIGHT_COLUMN_SALT
  );

  if (left.length > 1 && left.every((card, i) => card.pairId === right[i].pairId)) {
    [right[0], right[1]] = [right[1], right[0]];
  }

  return { left, right };
}
