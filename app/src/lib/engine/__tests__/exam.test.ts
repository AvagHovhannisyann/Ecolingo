import { describe, expect, it } from "vitest";
import { assembleExam, formatAnswer, seededShuffle } from "../exam";
import type {
  CausalOrderQuestion,
  ClozeQuestion,
  McMultiQuestion,
  McSingleQuestion,
  NumericQuestion,
  Question,
  QuestionBase,
} from "../types";

function base(id: string, difficulty: 1 | 2 | 3 | 4 | 5): QuestionBase {
  return {
    id,
    conceptSlug: "c",
    type: "mc_single",
    stem: `Q ${id}`,
    difficulty,
    expectedSeconds: 30,
    transferDistance: 0,
    provenance: "teacher_authored",
    hint: "",
    citationIds: [],
  };
}

const mcSingle: McSingleQuestion = {
  ...base("a", 2),
  type: "mc_single",
  options: [
    { id: "o1", text: "Right" },
    { id: "o2", text: "Wrong" },
  ],
  answerKey: { correctOptionId: "o1" },
};

const mcMulti: McMultiQuestion = {
  ...base("b", 4),
  type: "mc_multi",
  options: [
    { id: "o1", text: "A" },
    { id: "o2", text: "B" },
    { id: "o3", text: "C" },
  ],
  answerKey: { correctOptionIds: ["o1", "o3"] },
};

const numeric: NumericQuestion = {
  ...base("c", 3),
  type: "numeric",
  unitLabel: "%",
  answerKey: { value: 5, relTolerance: 0.01 },
};

const cloze: ClozeQuestion = {
  ...base("d", 1),
  type: "cloze",
  template: "The sky is {{b1}}.",
  bank: ["blue", "green"],
  answerKey: { fills: { b1: "blue" } },
};

const causal: CausalOrderQuestion = {
  ...base("e", 5),
  type: "causal_order",
  items: [
    { id: "i1", text: "first" },
    { id: "i2", text: "second" },
  ],
  answerKey: { orderedItemIds: ["i1", "i2"] },
};

describe("formatAnswer", () => {
  it("renders the correct answer for every question type", () => {
    expect(formatAnswer(mcSingle)).toBe("Right");
    expect(formatAnswer(mcMulti)).toBe("A; C");
    expect(formatAnswer(numeric)).toBe("5 %");
    expect(formatAnswer(cloze)).toBe("b1: blue");
    expect(formatAnswer(causal)).toBe("first → second");
  });
});

describe("seededShuffle", () => {
  it("is deterministic for a given seed and a pure permutation", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = seededShuffle(arr, 42);
    const b = seededShuffle(arr, 42);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(arr); // no loss/dupe
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // input untouched
  });

  it("different seeds usually give different orders", () => {
    const arr = Array.from({ length: 20 }, (_, i) => i);
    expect(seededShuffle(arr, 1)).not.toEqual(seededShuffle(arr, 2));
  });
});

describe("assembleExam", () => {
  const bank: Question[] = [mcSingle, mcMulti, numeric, cloze, causal];

  it("numbers items, clamps count to the bank, and builds a matching answer key", () => {
    const exam = assembleExam(bank, { title: "Test", count: 3, pointsPerQuestion: 2 });
    expect(exam.items).toHaveLength(3);
    expect(exam.items.map((i) => i.number)).toEqual([1, 2, 3]);
    expect(exam.answerKey).toHaveLength(3);
    expect(exam.totalPoints).toBe(6);
    // the key lines up with the items
    expect(exam.answerKey[0].answer).toBe(formatAnswer(exam.items[0].question));
  });

  it("count larger than the bank just uses the whole bank", () => {
    const exam = assembleExam(bank, { count: 999 });
    expect(exam.items).toHaveLength(bank.length);
  });

  it("orders easy_first and hard_first by difficulty", () => {
    const easy = assembleExam(bank, { count: 5, order: "easy_first" });
    const diffs = easy.items.map((i) => i.question.difficulty);
    expect(diffs).toEqual([...diffs].sort((a, b) => a - b));

    const hard = assembleExam(bank, { count: 5, order: "hard_first" });
    const hdiffs = hard.items.map((i) => i.question.difficulty);
    expect(hdiffs).toEqual([...hdiffs].sort((a, b) => b - a));
  });

  it("an empty bank yields an empty, zero-point exam (no crash)", () => {
    const exam = assembleExam([], { count: 5 });
    expect(exam.items).toHaveLength(0);
    expect(exam.answerKey).toHaveLength(0);
    expect(exam.totalPoints).toBe(0);
  });
});
