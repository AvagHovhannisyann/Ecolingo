"use client";

/**
 * Exam & quiz builder (D-030). Assembles a printable test from the teacher's
 * OWN approved question bank (teacher-state.authoredQuestions) — every item was
 * ratified by the teacher, so nothing on the paper is AI-invented (GATE-001/2).
 * Deterministic: the same bank + options give the same paper. Saves the result
 * to the printable store and hands off to /teach/print.
 *
 * Implementation only; reuses existing design tokens (project rule: Fabel owns
 * aesthetic).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { assembleExam, type DifficultyOrder } from "@/lib/engine/exam";
import { useTeacherState } from "@/lib/teacher-store";
import { savePrintable } from "@/lib/teach/printable-store";
import { LoadingScreen } from "../LoadingScreen";

export function ExamBuilderClient() {
  const teacher = useTeacherState();
  const router = useRouter();
  const [title, setTitle] = useState("Quiz");
  const [instructions, setInstructions] = useState("Answer every question. Show your working where relevant.");
  const [count, setCount] = useState(10);
  const [order, setOrder] = useState<DifficultyOrder>("as_is");
  const [shuffle, setShuffle] = useState(false);
  const [includeKey, setIncludeKey] = useState(true);

  if (!teacher) return <LoadingScreen label="Loading your question bank…" />;

  const bank = teacher.authoredQuestions;
  const build = () => {
    const exam = assembleExam(bank, {
      title,
      instructions,
      count,
      order,
      shuffle,
      seed: Date.now() % 100000,
    });
    if (!includeKey) exam.answerKey = [];
    savePrintable({ kind: "exam", exam });
    router.push("/teach/print");
  };

  return (
    <div>
      <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
        ← Back to teacher workspace
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Exam &amp; quiz builder</h1>
      <p className="mt-1 text-sm text-app">
        Assemble a printable test from your question bank. Every question is one you already approved — the answer
        key is derived from your own keys, never invented.
      </p>

      {bank.length === 0 ? (
        <div className="card mt-4 p-4">
          <p className="text-sm font-bold">Your question bank is empty.</p>
          <p className="mt-1 text-sm text-app-muted">
            Draft and approve questions first — open the course compiler, generate questions per concept, and
            confirm each answer. Approved questions land in your bank and become available here.
          </p>
          <Link href="/teach/compile" className="btn-primary mt-3 inline-block min-h-12 px-5 py-3 text-white">
            Go to the course compiler
          </Link>
        </div>
      ) : (
        <div className="card mt-4 space-y-4 p-4">
          <p className="text-sm text-app-muted">
            <span className="stat-chip">{bank.length}</span> question{bank.length === 1 ? "" : "s"} in your bank.
          </p>

          <div>
            <label htmlFor="exam-title" className="block text-sm font-bold">
              Title
            </label>
            <input
              id="exam-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm"
            />
          </div>

          <div>
            <label htmlFor="exam-instructions" className="block text-sm font-bold">
              Instructions
            </label>
            <input
              id="exam-instructions"
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm"
            />
          </div>

          <div>
            <label htmlFor="exam-count" className="block text-sm font-bold">
              How many questions? <span className="font-normal text-app-muted">(max {bank.length})</span>
            </label>
            <input
              id="exam-count"
              type="number"
              min={1}
              max={bank.length}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(bank.length, Number(e.target.value) || 1)))}
              className="mt-1 block w-32 rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-bold">Order</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["as_is", "As in the bank"],
                  ["easy_first", "Easy → hard"],
                  ["hard_first", "Hard → easy"],
                ] as [DifficultyOrder, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={order === v}
                  onClick={() => setOrder(v)}
                  className={`min-h-11 rounded-xl border-2 px-3 text-sm font-bold ${
                    order === v
                      ? "border-[var(--model-blue)] bg-[var(--model-blue-tint)] text-[var(--model-blue-text)]"
                      : "border-[color:var(--app-border)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
              Shuffle question order
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={includeKey} onChange={(e) => setIncludeKey(e.target.checked)} />
              Include an answer key (printed on its own page)
            </label>
          </div>

          <button type="button" onClick={build} className="btn-primary min-h-12 px-5 py-3 text-white">
            Build printable exam →
          </button>
        </div>
      )}
    </div>
  );
}
