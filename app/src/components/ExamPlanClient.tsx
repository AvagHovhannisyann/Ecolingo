"use client";

/**
 * Exam Plan (spec §8.1 nav, IDEA-110/120-lite, MVP §27.9).
 * Deterministic view over the scheduler's backward exam planning: which
 * examinable concepts exist, how strong each one currently is, and when the
 * scheduler will bring each back before the exam — with the reason shown.
 * Readiness here is a per-concept traffic light derived from evidence, not
 * a predicted score (the calibrated readiness score is post-MVP, IDEA-120).
 */

import Image from "next/image";
import Link from "next/link";
import { AmbientHero } from "./AmbientHero";
import { concepts } from "@/content/econ13210";
import { retentionAt } from "@/lib/engine/mastery";
import { buildReviewQueue } from "@/lib/engine/scheduler";
import { updatePlan } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";

export function ExamPlanClient() {
  const state = useLearnerState();
  if (!state) return <p className="p-4 text-sm text-gray-500">Loading exam plan…</p>;

  const nowISO = new Date().toISOString();
  const exam = state.plan.examDateISO;
  const daysLeft = exam ? Math.max(0, Math.ceil((Date.parse(exam) - Date.parse(nowISO)) / 86_400_000)) : null;

  const queue = buildReviewQueue({
    nowISO,
    concepts,
    mastery: state.masteryBySlug,
    prevIntervals: state.prevIntervals,
    plan: state.plan,
  });

  const examinable = concepts.filter((c) => c.examinable);

  const band = (slug: string): { label: string; cls: string } => {
    const m = state.masteryBySlug[slug];
    if (!m || m.evidenceCount === 0) return { label: "Not started", cls: "bg-gray-100 text-gray-700" };
    const r = retentionAt(m, nowISO);
    const strength = Math.min(m.conceptual, Math.max(r, 0));
    if (strength >= 0.55 && m.transfer >= 0.4) return { label: "Strong", cls: "bg-green-100 text-green-900" };
    if (strength >= 0.35) return { label: "Developing", cls: "bg-yellow-100 text-yellow-900" };
    return { label: "At risk", cls: "bg-orange-100 text-orange-900" };
  };

  return (
    <div>
      {/* Higgsfield summit-basecamp ambient loop (approved decorative slot §17.2;
          reduced-motion + decode-failure users get the still) */}
      <div className="mb-4">
        <AmbientHero videoSrc="/art/exam-ambient.mp4" imageSrc="/art/exam-header.webp" width={1344} height={768}>
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
            <h1 className="text-xl font-semibold">Exam plan</h1>
            <p className="text-sm opacity-90">Every checkpoint on the trail to the summit.</p>
          </div>
        </AmbientHero>
      </div>

      <div className="mt-3 rounded-2xl border border-gray-300 p-4">
        {exam ? (
          <p className="text-sm">
            Exam on <strong>{exam.slice(0, 10)}</strong> — <strong>{daysLeft}</strong> day{daysLeft === 1 ? "" : "s"} left.
            The scheduler back-plans every examinable concept to be reviewed inside this window.
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Higgsfield calm-horizon empty-state art (decorative slot §17.2) */}
            <Image
              src="/art/exam-no-date.webp"
              alt=""
              role="presentation"
              width={640}
              height={360}
              className="art-enter h-24 w-full shrink-0 rounded-xl object-cover sm:h-20 sm:w-36"
            />
            <p className="text-sm">
              No exam date set — reviews follow pure retention timing. Set a date and the scheduler will
              back-plan from it (why we ask: examinable concepts get pulled forward so nothing is met for the
              first time in exam week).
            </p>
          </div>
        )}
        <label className="mt-3 block max-w-xs text-sm">
          Exam date
          <input
            type="date"
            className="mt-1 block w-full rounded-xl border border-gray-400 p-3"
            value={exam?.slice(0, 10) ?? ""}
            onChange={(e) =>
              mutateLearnerState((s) =>
                updatePlan(s, { ...s.plan, examDateISO: e.target.value ? new Date(e.target.value).toISOString() : null })
              )
            }
          />
        </label>
      </div>

      <h2 className="mt-6 font-medium">Examinable concepts ({examinable.length})</h2>
      <ul className="mt-2 space-y-2">
        {examinable.map((c) => {
          const b = band(c.slug);
          const item = queue.find((q) => q.conceptSlug === c.slug);
          return (
            <li key={c.slug} className="rounded-2xl border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <span className={`rounded-full px-3 py-1 text-xs ${b.cls}`}>{b.label}</span>
              </div>
              <p className="mt-1 text-xs text-gray-600">
                Importance {"★".repeat(c.importance)}
                {item
                  ? ` · next review ${new Date(item.dueAt).toLocaleDateString()} — ${item.reasonText}`
                  : " · appears in your path once its lesson is reached"}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-sm text-gray-600">
        Weak spots close fastest through the daily loop —{" "}
        <Link href="/" className="underline">
          back to today&apos;s plan
        </Link>
        .
      </p>
    </div>
  );
}
