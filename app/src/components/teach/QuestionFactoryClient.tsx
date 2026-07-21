"use client";

/**
 * Question factory (D-030 / D-044). Feeds the exam builder and the student
 * question bank: the AI drafts questions grounded in each concept's approved
 * definition, and the teacher RATIFIES the correct answer (GATE-002 — the answer
 * key is human-approved, never trusted from the model) before an item lands in
 * the bank (teacher-state.authoredQuestions).
 *
 * D-044 turns this into a BULK generator: the teacher asks for up to 100
 * questions at a chosen difficulty, and the factory spreads that total across
 * the concepts of the ratified plan, looping the item-writer in batches with
 * live progress and global de-duplication. Every draft still passes through the
 * same review step — the AI's suggested answer is pre-selected, the teacher
 * confirms or corrects it — so nothing reaches students unratified. Each stored
 * question carries its difficulty and its topic (conceptSlug) so the bank can be
 * filtered.
 *
 * Implementation only; existing design tokens (project rule: Fabel owns aesthetic).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Concept } from "@/lib/engine/types";
import { toAuthoredQuestion, type DraftQuestion, type QuestionTier } from "@/lib/engine/authored";
import { distributeCount, MAX_BANK_GENERATION } from "@/lib/engine/question-bank";
import { draftQuestionsForConcept } from "@/lib/ai/draft-questions";
import { addAuthoredQuestion } from "@/lib/teacher-state";
import { mutateTeacherState, useTeacherState } from "@/lib/teacher-store";
import { useTeachingStyle } from "@/lib/teaching-style-store";
import { loadCompiledPlan } from "@/components/teach-compile/plan-store";
import { LoadingScreen } from "../LoadingScreen";

interface QueueItem {
  conceptSlug: string;
  conceptName: string;
  draft: DraftQuestion;
  /** the teacher's currently-selected correct option (starts at the AI suggestion) */
  chosen: number;
}

const norm = (s: string) => s.trim().toLowerCase();

const TIERS: { value: QuestionTier; label: string; hint: string }[] = [
  { value: "easy", label: "Easy", hint: "recall & recognition" },
  { value: "medium", label: "Medium", hint: "understand & apply" },
  { value: "hard", label: "Hard", hint: "transfer to new cases" },
  { value: "mixed", label: "Mixed", hint: "a blend of all three" },
];

/** modest per-call batch keeps each request fast + high quality; we loop to reach the total. */
const PER_CALL = 12;
const MAX_BATCHES_PER_CONCEPT = 4;

