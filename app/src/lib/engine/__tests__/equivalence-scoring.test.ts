import { describe, expect, it } from "vitest";
import { checkNumericAnswer, parseNumericAnswer } from "../equivalence";
import { nextDifficulty, scoreAnswer } from "../scoring";
import { getQuestion } from "../../../content/econ13210";

describe("TEST-ECON-015: equivalent mathematical answers are accepted", () => {
  const key = { value: 0.25, relTolerance: 0.005 };

  it.each([
    ["0.25", "decimal"],
    ["0,25", "comma separator"],
    ["25%", "percent"],
    ["1/4", "fraction"],
    ["+0.25", "leading plus"],
    ["  0.2500 ", "whitespace + trailing zeros"],
    ["2.5e-1", "scientific notation"],
    ["25", "percent-scaled rate without % sign"],
  ])("accepts %s (%s)", (raw) => {
    expect(checkNumericAnswer(raw, key).correct).toBe(true);
  });

  it("accepts values within tolerance and rejects beyond it", () => {
    expect(checkNumericAnswer("0.2506", { value: 0.25, relTolerance: 0.005 }).correct).toBe(true);
    expect(checkNumericAnswer("0.26", { value: 0.25, relTolerance: 0.005 }).correct).toBe(false);
  });

  it("distinguishes wrong value from unparseable, for feedback", () => {
    expect(checkNumericAnswer("0.5", key).reason).toBe("wrong_value");
    expect(checkNumericAnswer("banana", key).reason).toBe("unparseable");
    expect(parseNumericAnswer("1/0").ok).toBe(false);
    expect(parseNumericAnswer("1,234,5").ok).toBe(false);
  });

  it("accepts declared equivalent literal forms", () => {
    const symbolic = { value: 16, relTolerance: 0.01, equivalentForms: ["4^2"] };
    expect(checkNumericAnswer("4^2", symbolic).correct).toBe(true);
    expect(checkNumericAnswer("16", symbolic).correct).toBe(true);
  });
});

describe("deterministic scoring with misconception mapping (MOAT-03, IDEA-099)", () => {
  it("mc_single: wrong option surfaces its mapped misconception", () => {
    const q = getQuestion("q-solow-mc-1");
    const right = scoreAnswer(q, { type: "mc_single", optionId: "a" });
    expect(right.correct).toBe(true);
    const wrong = scoreAnswer(q, { type: "mc_single", optionId: "b" });
    expect(wrong.correct).toBe(false);
    expect(wrong.misconceptionSlugs).toEqual(["s-rotates-breakeven"]);
  });

  it("equation_assembly: exact order correct; known wrong order maps to misconception", () => {
    const q = getQuestion("q-solow-assembly-1");
    expect(
      scoreAnswer(q, { type: "equation_assembly", orderedTokenIds: ["dk", "eq", "sfk", "minus", "ndk"] }).correct
    ).toBe(true);
    const swapped = scoreAnswer(q, {
      type: "equation_assembly",
      orderedTokenIds: ["dk", "eq", "ndk", "minus", "sfk"],
    });
    expect(swapped.correct).toBe(false);
    expect(swapped.misconceptionSlugs).toEqual(["delta-is-investment"]);
    expect(swapped.failedStep).toBe("equation_structure");
  });

  it("numeric: k* computation graded through the equivalence engine", () => {
    const q = getQuestion("q-solow-numeric-1");
    expect(scoreAnswer(q, { type: "numeric", raw: "16" }).correct).toBe(true);
    expect(scoreAnswer(q, { type: "numeric", raw: "16.0" }).correct).toBe(true);
    const wrong = scoreAnswer(q, { type: "numeric", raw: "4" });
    expect(wrong.correct).toBe(false);
    expect(wrong.failedStep).toBe("calculation");
  });

  it("causal_order: first divergence identifies the failed reasoning step", () => {
    const q = getQuestion("q-solow-causal-1");
    expect(
      scoreAnswer(q, { type: "causal_order", orderedItemIds: ["i1", "i2", "i3", "i4", "i5"] }).correct
    ).toBe(true);
    const wrong = scoreAnswer(q, { type: "causal_order", orderedItemIds: ["i1", "i3", "i2", "i4", "i5"] });
    expect(wrong.correct).toBe(false);
    expect(wrong.failedStep).toBe("causal_step_2");
  });

  it("rejects mismatched answer/question types instead of guessing", () => {
    const q = getQuestion("q-solow-mc-1");
    expect(() => scoreAnswer(q, { type: "numeric", raw: "1" })).toThrow(/does not match/);
  });
});

describe("adaptive difficulty rules (IDEA-102/103)", () => {
  it("steps down on failure or heavy hint use, up on clean success, clamped to [1,5]", () => {
    expect(nextDifficulty(3, false, 0)).toBe(2);
    expect(nextDifficulty(3, true, 2)).toBe(2);
    expect(nextDifficulty(3, true, 0)).toBe(4);
    expect(nextDifficulty(1, false, 0)).toBe(1);
    expect(nextDifficulty(5, true, 0)).toBe(5);
  });
});
