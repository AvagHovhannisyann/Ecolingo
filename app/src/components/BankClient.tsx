"use client";

/**
 * Question Bank (spec §8.1 nav). Anxiety-free practice mode (IDEA-142):
 * ungraded, any concept, any question — but every attempt still counts as
 * mastery evidence, because practice is never punished and always learned
 * from (IDEA-132). Header art: Higgsfield (approved decorative slot §17.2).
 */

import Image from "next/image";
import { useState } from "react";
import { concepts, questions } from "@/content/econ13210";
import { recordEvidence } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { useTeacherState } from "@/lib/teacher-store";
import { usePublishedQuestions } from "@/lib/published-questions";
import { playSfx } from "@/lib/sfx";
import { fireConfetti } from "@/lib/confetti";
import { QuestionCard } from "./QuestionCard";

const TYPE_LABELS: Record<string, string> = {
  mc_single: "Multiple choice",
  mc_multi: "Select all",
  numeric: "Calculation",
  equation_assembly: "Build the equation",
  diagram_label: "Label the diagram",
  causal_order: "Order the chain",
  match_pairs: "Match the pairs",
  cloze: "Fill in the blank",
};

export function BankClient() {
  const state = useLearnerState();
  const teacher = useTeacherState();
  const published = usePublishedQuestions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [attemptKey, setAttemptKey] = useState(0);
  if (!state) return <p className="p-4 text-sm text-app-muted">Loading question bank…</p>;

  // teacher-ratified AI drafts (D-014) join the bank next to the seed content;
  // they carry provenance "ai_approved" and are scored by the same engine.
  // Local teacher questions come first, then published ones from other teachers
  // (D-012 posture), de-duplicated by id so a teacher never sees their own twice.
  const seenIds = new Set<string>();
  const allQuestions = [...questions, ...(teacher?.authoredQuestions ?? []), ...(published ?? [])].filter(
    (q) => (seenIds.has(q.id) ? false : (seenIds.add(q.id), true))
  );
  const active = allQuestions.find((q) => q.id === activeId) ?? null;

  if (active) {
    const concept = concepts.find((c) => c.slug === active.conceptSlug);
    return (
      <div>
        <h1 className="text-xl font-semibold">Practice: {concept?.name}</h1>
        <p className="mt-1 text-sm text-app-muted">
          {TYPE_LABELS[active.type]} · difficulty {active.difficulty}/5 · ungraded practice — mistakes only teach
          the schedule where to help.
        </p>
        <div className="mt-4">
          <QuestionCard
            key={`${active.id}-${attemptKey}`}
            question={active}
            onEvidence={(e, r) => {
              playSfx(r.correct ? "correct" : "wrong");
              if (r.correct) {
                // small burst at the button that was just pressed (IDEA-142
                // anxiety-free practice still gets the dopamine layer, D-020)
                const el = document.activeElement as HTMLElement | null;
                const rect = el?.getBoundingClientRect();
                fireConfetti({
                  origin: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined,
                  count: 30,
                });
              }
              mutateLearnerState((s) => recordEvidence(s, e));
            }}
          />
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setAttemptKey((k) => k + 1)}
            className="btn-secondary min-h-12 px-4 text-sm"
          >
            Fresh attempt
          </button>
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className="btn-secondary min-h-12 px-4 text-sm"
          >
            Back to the bank
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-[color:var(--app-border)]">
        <Image
          src="/art/bank-header.webp"
          alt=""
          role="presentation"
          width={1344}
          height={768}
          priority
          className="art-enter h-32 w-full object-cover sm:h-44"
        />
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
          <h1 className="text-xl font-semibold">Question Bank</h1>
          <p className="text-sm opacity-90">Every format, any concept, zero pressure.</p>
        </div>
      </div>

      {concepts.map((c) => {
        const qs = allQuestions.filter((q) => q.conceptSlug === c.slug);
        if (qs.length === 0) return null;
        const m = state.masteryBySlug[c.slug];
        return (
          <section key={c.slug} className="mt-6" aria-label={c.name}>
            <h2 className="font-medium">
              {c.name}
              {m && (
                <span className="ml-2 text-xs text-app-muted">
                  conceptual {Math.round(m.conceptual * 100)}%
                </span>
              )}
            </h2>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {qs.map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(q.id);
                      setAttemptKey((k) => k + 1);
                    }}
                    className="block min-h-12 w-full rounded-xl border border-[color:var(--app-border)] p-3 text-left hover:bg-[color:var(--app-surface-2)]"
                  >
                    <span className="text-xs uppercase tracking-wide text-app-muted">
                      {TYPE_LABELS[q.type]} · difficulty {q.difficulty}/5
                      {q.transferDistance > 0 ? " · transfer" : ""}
                      {q.provenance === "ai_approved" && (
                        <span className="ml-1 normal-case text-[var(--lavender-text)]">· ✦ teacher-approved</span>
                      )}
                    </span>
                    <span className="block text-sm">{q.stem.length > 90 ? q.stem.slice(0, 87) + "…" : q.stem}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
