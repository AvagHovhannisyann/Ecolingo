/**
 * Exam / quiz assembler (D-030). Pure and deterministic.
 *
 * An exam is built ONLY from questions the teacher already approved (the
 * question bank), so nothing on the printed page is AI-invented (GATE-001/002):
 * the model may have drafted an item, but a teacher ratified its answer key
 * before it could enter the bank. This module just selects, orders, numbers,
 * and derives a human-readable answer key — no generation, no network.
 */

import type {
  ChoiceOption,
  Question,
} from "./types";

export type DifficultyOrder = "as_is" | "easy_first" | "hard_first";

export interface ExamOptions {
  title: string;
  instructions: string;
  /** how many items to include (clamped to what the bank actually has) */
  count: number;
  order: DifficultyOrder;
  /** deterministic shuffle when a seed is given; stable order otherwise */
  shuffle: boolean;
  seed: number;
  pointsPerQuestion: number;
}

export interface ExamItem {
  number: number;
  points: number;
  question: Question;
}

export interface ExamAnswer {
  number: number;
  /** human-readable correct answer, derived from the question's answer key */
  answer: string;
}

export interface Exam {
  title: string;
  instructions: string;
  generatedAtISO: string;
  items: ExamItem[];
  answerKey: ExamAnswer[];
  totalPoints: number;
}

export const DEFAULT_EXAM_OPTIONS: ExamOptions = {
  title: "Quiz",
  instructions: "Answer every question. Show your working where relevant.",
  count: 10,
  order: "as_is",
  shuffle: false,
  seed: 1,
  pointsPerQuestion: 1,
};

/** mulberry32 — a tiny deterministic PRNG so shuffles are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with a seeded RNG; returns a new array, never mutates. */
export function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const a = [...arr];
  const rnd = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function optionText(options: ChoiceOption[], id: string): string {
  return options.find((o) => o.id === id)?.text ?? id;
}

/**
 * Render a question's answer key as human-readable text for the answer sheet.
 * Every Question variant is handled so the key is never blank.
 */
export function formatAnswer(q: Question): string {
  switch (q.type) {
    case "mc_single":
      return optionText(q.options, q.answerKey.correctOptionId);
    case "mc_multi":
      return q.answerKey.correctOptionIds.map((id) => optionText(q.options, id)).join("; ");
    case "numeric":
      return q.unitLabel ? `${q.answerKey.value} ${q.unitLabel}` : String(q.answerKey.value);
    case "equation_assembly":
      return q.answerKey.orderedTokenIds
        .map((id) => q.tokens.find((t) => t.id === id)?.latex ?? id)
        .join("  ");
    case "diagram_label":
      return Object.entries(q.answerKey.slotToLabel)
        .map(([slot, label]) => {
          const slotDesc = q.slots.find((s) => s.id === slot)?.description ?? slot;
          const labelText = q.labels.find((l) => l.id === label)?.text ?? label;
          return `${slotDesc} → ${labelText}`;
        })
        .join("; ");
    case "causal_order":
      return q.answerKey.orderedItemIds
        .map((id) => q.items.find((it) => it.id === id)?.text ?? id)
        .join(" → ");
    case "match_pairs":
      return q.pairs.map((p) => `${p.left} ↔ ${p.right}`).join("; ");
    case "cloze":
      return Object.entries(q.answerKey.fills)
        .map(([blank, word]) => `${blank}: ${word}`)
        .join("; ");
  }
}

/**
 * Build an exam from a bank of approved questions. Deterministic: the same bank
 * + options always yield the same paper (so a teacher can re-print an identical
 * copy). Ordering applies the difficulty preference on top of an optional
 * seeded shuffle; the final list is numbered and points assigned.
 */
export function assembleExam(bank: readonly Question[], options: Partial<ExamOptions> = {}): Exam {
  const opts: ExamOptions = { ...DEFAULT_EXAM_OPTIONS, ...options };
  const points = Math.max(1, Math.floor(opts.pointsPerQuestion) || 1);

  let ordered: Question[] = opts.shuffle ? seededShuffle(bank, opts.seed) : [...bank];
  if (opts.order === "easy_first") {
    ordered = [...ordered].sort((a, b) => a.difficulty - b.difficulty);
  } else if (opts.order === "hard_first") {
    ordered = [...ordered].sort((a, b) => b.difficulty - a.difficulty);
  }

  const take = Math.max(0, Math.min(Math.floor(opts.count) || 0, ordered.length));
  const selected = ordered.slice(0, take);

  const items: ExamItem[] = selected.map((question, i) => ({ number: i + 1, points, question }));
  const answerKey: ExamAnswer[] = items.map((it) => ({ number: it.number, answer: formatAnswer(it.question) }));

  return {
    title: opts.title.trim() || DEFAULT_EXAM_OPTIONS.title,
    instructions: opts.instructions.trim(),
    generatedAtISO: new Date().toISOString(),
    items,
    answerKey,
    totalPoints: items.length * points,
  };
}
