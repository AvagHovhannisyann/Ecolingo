/**
 * Learner display stats (IDEA-124 streaks). Deterministic and forgiving:
 * a streak counts consecutive study days ending today or yesterday —
 * being mid-day without studying yet never shows a broken streak.
 */

export function distinctStudyDays(dates: string[]): string[] {
  return [...new Set(dates.map((d) => d.slice(0, 10)))].sort();
}

export function computeStreak(dates: string[], todayISO: string): number {
  const days = new Set(distinctStudyDays(dates));
  if (days.size === 0) return 0;
  const today = todayISO.slice(0, 10);
  const dayMs = 86_400_000;
  let cursor = Date.parse(today);
  // streak may end today or yesterday (today not studied yet ≠ broken)
  if (!days.has(today)) {
    cursor -= dayMs;
    if (!days.has(new Date(cursor).toISOString().slice(0, 10))) return 0;
  }
  let streak = 0;
  while (days.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak += 1;
    cursor -= dayMs;
  }
  return streak;
}
