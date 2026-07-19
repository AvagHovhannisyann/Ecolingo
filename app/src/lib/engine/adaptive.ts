/**
 * Adaptive difficulty selection (decision D-020, pure engine).
 *
 * As a learner's mastery of a concept grows, practice should get harder in a
 * transparent, learner-readable way. This module is PURE and deterministic — a
 * Wave-2 stream wires it into the lesson / review / bank UIs. It never mutates
 * state and never calls a model; it reads the same MasteryState the deterministic
 * mastery engine produces and picks the next question from a supplied pool.
 *
 * Two functions:
 *   - targetDifficulty(mastery): the difficulty BAND to aim for right now, plus a
 *     one-line reason shown to the learner.
 *   - pickQuestion(questions, mastery, recentIds): choose the best next question
 *     — in-band difficulty, not recently seen, deterministic tie-break by id —
 *     with a graceful fallback to the nearest difficulty when the band is empty.
 */

import type { MasteryState, Question } from "./types";

export type DifficultyBand = [min: number, max: number];

export interface TargetDifficulty {
  band: DifficultyBand;
  /** learner-facing, first-person, encouraging (§22 explainability) */
  reason: string;
}

/**
 * Map a concept's mastery to the difficulty band to practise at.
 *
 *   no evidence ................................... [1,2]  "starting fresh"
 *   conceptual < 0.4 .............................. [1,2]  "building the basics"
 *   0.4 ≤ conceptual < 0.7 ........................ [2,3]  "getting comfortable"
 *   conceptual ≥ 0.7 (transfer < 0.5) ............. [3,4]  "solid — stretching"
 *   conceptual ≥ 0.7 AND transfer ≥ 0.5 ........... [4,5]  "strong — full challenge"
 *
 * "No evidence" means undefined mastery or evidenceCount === 0, so a brand-new
 * concept always starts gentle regardless of the default dimension seeds.
 */
export function targetDifficulty(mastery: MasteryState | undefined): TargetDifficulty {
  if (!mastery || mastery.evidenceCount === 0) {
    return { band: [1, 2], reason: "Starting fresh — we'll begin with the fundamentals." };
  }
  const c = mastery.conceptual;
  if (c < 0.4) {
    return { band: [1, 2], reason: "Let's lock in the basics first before turning up the difficulty." };
  }
  if (c < 0.7) {
    return { band: [2, 3], reason: "You're getting comfortable — here's a step up." };
  }
  // conceptual ≥ 0.7
  if (mastery.transfer >= 0.5) {
    return { band: [4, 5], reason: "You're strong on this and applying it to new situations — full challenge." };
  }
  return { band: [3, 4], reason: "You're getting strong at this — leveling up the challenge." };
}

export interface PickResult {
  question: Question;
  /** the reason from targetDifficulty (why this difficulty band) */
  reason: string;
  band: DifficultyBand;
}

/** distance from a difficulty to a band interval (0 when inside the band) */
function bandDistance(difficulty: number, [min, max]: DifficultyBand): number {
  if (difficulty < min) return min - difficulty;
  if (difficulty > max) return difficulty - max;
  return 0;
}

/**
 * Pick the next question for a learner from a pool.
 *
 *  1. Filter to the concept the mastery is about (when mastery is given).
 *  2. Aim for the targetDifficulty band; among candidates, prefer:
 *       a. NOT recently seen (recentIds) over recently seen,
 *       b. smaller distance to the band (in-band = 0),
 *       c. lower id (stable, deterministic tie-break).
 *  3. When no question sits inside the band, the nearest-difficulty question
 *     wins — the learner always gets something rather than a dead end.
 *
 * Returns null only when the (concept-filtered) pool is empty.
 */
export function pickQuestion(
  questions: Question[],
  mastery: MasteryState | undefined,
  recentIds: string[] = []
): PickResult | null {
  const { band, reason } = targetDifficulty(mastery);
  const recent = new Set(recentIds);

  const pool = mastery ? questions.filter((q) => q.conceptSlug === mastery.conceptSlug) : questions.slice();
  if (pool.length === 0) return null;

  const ranked = pool
    .map((q) => ({
      q,
      isRecent: recent.has(q.id) ? 1 : 0,
      dist: bandDistance(q.difficulty, band),
    }))
    .sort((a, b) => a.isRecent - b.isRecent || a.dist - b.dist || a.q.id.localeCompare(b.q.id));

  return { question: ranked[0].q, reason, band };
}
