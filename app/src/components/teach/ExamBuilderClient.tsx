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
import { filterQuestions, type DifficultyBucket } from "@/lib/engine/question-bank";
import { useTeacherState } from "@/lib/teacher-store";
import { savePrintable } from "@/lib/teach/printable-store";
import { loadCompiledPlan } from "@/components/teach-compile/plan-store";
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
  // D-044: build a targeted exam by filtering the bank first.
  const [diffFilter, setDiffFilter] = useState<DifficultyBucket | "all">("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");

  if (!teacher) return <LoadingScreen label="Loading your question bank…" />;

  const bank = teacher.authoredQuestions;
  // name lookup for the topic dropdown (falls back to the slug if no plan is loaded)
  const slugName = new Map((loadCompiledPlan()?.draft.concepts ?? []).map((c) => [c.slug, c.name]));
  const topicsInBank = [...new Set(bank.map((q) => q.conceptSlug))];
  const filteredBank = filterQuestions(bank, { difficulty: diffFilter, topic: topicFilter });
  const maxCount = filteredBank.length;

  const build = () => {
    const n = Math.max(1, Math.min(count, maxCount));
    const exam = assembleExam(filteredBank, {
      title,
      instructions,
      count: n,
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
            Draft and approve questions first in the question factory — generate questions per concept and confirm
            each answer. Approved questions land in your bank and become available here.
          </p>
          <Link href="/teach/questions" className="btn-primary mt-3 inline-block min-h-12 px-5 py-3 text-white">
            Open the question factory
          </Link>
        </div>
      ) : (
        <div className="card mt-4 space-y-4 p-4">
          <p className="text-sm text-app-muted">
            <span className="stat-chip">{bank.length}</span> question{bank.length === 1 ? "" : "s"} in your bank
            {(diffFilter !== "all" || topicFilter !== "all") && (
              <>
                {" "}
                · <span className="stat-chip">{maxCount}</span> match your filter
              </>
            )}
            .
          </p>

          {/* D-044: narrow the bank before assembling */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <span className="block text-sm font-bold">Difficulty</span>
              <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Filter by difficulty">
                {(
                  [
                    ["all", "All"],
                    ["easy", "Easy"],
                    ["medium", "Medium"],
                    ["hard", "Hard"],
                  ] as [DifficultyBucket | "all", string][]
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={diffFilter === v}
                    onClick={() => setDiffFilter(v)}
                    className={`min-h-9 rounded-lg border px-2.5 text-xs font-bold ${
                      diffFilter === v
                        ? "border-[var(--model-blue)] bg-[var(--model-blue-tint)] text-[var(--model-blue-text)]"
                        : "border-[color:var(--app-border)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="text-sm font-bold">
              Topic
              <select
                value={topicFilter}
                onChange={(e) => setTopicFilter(e.target.value)}
                className="mt-1 block min-h-9 rounded-lg border border-[color:var(--app-border)] bg-app p-1.5 text-xs font-normal text-app"
              >
                <option value="all">All topics</option>
                {topicsInBank.map((slug) => (
                  <option key={slug} value={slug}>
                    {slugName.get(slug) ?? slug}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
              How many questions? <span className="font-normal text-app-muted">(max {maxCount})</span>
            </label>
            <input
              id="exam-count"
              type="number"
              min={1}
              max={maxCount}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(maxCount, Number(e.target.value) || 1)))}
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

          <button
            type="button"
            onClick={build}
            disabled={maxCount === 0}
            className="btn-primary min-h-12 px-5 py-3 text-white disabled:opacity-50"
          >
            Build printable exam →
          </button>
          {maxCount === 0 && (
            <p className="text-sm text-app-muted" role="status">
              No questions match this filter — widen the difficulty or topic.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
