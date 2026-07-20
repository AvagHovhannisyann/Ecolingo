"use client";

/**
 * Question factory (D-030). Closes the loop that feeds the exam builder: for
 * each concept in the teacher's ratified course plan, the AI drafts questions
 * grounded in that concept's approved definition; the teacher CONFIRMS the
 * correct option (GATE-002 — the answer key is human-ratified, never trusted
 * from the model), and the approved item lands in the question bank
 * (teacher-state.authoredQuestions) that /teach/exam prints from.
 *
 * Implementation only; existing design tokens (project rule: Fabel owns aesthetic).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Concept } from "@/lib/engine/types";
import { toAuthoredQuestion, type DraftQuestion } from "@/lib/engine/authored";
import { draftQuestionsForConcept } from "@/lib/ai/draft-questions";
import { addAuthoredQuestion } from "@/lib/teacher-state";
import { mutateTeacherState, useTeacherState } from "@/lib/teacher-store";
import { useTeachingStyle } from "@/lib/teaching-style-store";
import { loadCompiledPlan } from "@/components/teach-compile/plan-store";
import { LoadingScreen } from "../LoadingScreen";

export function QuestionFactoryClient() {
  const teacher = useTeacherState();
  const style = useTeachingStyle();
  // The ratified plan is the grounded source of concepts to write questions for.
  const concepts: Concept[] = useMemo(() => loadCompiledPlan()?.draft.concepts ?? [], []);
  const [draftsBySlug, setDraftsBySlug] = useState<Record<string, DraftQuestion[]>>({});
  const [pick, setPick] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!teacher) return <LoadingScreen label="Loading your question factory…" />;

  const bankCount = teacher.authoredQuestions.length;

  const draft = async (c: Concept) => {
    setBusy(c.slug);
    setNote(null);
    try {
      const drafts = await draftQuestionsForConcept({
        conceptName: c.name,
        definition: c.definition,
        // ground the item-writer in the approved definition (the only text the
        // ratified plan retains for a concept); the route still forbids inventing
        // facts beyond it.
        sectionText: c.definition,
        count: 3,
        // teaching style flows through so drafted questions match the voice
        style,
      });
      if (drafts.length === 0) {
        setNote("No draft questions came back — the live AI may be unconfigured or busy. Try again in a moment.");
      }
      setDraftsBySlug((m) => ({ ...m, [c.slug]: drafts }));
    } catch {
      setNote("Couldn't reach the item-writer just now.");
    } finally {
      setBusy(null);
    }
  };

  const approve = (slug: string, di: number, draftQ: DraftQuestion, chosen: number) => {
    const q = toAuthoredQuestion(draftQ, slug, chosen, []);
    mutateTeacherState((s) => addAuthoredQuestion(s, q));
    setDraftsBySlug((m) => ({ ...m, [slug]: (m[slug] ?? []).filter((_, i) => i !== di) }));
  };

  return (
    <div>
      <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
        ← Back to teacher workspace
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Question factory</h1>
      <p className="mt-1 text-sm text-app">
        The AI drafts questions for each concept in your compiled course. Confirm the correct answer to approve one
        — approved questions are scored deterministically and fill the bank your exams print from.
      </p>
      <p className="mt-2 text-sm text-app-muted">
        <span className="stat-chip">{bankCount}</span> question{bankCount === 1 ? "" : "s"} in your bank.{" "}
        {bankCount > 0 && (
          <Link href="/teach/exam" className="text-[var(--model-blue-text)] underline">
            Build an exam →
          </Link>
        )}
      </p>

      {concepts.length === 0 ? (
        <div className="card mt-4 p-4">
          <p className="text-sm font-bold">No compiled course yet.</p>
          <p className="mt-1 text-sm text-app-muted">
            Compile a course first — the factory writes questions for the concepts in your approved plan.
          </p>
          <Link href="/teach/compile" className="btn-primary mt-3 inline-block min-h-12 px-5 py-3 text-white">
            Go to the course compiler
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {concepts.map((c) => {
            const drafts = draftsBySlug[c.slug] ?? [];
            return (
              <li key={c.slug} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{c.name}</strong>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void draft(c)}
                    className="btn-secondary min-h-12 px-4 text-sm disabled:opacity-50"
                  >
                    {busy === c.slug ? "Drafting…" : "✦ Draft questions"}
                  </button>
                </div>

                {drafts.map((d, di) => {
                  const key = `${c.slug}#${di}`;
                  const chosen = pick[key] ?? d.suggestedIndex;
                  return (
                    <div key={key} className="mt-3 rounded-xl border border-[var(--lavender)] p-3">
                      <p className="text-sm font-medium">{d.stem}</p>
                      <p className="mt-1 text-xs text-app-muted">
                        Pick the correct answer (the AI suggested one — confirm or change it):
                      </p>
                      <div className="mt-2 space-y-1">
                        {d.options.map((opt, oi) => (
                          <label key={oi} className="flex cursor-pointer items-start gap-2 text-sm">
                            <input
                              type="radio"
                              name={key}
                              checked={chosen === oi}
                              onChange={() => setPick((p) => ({ ...p, [key]: oi }))}
                              className="mt-1"
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => approve(c.slug, di, d, chosen)}
                          className="btn-primary min-h-12 px-4 text-sm text-white"
                        >
                          Approve to bank
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftsBySlug((m) => ({ ...m, [c.slug]: (m[c.slug] ?? []).filter((_, i) => i !== di) }))
                          }
                          className="btn-secondary min-h-12 px-4 text-sm"
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  );
                })}
              </li>
            );
          })}
        </ul>
      )}

      {note && (
        <p className="mt-3 rounded-xl bg-[var(--coral-tint)] p-3 text-sm text-[var(--deep-ink)]" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
