"use client";

/**
 * Compact review forecast: a read-only view of the deterministic scheduler
 * (buildReviewQueue — same inputs the Review page uses, no mutation). Every
 * item shows its due day and the scheduler's own §22 reason text verbatim.
 */

import Link from "next/link";
import { concepts } from "@/content/econ13210";
import { buildReviewQueue } from "@/lib/engine/scheduler";
import type { LearnerState } from "@/lib/learner-state";

const DAY = 86_400_000;

/** learner-readable due label from ISO dates (queue items are never in the past) */
export function dueLabel(dueAtISO: string, nowISO: string): string {
  const days = Math.round((Date.parse(dueAtISO.slice(0, 10)) - Date.parse(nowISO.slice(0, 10))) / DAY);
  if (days <= 0) return "Due today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

const SHOWN = 4;

export function ReviewForecast({ state, nowISO }: { state: LearnerState; nowISO: string }) {
  const queue = buildReviewQueue({
    nowISO,
    concepts,
    mastery: state.masteryBySlug,
    prevIntervals: state.prevIntervals,
    plan: state.plan,
  });
  if (queue.length === 0) return null;

  const shown = queue.slice(0, SHOWN);
  const rest = queue.length - shown.length;

  return (
    <section aria-label="Review forecast" className="mt-8">
      <h2 className="text-lg font-bold">Review forecast</h2>
      <p className="mt-1 text-sm text-app-muted">
        What the scheduler will bring back — and exactly why (§22: every review has a reason).
      </p>
      <div className="card mt-3">
        <ul>
          {shown.map((item) => {
            const c = concepts.find((x) => x.slug === item.conceptSlug);
            return (
              <li key={item.conceptSlug} className="pg-forecast-item">
                <div className="pg-forecast-top">
                  <span className="font-bold">{c?.name ?? item.conceptSlug}</span>
                  <span className="pg-due-chip">{dueLabel(item.dueAt, nowISO)}</span>
                </div>
                <p className="mt-1 text-sm text-app-muted">{item.reasonText}</p>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-2 text-sm text-app-muted">
        {rest > 0 ? `+${rest} more scheduled — ` : ""}
        <Link href="/review" className="font-bold text-[color:var(--duo-blue-text)] underline">
          Open Review
        </Link>{" "}
        to practice what&apos;s due.
      </p>
    </section>
  );
}
