"use client";

/**
 * Student onboarding wizard (spec §7, IDEA-001/009/010/011, MVP §27.2).
 * Binding step rules: skippable when safe, revisable later (Progress →
 * settings), explains why each answer is used, one-thumb usable (≥48px
 * targets, single column).
 */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updatePlan, updateProfile, type LearnerProfile } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { DiagnosticStep } from "./DiagnosticStep";

type StepId = "role" | "objective" | "schedule" | "diagnostic" | "preferences";
const STEPS: StepId[] = ["role", "objective", "schedule", "diagnostic", "preferences"];

export function OnboardingClient() {
  const router = useRouter();
  const state = useLearnerState();
  const [stepIndex, setStepIndex] = useState(0);
  const [diagnosticNote, setDiagnosticNote] = useState<string | null>(null);
  if (!state) return <p className="p-4 text-sm text-app-muted">Loading…</p>;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const next = () => {
    if (isLast) {
      mutateLearnerState((s) => updateProfile(s, { onboarded: true }));
      router.push("/learn");
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const setProfile = (patch: Partial<LearnerProfile>) => mutateLearnerState((s) => updateProfile(s, patch));

  return (
    <div className="mx-auto max-w-md">
      {/* Higgsfield onboarding art (approved decorative slot §17.2) */}
      <Image
        src="/art/onboarding-checkin.webp"
        alt=""
        role="presentation"
        width={1344}
        height={768}
        priority
        className="art-enter mb-4 h-32 w-full rounded-2xl border border-[color:var(--app-border)] object-cover"
      />
      <nav aria-label="Onboarding progress" className="flex gap-1">
        {STEPS.map((s, i) => (
          <span
            key={s}
            aria-current={i === stepIndex ? "step" : undefined}
            className={`h-2 flex-1 rounded-full ${i <= stepIndex ? "bg-[color:var(--duo-green)]" : "bg-[color:var(--app-surface-2)]"}`}
          />
        ))}
      </nav>

      {step === "role" && (
        <div className="mt-5 flex justify-center">
          {/* Higgsfield waving-hello mascot (decorative slot §17.2) */}
          <Image
            src="/art/creature-waving.webp"
            alt=""
            role="presentation"
            width={200}
            height={200}
            className="art-enter h-24 w-24 rounded-2xl object-cover"
          />
        </div>
      )}

      {step === "role" && (
        <StepShell
          title="Who are you?"
          why="Your role decides which flows you see — students get a learning path, teachers get course-building tools."
        >
          {(
            [
              ["student", "Student", "I'm taking a course"],
              ["independent", "Independent learner", "Learning on my own"],
              ["teacher", "Teacher", "I want to build a course (coming in a later phase)"],
            ] as const
          ).map(([value, label, hint]) => (
            <ChoiceButton
              key={value}
              label={label}
              hint={hint}
              selected={state.profile.role === value}
              onClick={() => setProfile({ role: value })}
            />
          ))}
        </StepShell>
      )}

      {step === "objective" && (
        <StepShell
          title="What brings you here?"
          why="Your goal tunes what the daily plan prioritizes — understanding first, or exam-critical concepts first."
        >
          {(
            [
              ["understand", "Understand the course"],
              ["exam", "Prepare for an exam"],
              ["catch_up", "Catch up after missing classes"],
              ["weak_area", "Improve a weak area"],
              ["assignment", "Complete an assignment"],
            ] as const
          ).map(([value, label]) => (
            <ChoiceButton
              key={value}
              label={label}
              selected={state.profile.objective === value}
              onClick={() => setProfile({ objective: value })}
            />
          ))}
        </StepShell>
      )}

      {step === "schedule" && (
        <StepShell
          title="How much time do you have?"
          why="The scheduler fits lessons and reviews into your real availability, and back-plans from your exam date."
        >
          <label className="block text-sm">
            Minutes per day
            <input
              type="number"
              min={5}
              max={120}
              className="mt-1 block w-full rounded-xl border border-[color:var(--app-border)] p-3"
              value={state.plan.minutesPerDay}
              onChange={(e) =>
                mutateLearnerState((s) =>
                  updatePlan(s, { ...s.plan, minutesPerDay: Math.max(5, Number(e.target.value) || 20) })
                )
              }
            />
          </label>
          <label className="block text-sm">
            Exam date (optional)
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
        </StepShell>
      )}

      {step === "diagnostic" && (
        <StepShell
          title="A 2-minute check-in"
          why="Four quick questions on math and graph reading. No grade — the result only tunes where lessons start, and you'll confirm every suggestion on the next step."
        >
          <DiagnosticStep
            onDone={(result, defaults) => {
              setProfile({
                mathReadiness: result.mathReadiness,
                graphReading: result.graphReading,
                readingLevel: defaults.readingLevel,
                explanationOrder: defaults.explanationOrder,
              });
              setDiagnosticNote(result.calibrationNote);
              setStepIndex((i) => i + 1);
            }}
          />
        </StepShell>
      )}

      {step === "preferences" && diagnosticNote && (
        <p className="mt-4 rounded-xl bg-[color:var(--app-surface-2)] p-3 text-sm" role="status">
          {diagnosticNote}
        </p>
      )}

      {step === "preferences" && (
        <StepShell
          title="How do you like ideas explained?"
          why="This sets the order of lesson steps — you can change it anytime, and it never changes what the course teaches."
        >
          {(
            [
              ["visual_first", "Show me the picture first", "Interactive model before the equation"],
              ["math_first", "Give me the mathematics first", "Equation before the interactive model"],
              ["text_first", "Plain words first", "Careful text explanation up front"],
            ] as const
          ).map(([value, label, hint]) => (
            <ChoiceButton
              key={value}
              label={label}
              hint={hint}
              selected={state.profile.explanationOrder === value}
              onClick={() => setProfile({ explanationOrder: value })}
            />
          ))}
          <label className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-[color:var(--app-border)] p-3 text-sm">
            <input
              type="checkbox"
              checked={state.profile.readingLevel === "simpler"}
              onChange={(e) => setProfile({ readingLevel: e.target.checked ? "simpler" : "standard" })}
            />
            Prefer simpler wording where available
          </label>
        </StepShell>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={next} className="btn-secondary min-h-12 px-4 text-sm">
          Skip for now
        </button>
        {/* the diagnostic advances through its own Finish button */}
        {step !== "diagnostic" && (
          <button type="button" onClick={next} className="btn-primary min-h-12 px-6 text-white">
            {isLast ? "Start learning" : "Continue"}
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-app-muted">
        Everything here is optional and editable later under Progress → personalization.
      </p>
    </div>
  );
}

function StepShell({ title, why, children }: { title: string; why: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-app-muted">{why}</p>
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
}

function ChoiceButton({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`block min-h-12 w-full p-3 text-left ${
        selected ? "choice-selected" : "choice-idle"
      }`}
    >
      <span className="font-medium">{label}</span>
      {hint && <span className={`block text-xs ${selected ? "text-app-faint" : "text-app-muted"}`}>{hint}</span>}
    </button>
  );
}
