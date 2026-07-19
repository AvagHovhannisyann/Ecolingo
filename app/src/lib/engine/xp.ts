/**
 * XP and leveling engine (D-020, Gamification: IDEA-121 "XP for meaningful
 * completion", IDEA-123 "course levels"). Pure and deterministic — no
 * Date.now, no I/O, no dependency on learner-state/store. Callers pass in
 * whatever XP events happened; this module turns them into a number, and
 * turns any XP total into a level, progress bar, and themed rank title.
 *
 * IDEA-132 (no punishment for mistakes) is structural here, not a runtime
 * check: there is no `XpEvent` variant for a wrong answer, so an incorrect
 * attempt simply produces no event and awards zero — never a penalty.
 *
 * ---------------------------------------------------------------------
 * LEVEL CURVE — formula and rationale
 * ---------------------------------------------------------------------
 * `xpForLevel(n)` is the cumulative XP required to *reach* level n. It is a
 * triangular-number curve:
 *
 *   xpForLevel(n) = LEVEL_XP_STEP * (n - 1) * n / 2      (n >= 1)
 *
 * Equivalently: the XP cost to go from level k to level k+1 is
 * `LEVEL_XP_STEP * k` — each successive level costs exactly one more "step"
 * of XP than the previous one. That single design choice buys three things
 * the spec asks for:
 *
 * 1. Smooth early levels. Level 2 costs only `LEVEL_XP_STEP` (10) XP — less
 *    than a single lesson-completion bonus (`XP_LESSON_COMPLETE_BONUS`,
 *    15). Finishing one lesson is *guaranteed* to reach level 2 on its own,
 *    independent of how many steps or questions it contained, satisfying
 *    "level 2 within one lesson" unconditionally rather than by tuning
 *    against one example lesson shape.
 * 2. Reasonable, non-runaway growth. Because the *increment* between
 *    consecutive levels grows only linearly (by `LEVEL_XP_STEP` per level),
 *    the cumulative curve is quadratic (~ (LEVEL_XP_STEP/2) * n^2), not
 *    exponential. A learner doing a handful of lessons and reviews a day
 *    (roughly 100-150 XP/day) reaches level ~10 in under a week, level ~50
 *    in about three months, and level ~100 in under a year — a pace that
 *    matches a school-term-to-year-long course instead of stalling out or
 *    trivializing itself.
 * 3. Exact invertibility. Triangular numbers invert via the quadratic
 *    formula with *no floating-point rounding baked into the forward
 *    direction* (unlike, say, `round(k * n^1.5)`), because `(n-1)*n` is
 *    always even and `LEVEL_XP_STEP * (n-1) * n / 2` is always an exact
 *    integer. `levelForXp` uses the quadratic-formula estimate purely as a
 *    starting point and then walks to the exact boundary with integer
 *    comparisons, so `levelForXp(xpForLevel(n)) === n` holds exactly, not
 *    approximately, for every level in the supported range.
 *
 * Levels start at 1 (0 XP). There is no level cap; the curve is open-ended.
 */

// ---------------------------------------------------------------------------
// XP award constants (IDEA-121)
// ---------------------------------------------------------------------------

/** Completing a lesson step (core_idea / intuition / visual / math / guided
 *  continue-through) that isn't itself a scored question. Small and steady —
 *  rewards showing up and moving through the material without over-paying
 *  for passive steps relative to a genuine correct answer. */
export const XP_STEP_COMPLETE = 1;

/** Answering a question correctly, scaled by its difficulty tier (1-5).
 *  Linear in difficulty — a difficulty-5 question is worth exactly 5x a
 *  difficulty-1 question — so harder, more diagnostic questions pay
 *  proportionally more without a runaway multiplier. Per IDEA-132, there is
 *  no negative counterpart: a wrong answer produces no `XpEvent` at all. */
export const XP_QUESTION_CORRECT_PER_DIFFICULTY = 2;

/** Flat bonus for finishing an entire lesson (all steps + mastery check),
 *  on top of the per-step and per-question XP already earned along the way.
 *  Mirrors the "lesson complete" spike learners expect: crossing the finish
 *  line feels disproportionately good, not just proportionally good. Sized
 *  so that completing any lesson reaches level 2 by itself (see the level
 *  curve rationale above). */
export const XP_LESSON_COMPLETE_BONUS = 15;

/** Flat award for completing one spaced-repetition review item. Cheaper
 *  than a full lesson (reviews are quick, low-friction) but worth more than
 *  a single lesson step, so the scheduler's review queue (scheduler.ts)
 *  stays worth doing instead of feeling like unpaid maintenance. */
export const XP_REVIEW_COMPLETE = 5;

/** Awarded once per calendar day a study streak (stats.ts `computeStreak`)
 *  is maintained. Deliberately between a review (5) and a lesson (15): a
 *  meaningful nudge toward daily consistency (IDEA-124) that never
 *  outweighs actually learning something. */
export const XP_STREAK_DAY_BONUS = 8;

/** One XP event as reported by the caller (lesson runner, review runner,
 *  streak tracker, ...). This module never inspects wall-clock time or
 *  learner state — it only turns a list of "this happened" facts into XP. */
export type XpEvent =
  | { type: "step_complete" }
  | { type: "question_correct"; difficulty: 1 | 2 | 3 | 4 | 5 }
  | { type: "lesson_complete" }
  | { type: "review_complete" }
  | { type: "streak_day" };

function clampDifficulty(difficulty: number): 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(1, Math.round(difficulty))) as 1 | 2 | 3 | 4 | 5;
}

