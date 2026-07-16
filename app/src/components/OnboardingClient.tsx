"use client";

/**
 * Student onboarding wizard (spec §7, IDEA-001/009/010/011, MVP §27.2).
 * Binding step rules: skippable when safe, revisable later (Progress →
 * settings), explains why each answer is used, one-thumb usable (≥48px
 * targets, single column).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updatePlan, updateProfile, type LearnerProfile } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";

type StepId = "role" | "objective" | "schedule" | "preferences";
const STEPS: StepId[] = ["role", "objective", "schedule", "preferences"];

export function OnboardingClient() {
  const router = useRouter();
  const state = useLearnerState();
  const [stepIndex, setStepIndex] = useState(0);
  if (!state) return <p className="p-4 text-sm text-gray-500">Loading…</p>;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const next = () => {
    if (isLast) {
      mutateLearnerState((s) => updateProfile(s, { onboarded: true }));
      router.push("/");
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const setProfile = (patch: Partial<LearnerProfile>) => mutateLearnerState((s) => updateProfile(s, patch));

  return (
    <div className="mx-auto max-w-md">
      <nav aria-label="Onboarding progress" className="flex gap-1">
        {STEPS.map((s, i) => (
          <span
            key={s}
            aria-current={i === stepIndex ? "step" : undefined}
            className={`h-2 flex-1 rounded-full ${i <= stepIndex ? "bg-gray-900" : "bg-gray-200"}`}
          />
        ))}
      </nav>

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
              className="mt-1 block w-full rounded-xl border border-gray-400 p-3"
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
        </StepShell>
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
          <label className="mt-2 flex min-h-12 items-center gap-3 rounded-xl border border-gray-300 p-3 text-sm">
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
        <button type="button" onClick={next} className="min-h-12 rounded-xl border border-gray-400 px-4 text-sm">
          Skip for now
        </button>
        <button type="button" onClick={next} className="min-h-12 rounded-xl bg-gray-900 px-6 text-white">
          {isLast ? "Start learning" : "Continue"}
        </button>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Everything here is optional and editable later under Progress → personalization.
      </p>
    </div>
  );
}

function StepShell({ title, why, children }: { title: string; why: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-gray-600">{why}</p>
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
      className={`block min-h-12 w-full rounded-xl border p-3 text-left ${
        selected ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300"
      }`}
    >
      <span className="font-medium">{label}</span>
      {hint && <span className={`block text-xs ${selected ? "text-gray-200" : "text-gray-600"}`}>{hint}</span>}
    </button>
  );
}
