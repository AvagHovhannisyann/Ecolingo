"use client";

/**
 * Lesson player — the D-020 one-exercise-per-screen flow. It walks the same
 * six-step lesson anatomy (core idea → intuition → visual → math → guided →
 * mastery check) as before, but presents each step as its own screen inside
 * LessonShell: a close/progress/hearts top row, vertically centred content, a
 * bottom-anchored CHECK/CONTINUE, and — after a question is scored — the
 * signature FeedbackStrip sliding up from the bottom.
 *
 * What did NOT change (invariants):
 *  - Scoring stays 100% deterministic in QuestionCard → engine (GATE-002).
 *  - Mastery updates and completedLessonIds writes go through the exact same
 *    recordEvidence / completeLesson calls as before (GATE-006).
 *  - Step order still adapts to explanationOrder; content is never rewritten.
 *
 * What is NEW:
 *  - Adaptive difficulty (D-020): the guided/mastery question steps pick their
 *    question via engine `pickQuestion` from the bank — filtered to the fixed
 *    question's concept and transfer role — using the learner's live mastery and
 *    the ids already seen this lesson. Fallback: the step's fixed questionId when
 *    pickQuestion returns null (empty pool).
 */

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Concept, Equation, EvidenceEvent, Lesson, LessonStep, Question, QuestionStep } from "@/lib/engine/types";
import type { ScoreResult } from "@/lib/engine/scoring";
import type { TeachingStyle } from "@/lib/engine/teaching-style";
import { pickQuestion } from "@/lib/engine/adaptive";
import { course, getConcept } from "@/content/active-course";
import { completeLesson, recordEvidence } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { MathTex } from "./MathTex";
import { SolowLab } from "./SolowLab";
import { QuestionCard } from "./QuestionCard";
import { ExplainPanel } from "./ExplainPanel";
import { GroundedCitationChips, UnverifiedBanner } from "./CitationChips";
import { CharacterSpeaks } from "./lesson/CharacterSpeaks";
import { LessonShell } from "./lesson/LessonShell";
import { FeedbackStrip } from "./lesson/FeedbackStrip";
import { QuitModal } from "./lesson/QuitModal";
import { LessonComplete } from "./lesson/LessonComplete";

const STEP_TITLES: Record<LessonStep["type"], string> = {
  core_idea: "Core idea",
  intuition: "Intuition",
  visual: "See it move",
  math: "The mathematics",
  guided: "Guided practice",
  mastery_check: "Mastery check — new context",
};

interface ResolvedQuestion {
  question: Question;
  /** learner-facing reason for the difficulty band (§22 explainability) */
  reason: string | null;
}