export function QuestionFactoryClient() {
  const teacher = useTeacherState();
  const style = useTeachingStyle();
  // The ratified plan is the grounded source of concepts to write questions for.
  const concepts: Concept[] = useMemo(() => loadCompiledPlan()?.draft.concepts ?? [], []);

  const [genCount, setGenCount] = useState(20);
  const [tier, setTier] = useState<QuestionTier>("mixed");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; target: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!teacher) return <LoadingScreen label="Loading your question factory…" />;

  const bankCount = teacher.authoredQuestions.length;

  const generate = async () => {
    if (concepts.length === 0) return;
    setGenerating(true);
    setNote(null);
    setQueue([]);
    const target = Math.max(1, Math.min(MAX_BANK_GENERATION, Math.trunc(genCount) || 1));
    const per = distributeCount(target, concepts.length);
    // de-dupe globally: against questions already in the bank AND across batches.
    const seen = new Set<string>(teacher.authoredQuestions.map((q) => norm(q.stem)));
    const collected: QueueItem[] = [];
    let done = 0;
    setProgress({ done: 0, target });

    for (let ci = 0; ci < concepts.length && done < target; ci++) {
      const c = concepts[ci];
      let need = per[ci];
      for (let batch = 0; batch < MAX_BATCHES_PER_CONCEPT && need > 0; batch++) {
        let drafts: DraftQuestion[] = [];
        try {
          drafts = await draftQuestionsForConcept({
            conceptName: c.name,
            definition: c.definition,
            // ground the writer in the approved definition (the only text the
            // ratified plan retains); the route forbids inventing beyond it.
            sectionText: c.definition,
            count: Math.min(need, PER_CALL),
            tier,
            style,
          });
        } catch {
          drafts = [];
        }
        if (drafts.length === 0) break;
        let added = 0;
        for (const d of drafts) {
          const key = norm(d.stem);
          if (seen.has(key)) continue;
          seen.add(key);
          collected.push({ conceptSlug: c.slug, conceptName: c.name, draft: d, chosen: d.suggestedIndex });
          added++;
          need--;
          done++;
          if (need <= 0 || done >= target) break;
        }
        setQueue([...collected]);
        setProgress({ done, target });
        if (added === 0) break; // this concept stopped yielding new unique items
      }
    }

    setGenerating(false);
    setProgress(null);
    if (collected.length === 0) {
      setNote("No questions came back — the live AI may be unconfigured or busy right now. Try again in a moment.");
    } else if (collected.length < target) {
      setNote(
        `Generated ${collected.length} distinct question${collected.length === 1 ? "" : "s"} (you asked for ${target}). Some concepts didn't have enough distinct material for more — review these, or generate again.`,
      );
    }
  };

  const toQ = (item: QueueItem) =>
    toAuthoredQuestion(item.draft, item.conceptSlug, item.chosen, [], { difficulty: item.draft.difficulty });

  const approveOne = (idx: number) => {
    const item = queue[idx];
    if (!item) return;
    mutateTeacherState((s) => addAuthoredQuestion(s, toQ(item)));
    setQueue((qs) => qs.filter((_, i) => i !== idx));
  };
  const discardOne = (idx: number) => setQueue((qs) => qs.filter((_, i) => i !== idx));
  const approveAll = () => {
    if (queue.length === 0) return;
    mutateTeacherState((s) => queue.reduce((acc, item) => addAuthoredQuestion(acc, toQ(item)), s));
    setQueue([]);
  };
  const setChosen = (idx: number, oi: number) =>
    setQueue((qs) => qs.map((it, i) => (i === idx ? { ...it, chosen: oi } : it)));

  return (
    <div>
      <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
        ← Back to teacher workspace
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Question factory</h1>
      <p className="mt-1 text-sm text-app">
        Generate a whole bank of questions from your compiled course — pick how many and how hard. The AI drafts
        them grounded in your approved concepts; you confirm each answer before it goes live.
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
        <>
          {/* ── generation controls ─────────────────────────────────────── */}
          <section className="card mt-4 p-4" aria-labelledby="factory-generate-heading">
            <h2 id="factory-generate-heading" className="font-bold">
              Generate questions
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              Spread across your {concepts.length} concept{concepts.length === 1 ? "" : "s"}. Every draft is
              reviewed before it counts.
            </p>

            <div className="mt-3 flex flex-wrap items-end gap-4">
              <label htmlFor="factory-count" className="block text-sm font-bold">
                How many questions? <span className="font-normal text-app-muted">(max {MAX_BANK_GENERATION})</span>
                <input
                  id="factory-count"
                  type="number"
                  min={1}
                  max={MAX_BANK_GENERATION}
                  value={genCount}
                  disabled={generating}
                  onChange={(e) =>
                    setGenCount(Math.max(1, Math.min(MAX_BANK_GENERATION, Number(e.target.value) || 1)))
                  }
                  className="mt-1 block w-32 rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm font-normal disabled:opacity-50"
                />
              </label>

              <fieldset>
                <legend className="text-sm font-bold">Difficulty</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {TIERS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={tier === t.value}
                      disabled={generating}
                      onClick={() => setTier(t.value)}
                      title={t.hint}
                      className={`min-h-11 rounded-xl border-2 px-3 text-sm font-bold disabled:opacity-50 ${
                        tier === t.value
                          ? "border-[var(--model-blue)] bg-[var(--model-blue-tint)] text-[var(--model-blue-text)]"
                          : "border-[color:var(--app-border)]"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating}
              className="btn-primary mt-4 min-h-12 px-5 text-white disabled:opacity-50"
            >
              {generating ? "Generating…" : "✦ Generate questions"}
            </button>

            {progress && (
              <div className="mt-3" role="status" aria-live="polite">
                <p className="text-xs text-app-muted">
                  Drafting {progress.done} / {progress.target}… writing high-quality items across your concepts —
                  this can take a minute or two.
                </p>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[color:var(--app-surface-2)]">
                  <div
                    className="h-full rounded-full bg-[var(--model-blue)] transition-[width]"
                    style={{ width: `${Math.round((progress.done / Math.max(1, progress.target)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </section>

          {/* ── review queue ────────────────────────────────────────────── */}
          {queue.length > 0 && (
            <section className="mt-4" aria-labelledby="factory-review-heading">
              <div className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="factory-review-heading" className="font-bold">
                    Review &amp; approve <span className="stat-chip ml-1">{queue.length}</span>
                  </h2>
                  <button
                    type="button"
                    onClick={approveAll}
                    className="btn-primary min-h-11 px-4 text-sm text-white"
                  >
                    Approve all {queue.length}
                  </button>
                </div>
                <p className="mt-1 text-xs text-app-muted">
                  You are ratifying each answer key. The AI&apos;s suggested answer is pre-selected — correct any
                  before approving. Spot-check before &ldquo;Approve all&rdquo;.
                </p>
              </div>

              <ul className="mt-3 space-y-3">
                {queue.map((item, idx) => {
                  const d = item.draft;
                  return (
                    <li key={`${item.conceptSlug}#${idx}#${norm(d.stem).slice(0, 24)}`} className="card p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="stat-chip text-xs">{item.conceptName}</span>
                        <span className="text-xs text-app-muted">difficulty {d.difficulty ?? 3}/5</span>
                      </div>
                      <p className="mt-2 text-sm font-medium">{d.stem}</p>
                      <p className="mt-1 text-xs text-app-muted">
                        Pick the correct answer (the AI suggested one — confirm or change it):
                      </p>
                      <div className="mt-2 space-y-1">
                        {d.options.map((opt, oi) => (
                          <label key={oi} className="flex cursor-pointer items-start gap-2 text-sm">
                            <input
                              type="radio"
                              name={`q-${idx}`}
                              checked={item.chosen === oi}
                              onChange={() => setChosen(idx, oi)}
                              className="mt-1"
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                      {d.rationale && (
                        <p className="mt-2 text-xs text-app-muted">
                          <span className="font-bold">Why:</span> {d.rationale}
                        </p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => approveOne(idx)}
                          className="btn-primary min-h-11 px-4 text-sm text-white"
                        >
                          Approve to bank
                        </button>
                        <button
                          type="button"
                          onClick={() => discardOne(idx)}
                          className="btn-secondary min-h-11 px-4 text-sm"
                        >
                          Discard
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {note && (
        <p className="mt-3 rounded-xl bg-[var(--coral-tint)] p-3 text-sm text-[var(--deep-ink)]" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
