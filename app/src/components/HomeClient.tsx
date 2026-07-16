"use client";

/**
 * Today's plan — the daily loop entry point (docs/02-prd.md §5.2).
 * Deterministic scheduler builds the queue; every review shows its reason.
 * The world-header artwork slot is a Higgsfield-generated background
 * (spec §17.1 "course-world background sequences") — decorative only,
 * never a truth-critical visual (GATE-002).
 */

import Image from "next/image";
import Link from "next/link";
import { concepts, solowLesson } from "@/content/econ13210";
import { buildReviewQueue, dueNow, planToday } from "@/lib/engine/scheduler";
import { updatePlan } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { UnverifiedBanner } from "./CitationChips";
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
  const lessonDone = state.completedLessonIds.includes(solowLesson.id);
  const today = planToday(
    due,
    lessonDone ? [] : [{ id: solowLesson.id, estimatedMinutes: solowLesson.estimatedMinutes }],
    state.plan.minutesPerDay
  );

  return (
    <div>
      {/* World header — Higgsfield course-world art (decorative) */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200">
        <Image
          src="/worlds/world-2-solow.webp"
          alt=""
          role="presentation"
          width={2688}
          height={1536}
          priority
          className="h-40 w-full object-cover sm:h-56"
        />
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
          <p className="text-xs uppercase tracking-wide opacity-80">World 2</p>
          <h1 className="text-xl font-semibold">Solow growth</h1>
          <p className="text-sm opacity-90">hard ideas. made intuitive.</p>
        </div>
      </div>

      <div className="mt-4">
        <UnverifiedBanner />
      </div>

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
        {!lessonDone && (
          <li>
            <Link
              href={`/lesson/${solowLesson.id}`}
              className="block rounded-2xl border border-gray-900 p-4 hover:bg-gray-50"
            >
              <span className="text-xs uppercase tracking-wide text-gray-500">New lesson · {solowLesson.estimatedMinutes} min</span>
              <span className="block font-medium">{solowLesson.title}</span>
              <span className="block text-sm text-gray-600">
                Core idea → intuition → interactive model → math → practice → transfer check
              </span>
            </Link>
          </li>
        )}
        {today.reviews.map((r) => {
          const c = concepts.find((x) => x.slug === r.conceptSlug);
          return (
            <li key={r.conceptSlug}>
              <Link href="/review" className="block rounded-2xl border border-gray-300 p-4 hover:bg-gray-50">
                <span className="text-xs uppercase tracking-wide text-gray-500">
                  Review · ~3 min{"overdue" in r && r.overdue ? " · catch-up" : ""}
                </span>
                <span className="block font-medium">{c?.name ?? r.conceptSlug}</span>
                <span className="block text-sm text-gray-600">{r.reasonText}</span>
              </Link>
            </li>
          );
        })}
        {lessonDone && today.reviews.length === 0 && (
          <li className="rounded-2xl border border-gray-200 p-4 text-sm text-gray-600">
            Nothing due right now. Your next review is already scheduled —{" "}
            <Link href="/review" className="underline">
              see when and why
            </Link>
            , or explore the{" "}
            <Link href="/lab/solow" className="underline">
              Solow Lab
            </Link>
            .
          </li>
        )}
      </ul>

      <WorldMap state={state} />
    </div>
  );
}
