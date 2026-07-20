"use client";

/**
 * Exam Plan (spec §8.1 nav, IDEA-110/120-lite, MVP §27.9; D-020 dark-game
 * restyle, Wave 2 Stream N). Deterministic view over the scheduler's
 * backward exam planning: which examinable concepts exist, what real
 * evidence exists for each, and when the scheduler will bring each back
 * before the exam — with the reason shown verbatim (§22, explainability is
 * the moat). Readiness here is per-concept evidence state, never a
 * predicted score (the calibrated readiness score is post-MVP, IDEA-120;
 * no readiness % is ever shown).
 *
 * Three engine reads drive the whole page:
 *  - `buildReviewQueue` — one candidate review per studied concept, with
 *    exam back-planning already applied when a date is set.
 *  - `dueNow` (called inside ExamTimeline) — splits that queue into "due
 *    today" and "overdue", with the engine's own catch-up phrasing
 *    appended to the reason text.
 *  - `retentionAt` (called inside ExamChecklist) — the same per-concept
 *    strength read the flat UI used, never summarized into one score.
 */

import Link from "next/link";
import { concepts } from "@/content/active-course";
import { buildReviewQueue } from "@/lib/engine/scheduler";
import { updatePlan } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { ExamChecklist } from "./exam/ExamChecklist";
import { ExamCountdownHeader } from "./exam/ExamCountdownHeader";
import { ExamTimeline } from "./exam/ExamTimeline";
import styles from "./exam/exam.module.css";
import { LoadingScreen } from "./LoadingScreen";

export function ExamPlanClient() {
  const state = useLearnerState();
  if (!state) return <LoadingScreen label="Loading exam plan…" />;

  const nowISO = new Date().toISOString();
  const examinable = concepts.filter((c) => c.examinable);

  const queue = buildReviewQueue({
    nowISO,
    concepts,
    mastery: state.masteryBySlug,
    prevIntervals: state.prevIntervals,
    plan: state.plan,
  });

  // Exactly the same updatePlan mutation the flat UI used — only the date
  // field changes, everything else in the plan carries through unchanged.
  const handleDateChange = (value: string) =>
    mutateLearnerState((s) =>
      updatePlan(s, { ...s.plan, examDateISO: value ? new Date(value).toISOString() : null })
    );

  return (
    <div className={styles.page}>
      <ExamCountdownHeader examISO={state.plan.examDateISO} nowISO={nowISO} onDateChange={handleDateChange} />

      <section aria-labelledby="exam-timeline-heading" className="mt-8">
        <h2 id="exam-timeline-heading" className={styles.sectionHeading}>
          Your back-planned schedule
        </h2>
        <p className={styles.sectionIntro}>
          Every review the scheduler has placed between now and your exam, earliest first.
        </p>
        <ExamTimeline queue={queue} concepts={concepts} nowISO={nowISO} />
      </section>

      <ExamChecklist concepts={examinable} masteryBySlug={state.masteryBySlug} nowISO={nowISO} queue={queue} />

      <p className="mt-6 text-sm text-app-muted">
        Weak spots close fastest through the daily loop —{" "}
        <Link href="/learn" className="underline">
          back to today&apos;s plan
        </Link>
        .
      </p>
    </div>
  );
}