/** XP for a single event. Exported so callers/tests can reason about one
 *  award in isolation without building an array. Always >= 0. */
export function xpForEvent(event: XpEvent): number {
  switch (event.type) {
    case "step_complete":
      return XP_STEP_COMPLETE;
    case "question_correct":
      return XP_QUESTION_CORRECT_PER_DIFFICULTY * clampDifficulty(event.difficulty);
    case "lesson_complete":
      return XP_LESSON_COMPLETE_BONUS;
    case "review_complete":
      return XP_REVIEW_COMPLETE;
    case "streak_day":
      return XP_STREAK_DAY_BONUS;
  }
}

/** Total XP for a batch of events. Deterministic and order-independent —
 *  summation only, no event depends on any other event in the list. Never
 *  negative (every award is >= 0 and an empty list awards 0). */
export function awardXp(events: XpEvent[]): number {
  return events.reduce((total, event) => total + xpForEvent(event), 0);
}

// ---------------------------------------------------------------------------
// Level curve (IDEA-123)
// ---------------------------------------------------------------------------

/** XP cost of each successive level step; see the module-level rationale. */
export const LEVEL_XP_STEP = 10;

/** Cumulative XP required to *reach* `level` (level 1 = 0 XP). Strictly
 *  increasing in level; the inverse of `levelForXp`. Non-integer or
 *  sub-1 input is floored/clamped to the nearest valid level so the
 *  function never throws. */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return (LEVEL_XP_STEP * (n - 1) * n) / 2;
}

/** The level reached by a total XP amount: the largest `n` such that
 *  `xpForLevel(n) <= xp`. Total function — negative, NaN, or non-finite
 *  input is clamped to 0 XP (i.e. level 1) rather than throwing. Uses the
 *  closed-form quadratic-formula inverse as a starting estimate, then
 *  corrects to the exact integer boundary so that
 *  `levelForXp(xpForLevel(n)) === n` holds exactly despite the estimate
 *  being computed in floating point. */
export function levelForXp(xp: number): number {
  const clamped = Number.isFinite(xp) ? Math.max(0, xp) : 0;

  // xp = STEP/2 * (n-1) * n  =>  n = (1 + sqrt(1 + 8*xp/STEP)) / 2
  let n = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * clamped) / LEVEL_XP_STEP)) / 2));

  // The floating-point estimate can land one step off the true boundary;
  // walk to the exact answer using the exact-integer forward formula.
  let guard = 0;
  while (xpForLevel(n + 1) <= clamped && guard++ < 64) n += 1;
  guard = 0;
  while (n > 1 && xpForLevel(n) > clamped && guard++ < 64) n -= 1;

  return n;
}

export interface LevelProgress {
  /** current level, per `levelForXp` */
  level: number;
  /** XP earned past this level's own threshold */
  intoLevel: number;
  /** total XP this level requires before the next one */
  neededForNext: number;
  /** intoLevel / neededForNext, always in [0, 1) */
  fraction: number;
}

/** Level + progress-bar breakdown for a total XP amount. `fraction` is
 *  always in `[0, 1)`: it reaches 0 exactly at a level's threshold and
 *  never reaches 1, because hitting `neededForNext` would itself mean the
 *  next level was reached (and `level` would already reflect that). */
export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const clamped = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  const base = xpForLevel(level);
  const neededForNext = xpForLevel(level + 1) - base;
  const intoLevel = clamped - base;
  const fraction = neededForNext > 0 ? intoLevel / neededForNext : 0;
  return { level, intoLevel, neededForNext, fraction };
}

// ---------------------------------------------------------------------------
// Level titles — economics-flavored ranks (IDEA-123)
// ---------------------------------------------------------------------------

/** Ascending, non-overlapping level bands. The last entry's `minLevel` has
 *  no upper bound — it covers every level from there up, which is what
 *  makes `titleForLevel` total over the whole open-ended curve. */
const LEVEL_TITLES: { minLevel: number; title: string }[] = [
  { minLevel: 1, title: "Curious Consumer" },
  { minLevel: 3, title: "Apprentice Optimizer" },
  { minLevel: 5, title: "Marginal Thinker" },
  { minLevel: 8, title: "Scarcity Strategist" },
  { minLevel: 11, title: "Budget-Line Tactician" },
  { minLevel: 15, title: "Equilibrium Seeker" },
  { minLevel: 20, title: "Elasticity Adept" },
  { minLevel: 25, title: "Comparative-Advantage Analyst" },
  { minLevel: 32, title: "Macro Strategist" },
  { minLevel: 40, title: "Steady-State Scholar" },
  { minLevel: 50, title: "General-Equilibrium Virtuoso" },
  { minLevel: 75, title: "Golden-Rule Sage" },
];

/** Total function: any input (including 0, negative, NaN, +/-Infinity, or a
 *  non-integer) is clamped to a valid level. NaN and -Infinity fall back to
 *  the lowest level (1); +Infinity maps to the highest defined band rather
 *  than the lowest, since "infinite level" is unambiguously "at least as
 *  advanced as the top rank" — clamping it to level 1 would be backwards. */
function clampLevel(level: number): number {
  if (Number.isNaN(level) || level === -Infinity) return 1;
  if (level === Infinity) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.floor(level));
}

/** Themed rank title for a level. Total function: never throws, never
 *  returns undefined, for any numeric input. */
export function titleForLevel(level: number): string {
  const n = clampLevel(level);
  let title = LEVEL_TITLES[0].title;
  for (const band of LEVEL_TITLES) {
    if (n >= band.minLevel) title = band.title;
    else break;
  }
  return title;
}