export function LessonPlayer({
  lesson,
  extraConcepts = [],
  extraQuestions = [],
  extraEquations = [],
  teachingStyle = null,
}: {
  lesson: Lesson;
  /** D-022: plan-scoped concepts/questions for compiled courses — checked
   *  before the static content module so enrolled-course lessons play. */
  extraConcepts?: Concept[];
  extraQuestions?: Question[];
  /** plan-scoped equations (sample course / future compiled math) — checked
   *  before the static content module so math steps and explain panels resolve. */
  extraEquations?: Equation[];
  /** D-029: the enrolled course's teaching style, forwarded to every explain
   *  panel so the tutor speaks in the teacher's voice. */
  teachingStyle?: TeachingStyle | null;
}) {
  const state = useLearnerState();
  const [stepIndex, setStepIndex] = useState(0);
  const [visualTargetHit, setVisualTargetHit] = useState(false);
  const [finished, setFinished] = useState(false);
  const [feedback, setFeedback] = useState<{ question: Question; result: ScoreResult } | null>(null);
  const [quitOpen, setQuitOpen] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  // XP-style summary counters (first-attempt correctness, truthful).
  const attemptedRef = useRef<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(0);
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const resolveConcept = (slug: string) => extraConcepts.find((c) => c.slug === slug) ?? getConcept(slug);
  const concept = resolveConcept(lesson.conceptSlug);

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
  // Compiled courses carry no approved equations yet (the compiler refuses to
  // fabricate LaTeX — GATE-002); their explain panel gets equation=null rather
  // than someone else's formula.
  // No built-in course equations remain (D-022); compiled lessons never carry
  // approved LaTeX. The explain panel simply gets no equation.
  const findEquationByConcept = (slug: string) =>
    extraEquations.find((e) => e.conceptSlug === slug) ??
    course.equations.find((e) => e.conceptSlug === slug) ??
    null;
  const lessonEquation = findEquationByConcept(lesson.conceptSlug);
  const step = steps[stepIndex];

  // ---- adaptive question resolution (D-020) --------------------------------
  // Each guided/mastery step's question is resolved once, when the step is first
  // entered (in the navigation handler, never in render/effect), and frozen so it
  // can't change when mastery updates mid-lesson. recentIds spans the ids already
  // resolved this lesson — the guided (transfer-0) and mastery (transfer-1) pools
  // are disjoint, so this only ever matters within a single pool. The first
  // question step is always reached via advance(), so it is always resolved
  // before it renders (step 0 is a text step in every lesson).
  const [resolvedQuestions, setResolvedQuestions] = useState<Record<string, ResolvedQuestion>>({});

  const resolveStepQuestion = (
    qStep: QuestionStep,
    prev: Record<string, ResolvedQuestion>
  ): Record<string, ResolvedQuestion> => {
    if (prev[qStep.id]) return prev;
    const fixed = extraQuestions.find((q) => q.id === qStep.questionId);
    // No built-in course questions remain; a compiled lesson's question step
    // only resolves from its own plan questions. If none, skip resolution.
    if (!fixed) return prev;
    // Same concept AND transfer role as the pedagogically-chosen fixed question,
    // so a guided step still draws practice-level and a mastery check still draws
    // transfer-level questions.
    const pool = [...course.questions, ...extraQuestions].filter(
      (q) => q.conceptSlug === fixed.conceptSlug && q.transferDistance === fixed.transferDistance
    );
    const mastery = state?.masteryBySlug[fixed.conceptSlug];
    // First run of a lesson is DETERMINISTIC: the learner gets the
    // teacher-authored question for this step (the authored sequence is the
    // pedagogical canon). Adaptation kicks in on REPLAYS, where variety and
    // difficulty matched to accumulated mastery are what a repeat needs.
    const shown = Object.values(prev).map((r) => r.question.id);
    const isReplay = state?.completedLessonIds.includes(lesson.id) ?? false;
    const picked = isReplay ? pickQuestion(pool, mastery, shown) : null;
    // Fallback either way: the step's fixed questionId.
    const resolved: ResolvedQuestion = picked
      ? { question: picked.question, reason: picked.reason }
      : { question: fixed, reason: null };
    return { ...prev, [qStep.id]: resolved };
  };

  // ---- navigation ----------------------------------------------------------
  const goToStep = (nextIndex: number) => {
    const next = steps[nextIndex];
    if (next && (next.type === "guided" || next.type === "mastery_check")) {
      setResolvedQuestions((prev) => resolveStepQuestion(next as QuestionStep, prev));
    }
    setStepIndex(nextIndex);
    setVisualTargetHit(false);
  };

  const advance = () => {
    setFeedback(null);
    if (stepIndex + 1 >= steps.length) {
      mutateLearnerState((s) => completeLesson(s, lesson.id));
      setFinished(true);
    } else {
      goToStep(stepIndex + 1);
    }
  };

  // Send focus to each new step's heading (a11y focus contract).
  useEffect(() => {
    if (!finished) headingRef.current?.focus();
  }, [stepIndex, finished]);

  const recordVisualEvidence = () => {
    const e: EvidenceEvent = {
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
    };
    mutateLearnerState((s) => recordEvidence(s, e));
  };

  const handleQuestionEvidence = (stepId: string, e: EvidenceEvent, r: ScoreResult, q: Question) => {
    // Mastery update — unchanged path (GATE-006).
    mutateLearnerState((s) => recordEvidence(s, e));
    // First-attempt bookkeeping for the completion summary.
    if (!attemptedRef.current.has(stepId)) {
      attemptedRef.current.add(stepId);
      setAttempted((n) => n + 1);
      if (r.correct) setFirstTryCorrect((n) => n + 1);
    }
    setFeedback({ question: q, result: r });
  };

  if (finished) {
    const mastery = state?.masteryBySlug[lesson.conceptSlug];
    return (
      <LessonComplete
        conceptName={concept.name}
        stepsCompleted={steps.length}
        questionsCorrect={firstTryCorrect}
        questionsAttempted={attempted}
        conceptualPct={Math.round((mastery?.conceptual ?? 0) * 100)}
        transferPct={Math.round((mastery?.transfer ?? 0) * 100)}
      />
    );
  }

  const isQuestionStep = step.type === "guided" || step.type === "mastery_check";

  // ---- per-step body -------------------------------------------------------
  const heading = (
    <h2
      ref={headingRef}
      tabIndex={-1}
      className="text-sm font-semibold uppercase tracking-wide text-app-muted outline-none"
    >
      {STEP_TITLES[step.type]}
    </h2>
  );

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (step.type === "core_idea" || step.type === "intuition") {
    // Character-speaks: the cast (Duolingo-style ensemble) takes turns —
    // which character teaches this concept is a stable hash of its slug, so
    // a concept always keeps its teacher across sessions.
    const CAST = ["/art-v2/eco-wave.webp", "/art-cast/pip.webp", "/art-cast/lumi.webp", "/art-cast/bo.webp"];
    let castHash = 0;
    for (let i = 0; i < lesson.conceptSlug.length; i++) castHash = (castHash * 31 + lesson.conceptSlug.charCodeAt(i)) | 0;
    const speaker = CAST[Math.abs(castHash) % CAST.length];
    body = (
      <div>
        {heading}
        {/* character-speaks presentation: a cast character delivers the line
            in a speech bubble with an optional read-aloud button (Web Speech) */}
        <CharacterSpeaks
          text={simpler && step.body.simpler ? step.body.simpler : step.body.standard}
          characterSrc={speaker}
        />
        <GroundedCitationChips
          conceptSlug={lesson.conceptSlug}
          fallback={course.citations.filter((c) => step.citationIds.includes(c.id))}
        />
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-[color:var(--duo-blue-text)]">
            Explain
          </summary>
          <ExplainPanel concept={concept} equation={lessonEquation} simplerVariant={step.body.simpler ?? null} teachingStyle={teachingStyle} />
        </details>
      </div>
    );
    footer = (
      <button type="button" onClick={advance} className="btn-primary min-h-14 w-full px-6 text-white">
        Continue
      </button>
    );
  } else if (step.type === "visual") {
    body = (
      <div>
        {heading}
        <p className="mb-2 mt-3 text-base text-app">{step.prompt}</p>
        <SolowLab
          onParamsChange={(p) => {
            const v = p[step.target.param];
            const hit = step.target.comparator === "gte" ? v >= step.target.value : v <= step.target.value;
            if (hit && !visualTargetHit) {
              setVisualTargetHit(true);
              recordVisualEvidence();
            }
          }}
        />
        <p className="mt-2 text-sm text-app" role="status" aria-live="polite">
          {visualTargetHit ? step.successDescription : step.targetDescription}
        </p>
      </div>
    );
    footer = (
      <button
        type="button"
        onClick={advance}
        disabled={!visualTargetHit}
        className="btn-primary min-h-14 w-full px-6 text-white disabled:opacity-40"
      >
        Continue
      </button>
    );
  } else if (step.type === "math") {
    // Resolve from the active course's equations (empty now that there is no
    // built-in course; compiled lessons emit no math steps). If absent, the
    // step degrades to its heading rather than throwing.
    const eq =
      extraEquations.find((e) => e.id === step.equationId) ??
      course.equations.find((e) => e.id === step.equationId) ??
      null;
    body = eq === null ? (
      <div>{heading}</div>
    ) : (
      <div>
        {heading}
        <div className="mt-3">
          <MathTex latex={eq.latex} block />
          <ul className="mt-2 space-y-2 text-sm">
            {eq.components.map((c) => (
              <li key={c.latex} className="flex items-baseline gap-2">
                <MathTex latex={c.latex} /> <span>— {c.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
        <GroundedCitationChips
          conceptSlug={lesson.conceptSlug}
          fallback={course.citations.filter((c) => step.citationIds.includes(c.id))}
        />
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-[color:var(--duo-blue-text)]">
            Explain
          </summary>
          <ExplainPanel concept={concept} equation={eq} teachingStyle={teachingStyle} />
        </details>
      </div>
    );
    footer = (
      <button type="button" onClick={advance} className="btn-primary min-h-14 w-full px-6 text-white">
        Continue
      </button>
    );
  } else if (isQuestionStep) {
    const qStep = step as QuestionStep;
    const resolved = resolvedQuestions[qStep.id];
    const q = resolved?.question;
    const questionEquation = q ? findEquationByConcept(q.conceptSlug) : null;
    body = !q ? (
      <div>{heading}</div>
    ) : (
      <div>
        {heading}
        {step.type === "mastery_check" && (
          <div className="mb-2 mt-2 flex items-center gap-3">
            <Image
              src="/art-v2/eco-think.webp"
              alt=""
              role="presentation"
              width={160}
              height={160}
              className="h-12 w-12 shrink-0 rounded-xl object-cover"
            />
            <p className="text-sm text-app">New context, no hints — this checks whether the idea transfers.</p>
          </div>
        )}
        {resolved.reason && (
          <p className="mb-2 mt-2 text-xs text-app-muted" aria-live="polite">
            {resolved.reason}
          </p>
        )}
        <QuestionCard
          key={`${qStep.id}-${q.id}`}
          question={q}
          hintsAllowed={qStep.completionCriterion.kind === "answer_correct" && qStep.completionCriterion.hintsAllowed}
          hideInlineFeedback
          revealAnswerState
          retryToken={retryToken}
          teachingStyle={teachingStyle}
          onEvidence={(e, r) => handleQuestionEvidence(qStep.id, e, r, q)}
        />
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-[color:var(--duo-blue-text)]">
            Explain
          </summary>
          <ExplainPanel concept={resolveConcept(q.conceptSlug)} equation={questionEquation} teachingStyle={teachingStyle} />
        </details>
      </div>
    );
    // No footer here: the QuestionCard's own Check button drives scoring, and
    // the FeedbackStrip provides Continue (correct) / Try again (wrong).
  }

  return (
    <>
      <LessonShell
        completed={stepIndex}
        total={steps.length}
        onClose={() => setQuitOpen(true)}
        closeRef={closeRef}
        banner={<UnverifiedBanner conceptSlug={lesson.conceptSlug} />}
        body={body}
        footer={footer}
        bodyHasStrip={feedback !== null}
      />

      {feedback && (
        <FeedbackStrip
          question={feedback.question}
          result={feedback.result}
          onContinue={advance}
          onRetry={() => {
            setFeedback(null);
            setRetryToken((t) => t + 1);
          }}
        />
      )}

      {quitOpen && (
        <QuitModal
          onKeepLearning={() => {
            setQuitOpen(false);
            closeRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
