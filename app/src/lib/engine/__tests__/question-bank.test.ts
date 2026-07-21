import { describe, expect, it } from "vitest";
import {
  distributeCount,
  difficultyBucket,
  filterQuestions,
  MAX_BANK_GENERATION,
} from "../question-bank";

describe("distributeCount", () => {
  it("spreads evenly and sums to the total, front-loading the remainder", () => {
    expect(distributeCount(10, 3)).toEqual([4, 3, 3]);
    expect(distributeCount(9, 3)).toEqual([3, 3, 3]);
    expect(distributeCount(2, 5)).toEqual([1, 1, 0, 0, 0]);
    for (const [t, b] of [[100, 7], [50, 12], [1, 4], [37, 5]] as [number, number][]) {
      const d = distributeCount(t, b);
      expect(d).toHaveLength(b);
      expect(d.reduce((a, x) => a + x, 0)).toBe(t);
    }
  });
  it("handles zero/negative buckets and totals safely", () => {
    expect(distributeCount(10, 0)).toEqual([]);
    expect(distributeCount(10, -3)).toEqual([]);
    expect(distributeCount(-5, 3)).toEqual([0, 0, 0]);
    expect(distributeCount(0, 3)).toEqual([0, 0, 0]);
  });
});

describe("difficultyBucket", () => {
  it("maps 1–5 to easy/medium/hard", () => {
    expect(difficultyBucket(1)).toBe("easy");
    expect(difficultyBucket(2)).toBe("easy");
    expect(difficultyBucket(3)).toBe("medium");
    expect(difficultyBucket(4)).toBe("hard");
    expect(difficultyBucket(5)).toBe("hard");
  });
});

describe("filterQuestions", () => {
  const bank = [
    { id: "a", difficulty: 1, conceptSlug: "demand" },
    { id: "b", difficulty: 3, conceptSlug: "demand" },
    { id: "c", difficulty: 5, conceptSlug: "supply" },
    { id: "d", difficulty: 4, conceptSlug: "supply" },
  ];
  it("defaults to no filtering, preserving order", () => {
    expect(filterQuestions(bank).map((q) => q.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("filters by difficulty bucket", () => {
    expect(filterQuestions(bank, { difficulty: "hard" }).map((q) => q.id)).toEqual(["c", "d"]);
    expect(filterQuestions(bank, { difficulty: "easy" }).map((q) => q.id)).toEqual(["a"]);
    expect(filterQuestions(bank, { difficulty: "medium" }).map((q) => q.id)).toEqual(["b"]);
  });
  it("filters by topic (concept slug)", () => {
    expect(filterQuestions(bank, { topic: "supply" }).map((q) => q.id)).toEqual(["c", "d"]);
  });
  it("combines difficulty and topic", () => {
    expect(filterQuestions(bank, { difficulty: "hard", topic: "supply" }).map((q) => q.id)).toEqual(["c", "d"]);
    expect(filterQuestions(bank, { difficulty: "easy", topic: "supply" })).toEqual([]);
  });
  it("treats explicit 'all' as no constraint", () => {
    expect(filterQuestions(bank, { difficulty: "all", topic: "all" })).toHaveLength(4);
  });
});

describe("MAX_BANK_GENERATION", () => {
  it("is 100", () => {
    expect(MAX_BANK_GENERATION).toBe(100);
  });
});
