"use client";

/**
 * Student onboarding survey (spec §7, IDEA-001/009/010/011; D-020 item h —
 * Duolingo's mascot-led, one-question-per-screen survey). Eco greets on the
 * left with a speech bubble holding the question; big option cards below; a
 * slim green progress bar and full-width CONTINUE drive it. Every step stays
 * skippable and revisable later (Progress → personalization).
 *
 * Persistence: in-progress answers live in component state and are committed
 * to learner-state only on the final "Start learning" — via the SAME
 * updateProfile / updatePlan paths and the SAME field names/semantics the
 * previous wizard used (the previous wizard wrote each answer eagerly; the
 * observable result — profile/plan fields + the `onboarded` flag set on
 * finish — is identical).
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  updatePlan,
  updateProfile,
  type LearnerProfile,
} from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { DiagnosticStep } from "./DiagnosticStep";
import { OptionCards, type OptionItem } from "./onboarding/OptionCards";
import { SurveyScreen } from "./onboarding/SurveyScreen";
import "./onboarding/survey.css";

type Role = NonNullable<LearnerProfile["role"]>;
type Objective = NonNullable<LearnerProfile["objective"]>;
type Explanation = LearnerProfile["explanationOrder"];

type StepId = "role" | "objective" | "schedule" | "diagnostic" | "preferences" | "done";
const STEPS: StepId[] = ["role", "objective", "schedule", "diagnostic", "preferences", "done"];
const QUESTION_STEPS = 5; // steps before "done" — drives the progress bar

const HEADING_ID = "survey-heading";
const MINUTE_PRESETS = [5, 10, 15, 20] as const;

const ROLE_OPTIONS: OptionItem<Role>[] = [
  { value: "student", label: "Student", hint: "I'm taking a course", icon: "🎓" },
  { value: "independent", label: "Independent learner", hint: "Learning on my own", icon: "🧭" },
  { value: "teacher", label: "Teacher", hint: "Build a course (coming in a later phase)", icon: "🧑‍🏫" },
];

const OBJECTIVE_OPTIONS: OptionItem<Objective>[] = [
  { value: "understand", label: "Understand the course", icon: "💡" },
  { value: "exam", label: "Prepare for an exam", icon: "📝" },
  { value: "catch_up", label: "Catch up after missing classes", icon: "⏪" },
  { value: "weak_area", label: "Improve a weak area", icon: "🎯" },
  { value: "assignment", label: "Complete an assignment", icon: "📋" },
];

const EXPLANATION_OPTIONS: OptionItem<Explanation>[] = [
  { value: "visual_first", label: "Show me the picture first", hint: "Interactive model before the equation", icon: "📊" },
  { value: "math_first", label: "Give me the mathematics first", hint: "Equation before the interactive model", icon: "➗" },
  { value: "text_first", label: "Plain words first", hint: "Careful text explanation up front", icon: "📖" },
];

const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  independent: "Independent learner",
  teacher: "Teacher",
};
const OBJECTIVE_LABEL: Record<Objective, string> = {
  understand: "Understand the course",
  exam: "Prepare for an exam",
  catch_up: "Catch up after missing classes",
  weak_area: "Improve a weak area",
  assignment: "Complete an assignment",
};
const EXPLANATION_LABEL: Record<Explanation, string> = {
  visual_first: "Picture first",
  math_first: "Mathematics first",
  text_first: "Plain words first",
};

export function OnboardingClient() {
  const router = useRouter();
  const state = useLearnerState();

  const [stepIndex, setStepIndex] = useState(0);
  // In-progress answers — mirror of the profile/plan fields, committed on finish.
  const [role, setRole] = useState<Role | null>(null);
  const [objective, setObjective] = useState<Objective | null>(null);
  const [minutesPerDay, setMinutesPerDay] = useState(20);
  const [customMinutes, setCustomMinutes] = useState(false);
  const [examDateISO, setExamDateISO] = useState<string | null>(null);
  const [explanationOrder, setExplanationOrder] = useState<Explanation>("visual_first");
  const [readingLevel, setReadingLevel] = useState<LearnerProfile["readingLevel"]>("standard");
  const [mathReadiness, setMathReadiness] = useState<number | null>(null);
  const [graphReading, setGraphReading] = useState<number | null>(null);
  const [diagnosticNote, setDiagnosticNote] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const hydrated = useRef(false);
  const firstFocus = useRef(true);

  // Seed the in-progress answers once from any previously stored state so a
  // re-run of onboarding shows the learner's existing choices.
  useEffect(() => {
    if (hydrated.current || !state) return;
    hydrated.current = true;
    setRole(state.profile.role);
    setObjective(state.profile.objective);
    setMinutesPerDay(state.plan.minutesPerDay);
    setCustomMinutes(!MINUTE_PRESETS.includes(state.plan.minutesPerDay as (typeof MINUTE_PRESETS)[number]));
    setExamDateISO(state.plan.examDateISO);
    setExplanationOrder(state.profile.explanationOrder);
    setReadingLevel(state.profile.readingLevel);
    setMathReadiness(state.profile.mathReadiness);
    setGraphReading(state.profile.graphReading);
  }, [state]);

  // Move focus to the new screen's heading on every step change (not on first
  // paint, to avoid stealing focus / scrolling on load).
  useEffect(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [stepIndex]);

  if (!state) return <p className="p-4 text-sm text-app-muted">Loading…</p>;

  const step = STEPS[stepIndex];
  const goNext = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const finish = () => {
    mutateLearnerState((s) => {
      const withPlan = updatePlan(s, { ...s.plan, minutesPerDay, examDateISO });
      return updateProfile(withPlan, {
        role,
        objective,
        explanationOrder,
        readingLevel,
        mathReadiness,
        graphReading,
        onboarded: true,
      });
    });
    router.push("/learn");
  };

  const canContinue =
    step === "role" ? role !== null : step === "objective" ? objective !== null : true;

  const minutesValue = customMinutes
    ? "custom"
    : MINUTE_PRESETS.includes(minutesPerDay as (typeof MINUTE_PRESETS)[number])
      ? String(minutesPerDay)
      : "custom";
  const minuteOptions: OptionItem<string>[] = [
    ...MINUTE_PRESETS.map((m) => ({ value: String(m), label: `${m} min`, icon: "⏱️" })),
    { value: "custom", label: "Something else", hint: "Pick your own amount", icon: "✏️" },
  ];

  const progressPct = (Math.min(stepIndex, QUESTION_STEPS) / QUESTION_STEPS) * 100;

  return (
    <div className="survey">
      <div className="survey-topbar">
        <button
          type="button"
          className="survey-back"
          onClick={goBack}
          disabled={stepIndex === 0}
          aria-label="Go back to the previous question"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div
          className="survey-progress"
          role="progressbar"
          aria-label="Survey progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
        >
          <span className="survey-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {step === "role" && (
        <SurveyScreen
          pose="eco-wave"
          headingId={HEADING_ID}
          headingRef={headingRef}
          question="Hi, I'm Eco! Who are you?"
          why="Your role decides which flows you see — students get a learning path, teachers get course-building tools."
        >
          <OptionCards name="role" labelledBy={HEADING_ID} options={ROLE_OPTIONS} value={role} onChange={setRole} />
        </SurveyScreen>
      )}

      {step === "objective" && (
        <SurveyScreen
          pose="eco-think"
          headingId={HEADING_ID}
          headingRef={headingRef}
          question="What brings you here?"
          why="Your goal tunes what the daily plan prioritizes — understanding first, or exam-critical concepts first."
        >
          <OptionCards
            name="objective"
            labelledBy={HEADING_ID}
            options={OBJECTIVE_OPTIONS}
            value={objective}
            onChange={setObjective}
          />
        </SurveyScreen>
      )}

      {step === "schedule" && (
        <SurveyScreen
          pose="eco-encourage"
          headingId={HEADING_ID}
          headingRef={headingRef}
          question="How much time do you have?"
          why="The scheduler fits lessons and reviews into your real availability, and back-plans from your exam date."
        >
          <OptionCards
            name="minutes"
            labelledBy={HEADING_ID}
            options={minuteOptions}
            value={minutesValue}
            columns={2}
            onChange={(v) => {
              if (v === "custom") {
                setCustomMinutes(true);
              } else {
                setCustomMinutes(false);
                setMinutesPerDay(Number(v));
              }
            }}
          />
          {customMinutes && (
            <label className="survey-field">
              Minutes per day
              <input
                type="number"
                min={5}
                max={120}
                className="survey-input"
                value={minutesPerDay}
                onChange={(e) => setMinutesPerDay(Math.max(5, Math.min(120, Number(e.target.value) || 20)))}
              />
            </label>
          )}
          <label className="survey-field">
            Exam date (optional)
            <input
              type="date"
              className="survey-input"
              value={examDateISO?.slice(0, 10) ?? ""}
              onChange={(e) => setExamDateISO(e.target.value ? new Date(e.target.value).toISOString() : null)}
            />
          </label>
        </SurveyScreen>
      )}

      {step === "diagnostic" && (
        <SurveyScreen
          pose="eco-think"
          headingId={HEADING_ID}
          headingRef={headingRef}
          question="A 2-minute check-in"
          why="Four quick questions on math and graph reading. No grade — the result only tunes where lessons start, and you'll confirm every suggestion on the next step."
        >
          <DiagnosticStep
            onDone={(result, defaults) => {
              setMathReadiness(result.mathReadiness);
              setGraphReading(result.graphReading);
              setReadingLevel(defaults.readingLevel);
              setExplanationOrder(defaults.explanationOrder);
              setDiagnosticNote(result.calibrationNote);
              goNext();
            }}
          />
        </SurveyScreen>
      )}

      {step === "preferences" && (
        <SurveyScreen
          pose="eco-think"
          headingId={HEADING_ID}
          headingRef={headingRef}
          question="How do you like ideas explained?"
          why="This sets the order of lesson steps — you can change it anytime, and it never changes what the course teaches."
        >
          {diagnosticNote && (
            <p className="mb-4 rounded-xl bg-[color:var(--app-surface-2)] p-3 text-sm" role="status">
              {diagnosticNote}
            </p>
          )}
          <OptionCards
            name="explanation"
            labelledBy={HEADING_ID}
            options={EXPLANATION_OPTIONS}
            value={explanationOrder}
            onChange={setExplanationOrder}
          />
          <label className="mt-3 flex min-h-12 items-center gap-3 rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-3 text-sm">
            <input
              type="checkbox"
              checked={readingLevel === "simpler"}
              onChange={(e) => setReadingLevel(e.target.checked ? "simpler" : "standard")}
            />
            Prefer simpler wording where available
          </label>
        </SurveyScreen>
      )}

      {step === "done" && (
        <SurveyScreen
          pose="eco-celebrate"
          headingId={HEADING_ID}
          headingRef={headingRef}
          question="You're all set!"
          why="Here's what Eco will use to personalize your path — everything is editable later under Progress → personalization."
        >
          <dl className="survey-summary">
            <SummaryRow label="Role" value={role ? ROLE_LABEL[role] : "Skipped"} />
            <SummaryRow label="Goal" value={objective ? OBJECTIVE_LABEL[objective] : "Skipped"} />
            <SummaryRow label="Time per day" value={`${minutesPerDay} min`} />
            <SummaryRow
              label="Exam date"
              value={examDateISO ? new Date(examDateISO).toLocaleDateString() : "None"}
            />
            <SummaryRow label="Explanations" value={EXPLANATION_LABEL[explanationOrder]} />
            {readingLevel === "simpler" && <SummaryRow label="Wording" value="Simpler" />}
          </dl>
        </SurveyScreen>
      )}

      {/* actions — the diagnostic advances through its own Finish button */}
      {step !== "diagnostic" && (
        <div className="survey-actions">
          {step === "done" ? (
            <button type="button" onClick={finish} className="btn-primary survey-continue min-h-12 px-6 text-white">
              Start learning
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={!canContinue}
              className="btn-primary survey-continue min-h-12 px-6 text-white"
            >
              Continue
            </button>
          )}
          {step !== "done" && (
            <button type="button" onClick={goNext} className="survey-skip">
              Skip for now
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="survey-summary__row">
      <dt>{label}</dt>
      <dd className="survey-summary__value">{value}</dd>
    </div>
  );
}
