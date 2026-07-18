import { describe, expect, it } from "vitest";
import { sanitizeDraftedQuestions, toAuthoredQuestion } from "../authored";
import { scoreAnswer } from "../scoring";

describe("sanitizeDraftedQuestions (D-014: malformed drafts never reach review)", () => {
  it("keeps well-formed 4-option drafts and normalizes the index", () => {
    const raw = [
      { stem: "What is the steady state?", options: ["A", "B", "C", "D"], correctIndex: 2, rationale: "because" },
    ];
    const out = sanitizeDraftedQuestions(raw);
    expect(out).toHaveLength(1);
    expect(out[0].suggestedIndex).toBe(2);
    expect(out[0].options).toHaveLength(4);
  });

  it("drops drafts with too few / too many / duplicate options", () => {
    const raw = [
      { stem: "a", options: ["x", "y"], correctIndex: 0 }, // too few
      { stem: "b", options: ["1", "2", "3", "4", "5", "6"], correctIndex: 0 }, // too many
      { stem: "c", options: ["same", "same", "z", "w"], correctIndex: 0 }, // dup options
    ];
    expect(sanitizeDraftedQuestions(raw)).toEqual([]);
  });

  it("clamps an out-of-range correctIndex to 0 rather than dropping", () => {
    const out = sanitizeDraftedQuestions([{ stem: "q", options: ["a", "b", "c", "d"], correctIndex: 9 }]);
    expect(out[0].suggestedIndex).toBe(0);
  });

  it("dedupes identical stems and ignores non-array / garbage", () => {
    const raw = [
      { stem: "dup", options: ["a", "b", "c", "d"], correctIndex: 1 },
      { stem: "dup", options: ["a", "b", "c", "d"], correctIndex: 2 },
    ];
    expect(sanitizeDraftedQuestions(raw)).toHaveLength(1);
    expect(sanitizeDraftedQuestions(null)).toEqual([]);
    expect(sanitizeDraftedQuestions([1, "x", {}])).toEqual([]);
  });
});

describe("toAuthoredQuestion (teacher-ratified → deterministic question)", () => {
  const draft = { stem: "Pick the truth", options: ["wrong", "right", "also wrong", "nope"], suggestedIndex: 3 };

  it("uses the TEACHER's confirmed index, not the model's suggestion (GATE-002)", () => {
    const q = toAuthoredQuestion(draft, "steady-state", 1, []);
    expect(q.provenance).toBe("ai_approved");
    expect(q.type).toBe("mc_single");
    expect(q.answerKey).toEqual({ correctOptionId: "b" }); // index 1 → "b", not the model's 3
  });

  it("produces a question the existing deterministic scorer marks correctly", () => {
    const q = toAuthoredQuestion(draft, "steady-state", 1, []);
    const right = scoreAnswer(q, { type: "mc_single", optionId: "b" });
    const wrong = scoreAnswer(q, { type: "mc_single", optionId: "a" });
    expect(right.correct).toBe(true);
    expect(wrong.correct).toBe(false);
  });

  it("gives a stable id derived from the stem (idempotent approval)", () => {
    expect(toAuthoredQuestion(draft, "steady-state", 1).id).toBe(toAuthoredQuestion(draft, "steady-state", 1).id);
  });
});
