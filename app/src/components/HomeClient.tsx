"use client";

/**
 * The learner home (/learn) — a Duolingo-style vertical skill path (D-020,
 * Wave 2 Stream H). A sticky green section header names the current lesson; a
 * winding path of 3D nodes below shows completed / current / locked lessons,
 * a review gate when the scheduler has due reviews, a reward-chest milestone,
 * the Eco mascot beside the current node, and an end-of-section trophy.
 *
 * Behaviour invariants preserved from the previous list view:
 *  - Prerequisite gating (MOAT-02) — the exact isUnlocked rule (requires-edges
 *    with mastery evidence, teachable-slug guard).
 *  - The deterministic scheduler drives what's due (buildReviewQueue/dueNow/
 *    planToday); the review node surfaces its reason text (§22 explainability).
 *  - The onboarding invitation ("Personalize your path") for un-onboarded users.
 *  - The honesty banner (UnverifiedBanner, GATE-001) and the editable study
 *    plan (minutes/day, exam date).
 *  - All nodes/stars/locks are CSS/SVG UI; art-v2 images are decorative only
 *    (GATE-002). Motion is gated behind prefers-reduced-motion in the scoped CSS.
 */

import Link from "next/link";
import { concepts, conceptEdges, course } from "@/content/econ13210";
import type { Lesson } from "@/lib/engine/types";
import { buildReviewQueue, dueNow, planToday } from "@/lib/engine/scheduler";
import { updatePlan } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { UnverifiedBanner } from "./CitationChips";
import { SectionHeader } from "./path/SectionHeader";
import { SkillPath, type LessonRow } from "./path/SkillPath";

export function HomeClient() {
  const state = useLearnerState();
  if (!state) return <p className="p-4 text-sm text-app-muted">Loading your plan…</p>;

  const nowISO = new Date().toISOString();
  const queue = buildReviewQueue({
    nowISO,
    concepts,
    mastery: state.masteryBySlug,
    prevIntervals: state.prevIntervals,
    plan: state.plan,
  });
  const due = dueNow(queue, nowISO);

  /**
   * Prerequisite gating (MOAT-02): a lesson unlocks once every "requires"
   * prerequisite of its concept has real mastery evidence. A prerequisite
   * only blocks if the course can actually teach it (some lesson covers it) —
   * otherwise the path could deadlock on concepts with no lesson yet.
   */
  const teachableSlugs = new Set(course.lessons.map((l) => l.conceptSlug));
  const isUnlocked = (lesson: Lesson) =>
    conceptEdges
      .filter((e) => e.conceptSlug === lesson.conceptSlug && e.kind === "requires" && teachableSlugs.has(e.prereqSlug))
      .every((e) => (state.masteryBySlug[e.prereqSlug]?.evidenceCount ?? 0) > 0);

  const prereqNamesFor = (lesson: Lesson) =>
    conceptEdges
      .filter((e) => e.conceptSlug === lesson.conceptSlug && e.kind === "requires")
      .map((e) => concepts.find((c) => c.slug === e.prereqSlug)?.name ?? e.prereqSlug);

  // The next lesson to do: the first unlocked, not-yet-completed lesson in
  // course order (linear gating guarantees at most one).
  const currentLesson = course.lessons.find(
    (l) => !state.completedLessonIds.includes(l.id) && isUnlocked(l)
  );

  const rows: LessonRow[] = course.lessons.map((lesson) => {
    const done = state.completedLessonIds.includes(lesson.id);
    const status = done ? "done" : lesson.id === currentLesson?.id ? "current" : "locked";
    return { lesson, status, prereqNames: status === "locked" ? prereqNamesFor(lesson) : [] };
  });

  // Today's plan (minutes) — still driven by the scheduler budget.
  const unlockedLessons = course.lessons.filter(
    (l) => !state.completedLessonIds.includes(l.id) && isUnlocked(l)
  );
  const today = planToday(
    due,
    unlockedLessons.map((l) => ({ id: l.id, estimatedMinutes: l.estimatedMinutes })),
    state.plan.minutesPerDay
  );

  const dueReviewReason = due.length > 0 ? due[0].reasonText : null;
  const headerTitle = currentLesson ? currentLesson.title : "Section complete — nice work";
  const headerHref = currentLesson ? `/lesson/${currentLesson.id}` : null;

  return (
    <div className="sp">
      <SectionHeader eyebrow="Section 1 · Solow growth" title={headerTitle} href={headerHref} />

      <div className="mt-4">
        <UnverifiedBanner />
      </div>

      {!state.profile.onboarded && (
        <Link
          href="/onboarding"
          className="card-lesson mt-4 block border-[var(--lavender)] p-4 transition hover:bg-[color:var(--app-surface-2)]"
        >
          <span className="font-bold text-[var(--lavender-text)]">Personalize your path →</span>
          <span className="block text-sm text-app-muted">
            2 minutes: your goal, schedule, and how you like ideas explained. Every step is skippable.
          </span>
        </Link>
      )}

      {/* study plan settings (IDEA-010/011, editable later per §7) */}
      <details className="mt-4 rounded-2xl border border-[color:var(--app-border)] p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Your plan: {state.plan.minutesPerDay} min/day
          {state.plan.examDateISO ? `, exam ${state.plan.examDateISO.slice(0, 10)}` : ", no exam date set"}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Minutes per day (why: sizes your daily plan)
            <input
              type="number"
              min={5}
              max={120}
              className="mt-1 block w-full rounded-xl border border-[color:var(--app-border)] p-3"
              value={state.plan.minutesPerDay}
              onChange={(e) =>
                mutateLearnerState((s) => updatePlan(s, { ...s.plan, minutesPerDay: Math.max(5, Number(e.target.value) || 20) }))
              }
            />
          </label>
          <label className="block text-sm">
            Exam date (why: reviews are back-planned from it)
            <input
              type="date"
              className="mt-1 block w-full rounded-xl border border-[color:var(--app-border)] p-3"
              value={state.plan.examDateISO?.slice(0, 10) ?? ""}
              onChange={(e) =>
                mutateLearnerState((s) =>
                  updatePlan(s, {
                    ...s.plan,
                    examDateISO: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                )
              }
            />
          </label>
        </div>
      </details>

      <p className="sp-today">
        Today <span>· {today.minutesPlanned} min planned</span>
      </p>

      <SkillPath rows={rows} dueReviewReason={dueReviewReason} mascotSrc="/art-v2/eco-point.webp" />
    </div>
  );
}
