"use client";

/**
 * Today's plan — the daily loop entry point (docs/02-prd.md §5.2).
 * Deterministic scheduler builds the queue; every review shows its reason.
 * The world-header artwork slot is a Higgsfield-generated background
 * (spec §17.1 "course-world background sequences") — decorative only,
 * never a truth-critical visual (GATE-002).
 */

import { AmbientHero } from "./AmbientHero";
import Image from "next/image";
import Link from "next/link";
import { concepts, conceptEdges, course } from "@/content/econ13210";
import type { Lesson } from "@/lib/engine/types";
import { buildReviewQueue, dueNow, planToday } from "@/lib/engine/scheduler";
import { updatePlan } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { UnverifiedBanner } from "./CitationChips";
import { StatsBar } from "./StatsBar";
import { WorldMap } from "./WorldMap";

export function HomeClient() {
  const state = useLearnerState();
  if (!state) return <p className="p-4 text-sm text-gray-500">Loading your plan…</p>;

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

  const remainingLessons = course.lessons.filter((l) => !state.completedLessonIds.includes(l.id));
  const unlockedLessons = remainingLessons.filter(isUnlocked);
  const lockedLessons = remainingLessons.filter((l) => !isUnlocked(l));
  const today = planToday(
    due,
    unlockedLessons.map((l) => ({ id: l.id, estimatedMinutes: l.estimatedMinutes })),
    state.plan.minutesPerDay
  );
  const plannedLessons = unlockedLessons.filter((l) => today.lessons.some((t) => t.id === l.id));

  return (
    <div>
      {/* World header — Higgsfield ambient loop over the course-world art
          (decorative; falls back to the still for reduced-motion users) */}
      <AmbientHero videoSrc="/video/world-2-solow-ambient.mp4" imageSrc="/worlds/world-2-solow.webp">
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
          <p className="text-xs uppercase tracking-wide opacity-80">World 2</p>
          <h1 className="text-xl font-semibold">Solow growth</h1>
          <p className="text-sm opacity-90">hard ideas. made intuitive.</p>
        </div>
      </AmbientHero>

      <StatsBar state={state} minutesPlanned={today.minutesPlanned} />

      <div className="mt-4">
        <UnverifiedBanner />
      </div>

      {!state.profile.onboarded && (
        <Link
          href="/onboarding"
          className="card-lesson mt-4 block border-[var(--lavender)] p-4 transition hover:bg-[#f4f1ff]"
        >
          <span className="font-bold text-[var(--lavender-text)]">Personalize your path →</span>
          <span className="block text-sm text-gray-600">
            2 minutes: your goal, schedule, and how you like ideas explained. Every step is skippable.
          </span>
        </Link>
      )}

      {/* study plan settings (IDEA-010/011, editable later per §7) */}
      <details className="mt-4 rounded-2xl border border-gray-300 p-4">
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
              className="mt-1 block w-full rounded-xl border border-gray-400 p-3"
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
              className="mt-1 block w-full rounded-xl border border-gray-400 p-3"
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

      <h2 className="mt-6 text-lg font-semibold">Today ({today.minutesPlanned} min planned)</h2>

      <ul className="mt-3 space-y-3">
        {plannedLessons.map((lesson) => (
          <li key={lesson.id}>
            <Link
              href={`/lesson/${lesson.id}`}
              className="card-lesson block p-4 transition hover:border-[var(--growth-green)] hover:bg-[var(--growth-green-tint)]"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-[var(--growth-green-text)]">
                ★ New lesson · {lesson.estimatedMinutes} min
              </span>
              <span className="block text-base font-bold">{lesson.title}</span>
              <span className="block text-sm text-gray-600">
                Core idea → intuition → interactive model → math → practice → transfer check
              </span>
            </Link>
          </li>
        ))}
        {lockedLessons.map((lesson) => {
          const prereqs = conceptEdges
            .filter((e) => e.conceptSlug === lesson.conceptSlug && e.kind === "requires")
            .map((e) => concepts.find((c) => c.slug === e.prereqSlug)?.name ?? e.prereqSlug);
          // "locked" is conveyed by the icon + label + muted surface, not by low
          // opacity — dimming the text would drop it below AA contrast
          return (
            <li key={lesson.id} className="card-lesson bg-[var(--mist-gray)]/25 p-4">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-600">🔒 Locked · {lesson.estimatedMinutes} min</span>
              <span className="block text-base font-bold text-gray-700">{lesson.title}</span>
              <span className="block text-sm text-gray-600">Unlocks after: {prereqs.join(", ")}</span>
            </li>
          );
        })}
        {today.reviews.map((r) => {
          const c = concepts.find((x) => x.slug === r.conceptSlug);
          return (
            <li key={r.conceptSlug}>
              <Link
                href="/review"
                className="card-lesson block p-4 transition hover:border-[var(--model-blue)] hover:bg-[var(--model-blue-tint)]"
              >
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--model-blue-text)]">
                  ⟳ Review · ~3 min{"overdue" in r && r.overdue ? " · catch-up" : ""}
                </span>
                <span className="block text-base font-bold">{c?.name ?? r.conceptSlug}</span>
                <span className="block text-sm text-gray-600">{r.reasonText}</span>
              </Link>
            </li>
          );
        })}
        {plannedLessons.length === 0 && lockedLessons.length === 0 && today.reviews.length === 0 && (
          <li className="card flex items-center gap-4 p-4 text-sm text-gray-600">
            {/* Higgsfield "sleeping" mascot — nothing due right now (decorative slot §17.2) */}
            <Image
              src="/art/creature-sleeping.webp"
              alt=""
              role="presentation"
              width={200}
              height={200}
              className="art-enter h-20 w-20 shrink-0 rounded-2xl object-cover"
            />
            <span>
              Nothing due right now. Your next review is already scheduled —{" "}
              <Link href="/review" className="underline">
                see when and why
              </Link>
              , or explore the{" "}
              <Link href="/lab/solow" className="underline">
                Solow Lab
              </Link>
              .
            </span>
          </li>
        )}
      </ul>

      <WorldMap state={state} />
    </div>
  );
}
