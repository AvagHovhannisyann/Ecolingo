/**
 * Game economy v1 (D-020, Wave 2 Stream K). A Duolingo-style hearts / gems /
 * streak / quests core. Every function here is PURE and DETERMINISTIC:
 * no Date.now, no randomness, no I/O. Time always enters through an explicit
 * `nowISO` argument so the whole system is exhaustively unit-testable and the
 * GATE-002 "no AI, auditable math" invariant holds trivially.
 *
 * State is a small plain object (see EconomyState). All mutators take the
 * current state and return a NEW state; nothing is mutated in place.
 */

// ── Named tuning constants (single source of truth) ────────────────────────

/** A learner holds at most this many hearts. */
export const MAX_HEARTS = 5;
/** One heart regenerates every 4 hours of real time. */
export const HEART_REGEN_HOURS = 4;
export const HEART_REGEN_MS = HEART_REGEN_HOURS * 60 * 60 * 1000;
/** Gems for a full hearts refill (Duolingo-like premium price). */
export const REFILL_HEARTS_COST = 350;

/** Gems earned for finishing a lesson. */
export const GEMS_LESSON_COMPLETE = 20;
/** Gems earned from opening a reward chest. */
export const GEMS_CHEST = 50;

const MS_PER_DAY = 86_400_000;

// ── State shape ────────────────────────────────────────────────────────────

/**
 * Period-scoped activity counters. Each block is stamped with the UTC day /
 * month key it belongs to; reads for a different period see 0 (the counters
 * "roll over" without a background job). Simplification: day/month boundaries
 * are UTC, not the learner's local timezone — deterministic and good enough
 * for a study-habit loop.
 */
export interface EconomyCounters {
  /** UTC day key ("YYYY-MM-DD") the *Today counters belong to, or null. */
  day: string | null;
  lessonsToday: number;
  correctToday: number;
  reviewsToday: number;
  /** UTC month key ("YYYY-MM") the *ThisMonth counters belong to, or null. */
  month: string | null;
  lessonsThisMonth: number;
}

export interface EconomyState {
  /** Current hearts, always clamped to 0..MAX_HEARTS. */
  hearts: number;
  /**
   * Anchor timestamp the next heart's regeneration is measured from. Null when
   * hearts are full (no regen pending). Advancing it preserves partial progress
   * toward the next heart.
   */
  lastRegenISO: string | null;
  gems: number;
  streakCount: number;
  /** UTC day key of the last day with any recorded activity, or null. */
  lastActiveDayISO: string | null;
  /** questId → period key it was last claimed for (resets each new period). */
  questClaims: Record<string, string>;
  counters: EconomyCounters;
}

export function defaultEconomy(): EconomyState {
  return {
    hearts: MAX_HEARTS,
    lastRegenISO: null,
    gems: 0,
    streakCount: 0,
    lastActiveDayISO: null,
    questClaims: {},
    counters: {
      day: null,
      lessonsToday: 0,
      correctToday: 0,
      reviewsToday: 0,
      month: null,
      lessonsThisMonth: 0,
    },
  };
}

// ── Time helpers (UTC, pure) ───────────────────────────────────────────────

