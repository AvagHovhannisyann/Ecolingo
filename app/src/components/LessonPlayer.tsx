"use client";

/**
 * Lesson player — walks the six-step lesson anatomy (LESSON-01..06).
 * Step order adapts to the learner's explanation-order preference; each step
 * has a deterministic completion criterion; interaction events are recorded.
 */

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { EvidenceEvent, Lesson, LessonStep } from "@/lib/engine/types";
import { course, getConcept, getEquation, getQuestion } from "@/content/econ13210";
import { completeLesson, recordEvidence } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { MathTex } from "./MathTex";
import { SolowLab } from "./SolowLab";
import { QuestionCard } from "./QuestionCard";
import { ExplainPanel } from "./ExplainPanel";
import { CitationChips, UnverifiedBanner } from "./CitationChips";

const STEP_TITLES: Record<LessonStep["type"], string> = {
  core_idea: "Core idea",
  intuition: "Intuition",
  visual: "See it move",
  math: "The mathematics",
  guided: "Guided practice",
  mastery_check: "Mastery check — new context",
};

export function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const state = useLearnerState();
  const [stepIndex, setStepIndex] = useState(0);
  const [visualTargetHit, setVisualTargetHit] = useState(false);
  const [stepDone, setStepDone] = useState(false);
  const [finished, setFinished] = useState(false);

  const concept = getConcept(lesson.conceptSlug);

  /**
   * LESSON-04 adaptation: the equation appears after intuition unless the
   * learner prefers math-first. Order changes only — content is never
   * rewritten (GATE-004).
   */
  const mathFirst = state?.profile.explanationOrder === "math_first";
  const steps = useMemo(() => {
    if (!mathFirst) return lesson.steps;
    const reordered = [...lesson.steps];
    const mathIdx = reordered.findIndex((s) => s.type === "math");
    const visualIdx = reordered.findIndex((s) => s.type === "visual");
    if (mathIdx > visualIdx && visualIdx >= 0) {
      const [mathStep] = reordered.splice(mathIdx, 1);
      reordered.splice(visualIdx, 0, mathStep);
    }
    return reordered;
  }, [lesson.steps, mathFirst]);
  const simpler = state?.profile.readingLevel === "simpler";
  const lessonEquation =
    course.equations.find((e) => e.conceptSlug === lesson.conceptSlug) ?? getEquation("eq-fundamental");
  const step = steps[stepIndex];

  const advance = () => {
    if (stepIndex + 1 >= steps.length) {
      mutateLearnerState((s) => completeLesson(s, lesson.id));
      setFinished(true);
    } else {
      setStepIndex((i) => i + 1);
      setStepDone(false);
      setVisualTargetHit(false);
    }
  };

  const handleEvidence = (e: EvidenceEvent, correct: boolean) => {
    mutateLearnerState((s) => recordEvidence(s, e));
    if (correct) setStepDone(true);
  };

  if (finished) {
    const mastery = state?.masteryBySlug[lesson.conceptSlug];
    return (
      <div className="rounded-2xl border border-green-600 bg-green-50 p-6">
        {/* Higgsfield-generated celebration art (spec §17.1) — decorative only */}
        <Image
          src="/art/lesson-complete.webp"
          alt=""
          role="presentation"
          width={1024}
          height={1024}
          className="art-enter mx-auto h-36 w-36 rounded-2xl object-cover"
        />
        <h2 className="mt-3 text-center text-lg font-semibold">Lesson complete 🎉</h2>
        <p className="mt-2 text-sm">
          Your mastery of <strong>{concept.name}</strong> was updated from real evidence — conceptual{" "}
          {Math.round((mastery?.conceptual ?? 0) * 100)}%, transfer {Math.round((mastery?.transfer ?? 0) * 100)}%.
        </p>
        <p className="mt-1 text-sm">
          The scheduler has queued this concept for review before you&apos;d start forgetting it — see{" "}
          <Link href="/review" className="underline">
            Review
          </Link>{" "}
          for when and why.
        </p>
        <Link href="/" className="mt-4 inline-block btn-press min-h-12 rounded-xl bg-gray-900 px-5 py-3 text-white">
          Back to today&apos;s plan
        </Link>
      </div>
    );
  }

  return (
    <div>
      <UnverifiedBanner />
      <nav aria-label="Lesson progress" className="mt-4 flex gap-1">
        {steps.map((s, i) => (
          <span
            key={s.id}
            aria-current={i === stepIndex ? "step" : undefined}
            className={`h-2 flex-1 rounded-full ${i < stepIndex ? "bg-gray-900" : i === stepIndex ? "bg-gray-500" : "bg-gray-200"}`}
            title={STEP_TITLES[s.type]}
          />
        ))}
      </nav>

      <h2 className="mt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Step {stepIndex + 1} of {steps.length}: {STEP_TITLES[step.type]}
      </h2>

      <div className="mt-2">
        {(step.type === "core_idea" || step.type === "intuition") && (
          <div>
            <p className="text-base leading-relaxed">
              {simpler && step.body.simpler ? step.body.simpler : step.body.standard}
            </p>
            <CitationChips citations={course.citations.filter((c) => step.citationIds.includes(c.id))} />
            <ExplainPanel concept={concept} equation={lessonEquation} simplerVariant={step.body.simpler ?? null} />
            <button type="button" onClick={advance} className="mt-4 btn-press min-h-12 rounded-xl bg-gray-900 px-6 text-white">
              Continue
            </button>
          </div>
        )}

        {step.type === "visual" && (
          <div>
            <p className="mb-2 text-base">{step.prompt}</p>
            <SolowLab
              onParamsChange={(p) => {
                const v = p[step.target.param];
                const hit = step.target.comparator === "gte" ? v >= step.target.value : v <= step.target.value;
                if (hit && !visualTargetHit) {
                  setVisualTargetHit(true);
                  // visual interaction is mastery evidence too (graph interpretation)
                  handleEvidence(
                    {
                      at: new Date().toISOString(),
                      conceptSlug: lesson.conceptSlug,
                      questionType: "visual",
                      correct: true,
                      difficulty: 2,
                      hintsUsed: 0,
                      timeMs: 0,
                      expectedSeconds: 60,
                      confidence: null,
                      attemptNo: 1,
                      transferDistance: 0,
                      misconceptionSlugs: [],
                    },
                    true
                  );
                }
              }}
            />
            <p className="mt-2 text-sm" role="status" aria-live="polite">
              {visualTargetHit ? step.successDescription : step.targetDescription}
            </p>
            <button
              type="button"
              onClick={advance}
              disabled={!visualTargetHit}
              className="mt-4 btn-press min-h-12 rounded-xl bg-gray-900 px-6 text-white disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        )}

        {step.type === "math" && (
          <div>
            {(() => {
              const eq = getEquation(step.equationId);
              return (
                <div>
                  <MathTex latex={eq.latex} block />
                  <ul className="mt-2 space-y-2 text-sm">
                    {eq.components.map((c) => (
                      <li key={c.latex} className="flex items-baseline gap-2">
                        <MathTex latex={c.latex} /> <span>— {c.meaning}</span>
                      </li>
                    ))}
                  </ul>
                  <CitationChips citations={course.citations.filter((c) => step.citationIds.includes(c.id))} />
                  <ExplainPanel concept={concept} equation={eq} />
                </div>
              );
            })()}
            <button type="button" onClick={advance} className="mt-4 btn-press min-h-12 rounded-xl bg-gray-900 px-6 text-white">
              Continue
            </button>
          </div>
        )}

        {(step.type === "guided" || step.type === "mastery_check") && (
          <div>
            {step.type === "mastery_check" && (
              <p className="mb-2 text-sm text-gray-700">
                New context, no hints — this checks whether the idea transfers.
              </p>
            )}
            <QuestionCard
              key={step.questionId}
              question={getQuestion(step.questionId)}
              hintsAllowed={step.completionCriterion.kind === "answer_correct" && step.completionCriterion.hintsAllowed}
              onEvidence={(e, r) => handleEvidence(e, r.correct)}
            />
            <button
              type="button"
              onClick={advance}
              disabled={!stepDone}
              className="mt-4 btn-press min-h-12 rounded-xl bg-gray-900 px-6 text-white disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
