import { describe, expect, it } from "vitest";
import {
  sanitizeDraftedQuestionsMulti,
  toAuthoredQuestionMulti,
  sanitizeDraftedNumeric,
  toAuthoredNumeric,
  toAuthoredQuestion,
  tierParams,
} from "../authored";
import { scoreAnswer } from "../scoring";

describe("sanitizeDraftedQuestionsMulti (mc_multi validation, D-020)", () => {
  it("keeps a well-formed 4-option, 2-correct select-all", () => {
    const raw = [
      { stem: "Select all true statements.", options: ["a", "b", "c", "d"], correctIndices: [0, 2], rationale: "x" },
    ];
    const out = sanitizeDraftedQuestionsMulti(raw);
    expect(out).toHaveLength(1);
    expect(out[0].suggestedIndices).toEqual([0, 2]);
  });

  it("accepts 5 options with 3 correct; sorts + dedupes indices", () => {
    const raw = [{ stem: "q", options: ["a", "b", "c", "d", "e"], correctIndices: [4, 0, 0, 2] }];
    const out = sanitizeDraftedQuestionsMulti(raw);
    expect(out[0].suggestedIndices).toEqual([0, 2, 4]);
  });

  it("drops select-alls with <2 correct, all-correct, out-of-range, or dup options", () => {
    const raw = [
      { stem: "one-correct", options: ["a", "b", "c", "d"], correctIndices: [1] }, // <2 correct
      { stem: "all-correct", options: ["a", "b", "c", "d"], correctIndices: [0, 1, 2, 3] }, // no distractor
      { stem: "oob", options: ["a", "b", "c", "d"], correctIndices: [0, 9] }, // 9 filtered → 1 left → <2
      { stem: "dupopt", options: ["a", "a", "b", "c"], correctIndices: [0, 2] }, // dup options
      { stem: "too-few-opts", options: ["a", "b", "c"], correctIndices: [0, 1] }, // <4 options
    ];
    expect(sanitizeDraftedQuestionsMulti(raw)).toEqual([]);
  });

  it("dedupes stems and rejects non-arrays", () => {
    const raw = [
      { stem: "dup", options: ["a", "b", "c", "d"], correctIndices: [0, 1] },
      { stem: "dup", options: ["a", "b", "c", "d"], correctIndices: [1, 2] },
    ];
    expect(sanitizeDraftedQuestionsMulti(raw)).toHaveLength(1);
    expect(sanitizeDraftedQuestionsMulti(null)).toEqual([]);
  });
});

describe("toAuthoredQuestionMulti (teacher-ratified → deterministic mc_multi)", () => {
  const draft = {
    stem: "Which are true?",
    options: ["true1", "false1", "true2", "false2"],
    suggestedIndices: [0, 2],
  };

  it("uses the TEACHER's confirmed indices and scores correctly", () => {
    const q = toAuthoredQuestionMulti(draft, "golden-rule", [0, 2], []);
    expect(q.type).toBe("mc_multi");
    expect(q.provenance).toBe("ai_approved");
    expect(q.answerKey.correctOptionIds).toEqual(["a", "c"]);
    expect(scoreAnswer(q, { type: "mc_multi", optionIds: ["a", "c"] }).correct).toBe(true);
    expect(scoreAnswer(q, { type: "mc_multi", optionIds: ["a", "b"] }).correct).toBe(false);
  });

  it("falls back to the model suggestion if the teacher set is empty", () => {
    const q = toAuthoredQuestionMulti(draft, "golden-rule", [], []);
    expect(q.answerKey.correctOptionIds).toEqual(["a", "c"]);
  });

  it("threads difficulty/transfer from the draft and honors an id override", () => {
    const q = toAuthoredQuestionMulti(
      { ...draft, difficulty: 4, transferDistance: 1 },
      "golden-rule",
      [0, 2],
      [],
      { id: "q-gen-golden-rule-2" }
    );
    expect(q.difficulty).toBe(4);
    expect(q.transferDistance).toBe(1);
    expect(q.id).toBe("q-gen-golden-rule-2");
  });
});

describe("sanitizeDraftedNumeric (anti-hallucination guard, D-020)", () => {
  it("keeps a numeric whose operands all appear in the stem", () => {
    const raw = [
      { stem: "With A = 2 and k = 64, compute A times sqrt(k).", value: 16, operands: [2, 64], rationale: "2*8" },
    ];
    const out = sanitizeDraftedNumeric(raw);
    expect(out).toHaveLength(1);
    expect(out[0].suggestedValue).toBe(16);
  });

  it("drops a numeric that uses an operand NOT present in the stem (fabricated input)", () => {
    const raw = [{ stem: "Compute output per worker.", value: 16, operands: [2, 64] }];
    expect(sanitizeDraftedNumeric(raw)).toEqual([]);
  });

  it("drops when the answer key is not a finite number, or no operands are given", () => {
    expect(sanitizeDraftedNumeric([{ stem: "s", value: "NaN", operands: [1] }])).toEqual([]);
    expect(sanitizeDraftedNumeric([{ stem: "with 5 things", value: 5, operands: [] }])).toEqual([]);
  });

  it("does not require the answer value itself to appear in the stem", () => {
    const raw = [{ stem: "Given 3 and 4, add them.", value: 7, operands: [3, 4] }];
    expect(sanitizeDraftedNumeric(raw)).toHaveLength(1);
  });
});

describe("toAuthoredNumeric", () => {
  const draft = { stem: "Given 3 and 4, add them.", suggestedValue: 7, unitLabel: "units" };
  it("uses the teacher-confirmed value and scores through the engine", () => {
    const q = toAuthoredNumeric(draft, "sum", 7, []);
    expect(q.type).toBe("numeric");
    expect(q.answerKey.value).toBe(7);
    expect(scoreAnswer(q, { type: "numeric", raw: "7" }).correct).toBe(true);
    expect(scoreAnswer(q, { type: "numeric", raw: "8" }).correct).toBe(false);
  });
});

describe("tier flow-through", () => {
  it("tierParams maps tiers deterministically", () => {
    expect(tierParams("easy")).toEqual({ difficulty: 2, transferDistance: 0 });
    expect(tierParams("hard")).toEqual({ difficulty: 4, transferDistance: 1 });
    expect(tierParams("mixed")).toEqual({ difficulty: 3, transferDistance: 0 });
  });

  it("difficulty/transfer from a draft flow into an authored mc_single", () => {
    const q = toAuthoredQuestion(
      { stem: "q", options: ["a", "b", "c", "d"], suggestedIndex: 0, difficulty: 4, transferDistance: 1 },
      "x",
      0
    );
    expect(q.difficulty).toBe(4);
    expect(q.transferDistance).toBe(1);
  });

  it("legacy callers (no tier fields, no opts) keep the old defaults", () => {
    const q = toAuthoredQuestion({ stem: "q", options: ["a", "b", "c", "d"], suggestedIndex: 1 }, "x", 1);
    expect(q.difficulty).toBe(2);
    expect(q.transferDistance).toBe(0);
    expect(q.id).toMatch(/^q-authored-x-/);
  });
});