/** UTC calendar-day key, e.g. "2026-07-19". */
export function dayKeyUTC(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** UTC calendar-month key, e.g. "2026-07". */
export function monthKeyUTC(iso: string): string {
  return new Date(iso).toISOString().slice(0, 7);
}

/** Whole UTC days from dayKey a → dayKey b (b - a). Negative if b precedes a. */
export function daysBetweenUTC(dayA: string, dayB: string): number {
  const a = Date.parse(`${dayA}T00:00:00.000Z`);
  const b = Date.parse(`${dayB}T00:00:00.000Z`);
  return Math.round((b - a) / MS_PER_DAY);
}

/** Milliseconds from `nowISO` until the next UTC midnight (for a countdown). */
export function msUntilNextUTCMidnight(nowISO: string): number {
  const now = new Date(nowISO);
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(0, next - now.getTime());
}

// ── Hearts ─────────────────────────────────────────────────────────────────

/**
 * Hearts the learner effectively has RIGHT NOW, including any that have
 * regenerated since `lastRegenISO`. Pure read — does not persist the regen.
 */
export function heartsAvailable(state: EconomyState, nowISO: string): number {
  if (state.hearts >= MAX_HEARTS) return MAX_HEARTS;
  if (!state.lastRegenISO) return clampHearts(state.hearts);
  const elapsed = Date.parse(nowISO) - Date.parse(state.lastRegenISO);
  if (elapsed <= 0) return clampHearts(state.hearts);
  const regenerated = Math.floor(elapsed / HEART_REGEN_MS);
  return Math.min(MAX_HEARTS, state.hearts + regenerated);
}

/**
 * Fold any elapsed regeneration into stored state: bumps `hearts` and advances
 * `lastRegenISO` by exactly the number of whole intervals consumed (keeping
 * partial progress toward the next heart). Clears the anchor once full.
 */
export function settleHearts(state: EconomyState, nowISO: string): EconomyState {
  if (state.hearts >= MAX_HEARTS || !state.lastRegenISO) return state;
  const anchor = Date.parse(state.lastRegenISO);
  const elapsed = Date.parse(nowISO) - anchor;
  if (elapsed <= 0) return state;
  const regenerated = Math.floor(elapsed / HEART_REGEN_MS);
  if (regenerated <= 0) return state;
  const hearts = Math.min(MAX_HEARTS, state.hearts + regenerated);
  const lastRegenISO =
    hearts >= MAX_HEARTS ? null : new Date(anchor + regenerated * HEART_REGEN_MS).toISOString();
  return { ...state, hearts, lastRegenISO };
}

/**
 * Spend one heart (e.g. a wrong answer in a hearts-gated lesson). Settles any
 * pending regeneration first, then decrements. `nowISO` is required so that
 * dropping below full starts the regeneration clock.
 */
export function loseHeart(state: EconomyState, nowISO: string): EconomyState {
  const settled = settleHearts(state, nowISO);
  if (settled.hearts <= 0) return settled;
  const hearts = settled.hearts - 1;
  // Start the regen clock the moment we leave "full"; otherwise keep the
  // in-flight anchor so partial progress toward the next heart is preserved.
  const lastRegenISO = settled.lastRegenISO ?? nowISO;
  return { ...settled, hearts, lastRegenISO };
}

/** True when a gem refill is both possible (not full) and affordable. */
export function canRefillWithGems(state: EconomyState): boolean {
  return state.hearts < MAX_HEARTS && state.gems >= REFILL_HEARTS_COST;
}

/** Spend REFILL_HEARTS_COST gems to top hearts back to MAX. No-op if invalid. */
export function refillWithGems(state: EconomyState): EconomyState {
  if (!canRefillWithGems(state)) return state;
  return { ...state, hearts: MAX_HEARTS, lastRegenISO: null, gems: state.gems - REFILL_HEARTS_COST };
}

function clampHearts(h: number): number {
  return Math.min(MAX_HEARTS, Math.max(0, h));
}

// ── Gems ───────────────────────────────────────────────────────────────────

/**
 * Award gems. `reason` is accepted for call-site clarity / future analytics;
 * only positive amounts change the balance.
 */
export function awardGems(state: EconomyState, amount: number, _reason: string): EconomyState {
  if (amount <= 0) return state;
  return { ...state, gems: state.gems + amount };
}

// ── Streak ─────────────────────────────────────────────────────────────────

/**
 * Advance the study streak for activity at `nowISO`:
 *  - first activity of a brand-new day increments (consecutive) or resets to 1
 *    (a full calendar day was missed);
 *  - repeat activity the same day is a no-op.
 * Simplification: calendar days are UTC (see EconomyCounters).
 */
export function updateStreak(state: EconomyState, nowISO: string): EconomyState {
  const today = dayKeyUTC(nowISO);
  const last = state.lastActiveDayISO ? dayKeyUTC(state.lastActiveDayISO) : null;
  if (last === today) return state; // already counted today
  let streakCount: number;
  if (last === null) {
    streakCount = 1;
  } else {
    const diff = daysBetweenUTC(last, today);
    if (diff <= 0) return state; // clock skew / out-of-order — ignore
    streakCount = diff === 1 ? state.streakCount + 1 : 1;
  }
  return { ...state, streakCount, lastActiveDayISO: today };
}

// ── Quests ─────────────────────────────────────────────────────────────────

export type QuestPeriod = "daily" | "monthly";
/** Which period-scoped counter drives a quest's progress. */
export type QuestCounter = "lessonsToday" | "correctToday" | "reviewsToday" | "lessonsThisMonth";

export interface Quest {
  id: string;
  name: string;
  period: QuestPeriod;
  counter: QuestCounter;
  target: number;
  /** Gems granted on claim. */
  reward: number;
}

/**
 * Declarative quest catalog. Pure data — the engine derives all progress from
 * the learner's counters, so there are never fabricated numbers in the UI.
 */
export const QUESTS: readonly Quest[] = [
  { id: "daily-lesson", name: "Complete 1 lesson", period: "daily", counter: "lessonsToday", target: 1, reward: 20 },
  { id: "daily-correct", name: "Get 5 questions right", period: "daily", counter: "correctToday", target: 5, reward: 30 },
  { id: "daily-review", name: "Review 3 concepts", period: "daily", counter: "reviewsToday", target: 3, reward: 20 },
  { id: "monthly-lessons", name: "Complete 10 lessons", period: "monthly", counter: "lessonsThisMonth", target: 10, reward: 100 },
];

export const DAILY_QUESTS = QUESTS.filter((q) => q.period === "daily");
export const MONTHLY_QUESTS = QUESTS.filter((q) => q.period === "monthly");

/** The claim period key a quest is keyed by at `nowISO`. */
function questPeriodKey(quest: Quest, nowISO: string): string {
  return quest.period === "daily" ? dayKeyUTC(nowISO) : monthKeyUTC(nowISO);
}

export interface QuestProgress {
  quest: Quest;
  /** Current count, clamped to the target for display. */
  current: number;
  target: number;
  complete: boolean;
  claimed: boolean;
  /** Complete AND not yet claimed this period. */
  claimable: boolean;
  /** 0..1, for the progress bar. */
  fraction: number;
}

/** Raw (unclamped) counter value for a quest at `nowISO` (0 if period rolled). */
function rawCount(state: EconomyState, quest: Quest, nowISO: string): number {
  const c = state.counters;
  if (quest.period === "daily") {
    return c.day === dayKeyUTC(nowISO) ? c[quest.counter] : 0;
  }
  return c.month === monthKeyUTC(nowISO) ? c.lessonsThisMonth : 0;
}

/** Compute a quest's progress from the learner's counters. Pure read. */
export function questProgress(state: EconomyState, quest: Quest, nowISO: string): QuestProgress {
  const raw = rawCount(state, quest, nowISO);
  const complete = raw >= quest.target;
  const current = Math.min(raw, quest.target);
  const claimed = state.questClaims[quest.id] === questPeriodKey(quest, nowISO);
  return {
    quest,
    current,
    target: quest.target,
    complete,
    claimed,
    claimable: complete && !claimed,
    fraction: quest.target === 0 ? 1 : current / quest.target,
  };
}

/** All quest progress for a period (defaults to daily). */
export function questProgressList(state: EconomyState, period: QuestPeriod, nowISO: string): QuestProgress[] {
  return QUESTS.filter((q) => q.period === period).map((q) => questProgress(state, q, nowISO));
}

/** True when the quest is complete and not already claimed this period. */
export function canClaimQuest(state: EconomyState, questId: string, nowISO: string): boolean {
  const quest = QUESTS.find((q) => q.id === questId);
  if (!quest) return false;
  return questProgress(state, quest, nowISO).claimable;
}

/**
 * Claim a completed quest: awards its gems and records the claim so it cannot
 * be claimed twice in the same period. No-op if incomplete or already claimed.
 */
export function claimQuest(state: EconomyState, questId: string, nowISO: string): EconomyState {
  const quest = QUESTS.find((q) => q.id === questId);
  if (!quest) return state;
  if (!questProgress(state, quest, nowISO).claimable) return state;
  const claimed: EconomyState = {
    ...state,
    questClaims: { ...state.questClaims, [quest.id]: questPeriodKey(quest, nowISO) },
  };
  return awardGems(claimed, quest.reward, `quest:${quest.id}`);
}

// ── Activity recording (helpers the lesson/review flows call) ──────────────

/** Return counters rolled to the current UTC period (stale periods → 0). */
function rolledCounters(counters: EconomyCounters, nowISO: string): EconomyCounters {
  const day = dayKeyUTC(nowISO);
  const month = monthKeyUTC(nowISO);
  const sameDay = counters.day === day;
  const sameMonth = counters.month === month;
  return {
    day,
    lessonsToday: sameDay ? counters.lessonsToday : 0,
    correctToday: sameDay ? counters.correctToday : 0,
    reviewsToday: sameDay ? counters.reviewsToday : 0,
    month,
    lessonsThisMonth: sameMonth ? counters.lessonsThisMonth : 0,
  };
}

/**
 * Record a completed lesson: advances the streak, bumps the daily + monthly
 * lesson counters, and awards the lesson-complete gems.
 */
export function recordLessonComplete(state: EconomyState, nowISO: string): EconomyState {
  const rolled = rolledCounters(state.counters, nowISO);
  const counters: EconomyCounters = {
    ...rolled,
    lessonsToday: rolled.lessonsToday + 1,
    lessonsThisMonth: rolled.lessonsThisMonth + 1,
  };
  const withStreak = updateStreak({ ...state, counters }, nowISO);
  return awardGems(withStreak, GEMS_LESSON_COMPLETE, "lesson-complete");
}

/** Record `n` correct answers toward the daily "questions right" quest. */
export function recordCorrectAnswers(state: EconomyState, nowISO: string, n = 1): EconomyState {
  if (n <= 0) return state;
  const rolled = rolledCounters(state.counters, nowISO);
  return { ...state, counters: { ...rolled, correctToday: rolled.correctToday + n } };
}

/** Record a reviewed concept: advances the streak and bumps the review counter. */
export function recordReview(state: EconomyState, nowISO: string): EconomyState {
  const rolled = rolledCounters(state.counters, nowISO);
  const counters: EconomyCounters = { ...rolled, reviewsToday: rolled.reviewsToday + 1 };
  return updateStreak({ ...state, counters }, nowISO);
}

/** Record generic study activity (streak only) without any counter bump. */
export function recordActivity(state: EconomyState, nowISO: string): EconomyState {
  return updateStreak(state, nowISO);
}
