import { describe, expect, it } from "vitest";
import {
  DIAGNOSTIC_ITEMS,
  scoreDiagnostic,
  scoreDiagnosticItem,
  suggestedDefaults,
} from "../diagnostic";

describe("onboarding diagnostic (IDEA-005/006/007) — deterministic scoring", () => {
  it("numeric items accept equivalent forms (TEST-ECON-015 discipline applies everywhere)", () => {
    const growth = DIAGNOSTIC_ITEMS.find((i) => i.id === "d-math-2")!;
    for (const raw of ["5%", "0.05", "0,05", "5"]) {
      expect(scoreDiagnosticItem(growth, raw)).toBe(true);
    }
    expect(scoreDiagnosticItem(growth, "10%")).toBe(false);
  });

  it("scores per skill, not one global number (§22 discipline)", () => {
    const result = scoreDiagnostic([
      { itemId: "d-math-1", response: "3", confidence: 3 },
      { itemId: "d-math-2", response: "5%", confidence: 3 },
      { itemId: "d-graph-1", response: "b", confidence: 3 },
      { itemId: "d-graph-2", response: "b", confidence: 3 },
    ]);
    expect(result.mathReadiness).toBe(1);
    expect(result.graphReading).toBe(0);
  });

  it("flags over-confidence misses for the calibration note (IDEA-101)", () => {
    const result = scoreDiagnostic([
      { itemId: "d-math-1", response: "7", confidence: 4 },
      { itemId: "d-graph-1", response: "a", confidence: 3 },
    ]);
    expect(result.calibrationNote).toMatch(/certain/i);
  });

  it("flags under-confidence hits", () => {
    const result = scoreDiagnostic([{ itemId: "d-math-1", response: "3", confidence: 1 }]);
    expect(result.calibrationNote).toMatch(/ahead of your confidence/i);
  });

  it("unanswered skills default to the neutral midpoint, never zero", () => {
    const result = scoreDiagnostic([{ itemId: "d-math-1", response: "3", confidence: null }]);
    expect(result.graphReading).toBe(0.5);
  });

  it("suggested defaults are gentle for struggling learners, math-first for strong ones", () => {
    expect(suggestedDefaults({ mathReadiness: 0.25, graphReading: 0.5, calibrationNote: null, answered: 4 })).toEqual({
      readingLevel: "simpler",
      explanationOrder: "visual_first",
    });
    expect(suggestedDefaults({ mathReadiness: 1, graphReading: 1, calibrationNote: null, answered: 4 })).toEqual({
      readingLevel: "standard",
      explanationOrder: "math_first",
    });
  });
});
