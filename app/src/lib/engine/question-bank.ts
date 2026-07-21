/**
 * Pure helpers for the question factory + bank (D-044).
 *
 * The factory reaches a large bank (up to 100 questions) by spreading a
 * requested total across the concepts of the ratified plan and looping the
 * item-writer route. These helpers keep that distribution — and the
 * difficulty/topic filtering students and teachers use — deterministic and
 * unit-testable, out of the React components.
 */

/** the largest bank the factory will generate in one run (teacher-requested). */
export const MAX_BANK_GENERATION = 100;

/**
 * Spread `total` as evenly as possible across `buckets` slots, front-loading the
 * remainder so earlier concepts get the extra one. Returns an array of length
 * `buckets` that sums to `total` (clamped to ≥0). `buckets <= 0` → `[]`.
 *
 *   distributeCount(10, 3) => [4, 3, 3]
 *   distributeCount(2, 5)  => [1, 1, 0, 0, 0]
 */
export function distributeCount(total: number, buckets: number): number[] {
  const b = Math.max(0, Math.trunc(buckets));
  if (b === 0) return [];
  const t = Math.max(0, Math.trunc(total));
  const base = Math.floor(t / b);
  let remainder = t - base * b;
  const out: number[] = [];
  for (let i = 0; i < b; i++) {
    out.push(base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return out;
}

export type DifficultyBucket = "easy" | "medium" | "hard";

/** map a 1–5 difficulty onto the three student-facing buckets. */
export function difficultyBucket(difficulty: number): DifficultyBucket {
  if (difficulty <= 2) return "easy";
  if (difficulty >= 4) return "hard";
  return "medium";
}

/** minimal shape the filter needs — any stored question satisfies it. */
export interface FilterableQuestion {
  difficulty: number;
  conceptSlug: string;
}

export interface BankFilter {
  /** "all" (default) or one of the three buckets */
  difficulty?: DifficultyBucket | "all";
  /** "all" (default) or an exact concept slug */
  topic?: string | "all";
}

/**
 * Filter a bank by difficulty bucket and/or topic (concept slug). Both default
 * to "all". Order is preserved, so the caller's sort/grouping is untouched.
 */
export function filterQuestions<Q extends FilterableQuestion>(questions: Q[], filter: BankFilter = {}): Q[] {
  const wantDiff = filter.difficulty ?? "all";
  const wantTopic = filter.topic ?? "all";
  return questions.filter((q) => {
    if (wantDiff !== "all" && difficultyBucket(q.difficulty) !== wantDiff) return false;
    if (wantTopic !== "all" && q.conceptSlug !== wantTopic) return false;
    return true;
  });
}
