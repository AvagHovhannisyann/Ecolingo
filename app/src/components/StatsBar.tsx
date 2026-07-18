"use client";

/**
 * Streak / XP / daily-goal chips (IDEA-121/124/133). Streaks never shame:
 * a fresh day shows yesterday's streak until it's extended, and rest days
 * are planned, not punished. XP comes only from mastery evidence.
 */

import { computeStreak } from "@/lib/stats";
import type { LearnerState } from "@/lib/learner-state";

export function StatsBar({ state, minutesPlanned }: { state: LearnerState; minutesPlanned: number }) {
  const streak = computeStreak(
    state.auditLog.map((a) => a.at),
    new Date().toISOString()
  );
  return (
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Your stats">
      <span className="stat-chip" title="Study streak">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--soft-coral)]" aria-hidden fill="currentColor">
          <path d="M12 2s1 3.2-1.5 6C8.2 10.5 7 12.3 7 14.5A5 5 0 0 0 17 15c0-1.6-.8-2.7-1.6-3.8-.5 1-1.2 1.6-1.9 2 .3-2.4-.3-5.5-1.5-7.2C11.4 4.6 12 2 12 2Z" />
        </svg>
        {streak} day{streak === 1 ? "" : "s"}
        <span className="sr-only">study streak</span>
      </span>
      <span className="stat-chip" title="Experience points from real mastery evidence">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--sun-yellow)]" aria-hidden fill="currentColor">
          <path d="M12 2.5l2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L12 16.2l-5.6 3.3 1.4-6.2L3 9l6.4-.6L12 2.5Z" />
        </svg>
        {state.xp} XP
      </span>
      <span className="stat-chip" title="Today's plan">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--model-blue)]" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="0.5" fill="currentColor" />
        </svg>
        {minutesPlanned} min today
      </span>
    </div>
  );
}
