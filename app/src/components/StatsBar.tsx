"use client";

/**
 * In-page goal strip on the learner home (IDEA-121/124/133). The streak /
 * gems / hearts live in the fixed top stat strip (AppStatBar); here we surface
 * the day's *plan* in context — today's streak and the minutes planned — right
 * above the path. Streaks never shame: a fresh day shows yesterday's streak
 * until it's extended, and rest days are planned, not punished.
 */

import { computeStreak } from "@/lib/stats";
import type { LearnerState } from "@/lib/learner-state";
import { FlameIcon } from "./icons";

export function StatsBar({ state, minutesPlanned }: { state: LearnerState; minutesPlanned: number }) {
  const streak = computeStreak(
    state.auditLog.map((a) => a.at),
    new Date().toISOString()
  );
  return (
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Today at a glance">
      <span className="stat-chip" title="Study streak">
        <FlameIcon className="h-5 w-5" />
        <span className="text-[color:var(--duo-gold)]">{streak}</span>
        <span className="text-app-muted">day{streak === 1 ? "" : "s"}</span>
      </span>
      <span className="stat-chip" title="Today's plan">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="none" stroke="var(--duo-blue)" strokeWidth="2.4">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="0.5" fill="var(--duo-blue)" />
        </svg>
        <span>{minutesPlanned}</span>
        <span className="text-app-muted">min today</span>
      </span>
    </div>
  );
}
