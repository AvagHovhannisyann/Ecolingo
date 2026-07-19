/**
 * MATCH PAIRS engine tests (Wave 2 Stream AC, D-020). Exhaustive coverage of
 * `scoreMatchPairs` (deterministic, boolean correct + per-pair breakdown —
 * the same idiom diagram_label already uses in scoring.ts, and confirmation
 * that mc_multi's all-or-nothing style is the house rule, not partial
 * credit), `shuffledSides` (seeded, deterministic, never-fully-aligned), and
 * the `scoreAnswer` dispatcher wiring in scoring.ts.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { scoreMatchPairs, shuffledSides, type MatchPairsAnswer } from "../match-pairs";
import { scoreAnswer } from "../scoring";
import { buildMatchPairsSeed } from "../../../content/econ13210/match-pairs-seed";
import type { MatchPairsQuestion } from "../types";

/** synthetic N-pair question (p1..pN) for engine-level tests that don't need
 *  real econ content — the seed-content case is covered separately below. */
function buildQuestion(n: number): MatchPairsQuestion {
  return {
    id: `q-match-synthetic-${n}`,
    conceptSlug: "fundamental-equation",
    type: "match_pairs",
    stem: `Match all ${n} pairs.`,
    difficulty: 2,
    expectedSeconds: 60,
    transferDistance: 0,
    provenance: "ai_draft",
    hint: "hint",
    citationIds: [],
    pairs: Array.from({ length: n }, (_, i) => ({
      id: `p${i + 1}`,
      left: `left-${i + 1}`,
      right: `right-${i + 1}`,
    })),
  };
}

const fullyCorrect = (n: number): MatchPairsAnswer => ({
  type: "match_pairs",
  matches: Array.from({ length: n }, (_, i) => ({ leftId: `p${i + 1}`, rightId: `p${i + 1}` })),
});

describe("scoreMatchPairs: deterministic scoring (D-020)", () => {
  it("all pairs correct -> correct, no misconceptions, no failedStep", () => {
    const q = buildQuestion(5);
    const result = scoreMatchPairs(q, fullyCorrect(5));
    expect(result).toEqual({ correct: true, misconceptionSlugs: [], failedStep: null });
  });

  it("is deterministic: identical (question, answer) always scores identically", () => {
    const q = buildQuestion(4);
    const answer = fullyCorrect(4);
    const a = scoreMatchPairs(q, answer);
    const b = scoreMatchPairs(q, answer);
    expect(a).toEqual(b);
  });

  it("one pair mismatched (rest correct, one left unaddressed) -> incorrect with a breakdown naming exactly the affected pairs", () => {
    // Note: if ALL n pairs are submitted with valid, distinct ids on both
    // sides, the rightIds necessarily form a permutation of the leftIds —
    // and a permutation can never have exactly one non-fixed point (its
    // wrong entries always come in cycles of length >= 2). So "exactly one
    // wrong pair" is only reachable by leaving another pair unaddressed,
    // which is exactly what a partial attempt looks like in the UI.
    const q = buildQuestion(4);
    const answer: MatchPairsAnswer = {
      type: "match_pairs",
      matches: [
        { leftId: "p1", rightId: "p1" },
        { leftId: "p2", rightId: "p2" },
        { leftId: "p3", rightId: "p4" }, // wrong; p4 never submitted
      ],
    };
    const result = scoreMatchPairs(q, answer);
    expect(result.correct).toBe(false);
    expect(result.misconceptionSlugs).toEqual([]);
    expect(result.failedStep).toBe("mismatched:p3,p4");
  });

  it("a full submission with two pairs transposed -> incorrect, breakdown names exactly the swapped pair ids (no false 'missing')", () => {
    const q = buildQuestion(4);
    const answer: MatchPairsAnswer = {
      type: "match_pairs",
      matches: [
        { leftId: "p1", rightId: "p1" },
        { leftId: "p2", rightId: "p2" },
        { leftId: "p3", rightId: "p4" },
        { leftId: "p4", rightId: "p3" },
      ],
    };
    const result = scoreMatchPairs(q, answer);
    expect(result.correct).toBe(false);
    expect(result.failedStep).toBe("mismatched:p3,p4");
  });

  it("empty matches -> incorrect, breakdown lists every pair as unaddressed, never crashes", () => {
    const q = buildQuestion(3);
    const result = scoreMatchPairs(q, { type: "match_pairs", matches: [] });
    expect(result.correct).toBe(false);
    expect(result.failedStep).toBe("mismatched:p1,p2,p3");
  });

  it("duplicate leftId in the answer is rejected outright, distinct from a scoring mismatch", () => {
    const q = buildQuestion(3);
    const answer: MatchPairsAnswer = {
      type: "match_pairs",
      matches: [
        { leftId: "p1", rightId: "p1" },
        { leftId: "p1", rightId: "p2" }, // p1 reused as a left id
      ],
    };
    const result = scoreMatchPairs(q, answer);
    expect(result.correct).toBe(false);
    expect(result.failedStep).toBe("duplicate_match_id");
  });

  it("duplicate rightId in the answer is rejected outright", () => {
    const q = buildQuestion(3);
    const answer: MatchPairsAnswer = {
      type: "match_pairs",
      matches: [
        { leftId: "p1", rightId: "p2" },
        { leftId: "p2", rightId: "p2" }, // p2 reused as a right id
      ],
    };
    const result = scoreMatchPairs(q, answer);
    expect(result.correct).toBe(false);
    expect(result.failedStep).toBe("duplicate_match_id");
  });

  it("unknown rightId in the answer is rejected outright, never crashes", () => {
    const q = buildQuestion(3);
    const answer: MatchPairsAnswer = {
      type: "match_pairs",
      matches: [{ leftId: "p1", rightId: "not-a-real-pair-id" }],
    };
    const result = scoreMatchPairs(q, answer);
    expect(result.correct).toBe(false);
    expect(result.failedStep).toBe("unknown_match_id");
  });

  it("unknown leftId in the answer is rejected outright", () => {
    const q = buildQuestion(3);
    const answer: MatchPairsAnswer = {
      type: "match_pairs",
      matches: [{ leftId: "not-a-real-pair-id", rightId: "p1" }],
    };
    const result = scoreMatchPairs(q, answer);
    expect(result.correct).toBe(false);
    expect(result.failedStep).toBe("unknown_match_id");
  });

  it("never throws for arbitrary garbage ids, of any length, for pair counts 3-6", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 6 }),
        fc.array(
          fc.record({ leftId: fc.string(), rightId: fc.string() }),
          { maxLength: 10 }
        ),
        (n, garbageMatches) => {
          const q = buildQuestion(n);
          expect(() => scoreMatchPairs(q, { type: "match_pairs", matches: garbageMatches })).not.toThrow();
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe("shuffledSides: seeded deterministic layout (D-020)", () => {
  it("same seed -> byte-identical order every time (no Math.random anywhere)", () => {
    const q = buildQuestion(5);
    const a = shuffledSides(q, 42);
    const b = shuffledSides(q, 42);
    expect(a).toEqual(b);
  });

  it("different seeds produce different left-column orders for >=4 pairs", () => {
    const q = buildQuestion(6);
    const orders = [1, 2, 3, 4, 5].map((seed) => shuffledSides(q, seed).left.map((c) => c.pairId).join(","));
    // not every seed collapses to the same order — with 6! = 720 possible
    // permutations and 5 small seeds through the LCG, distinct seeds giving
    // distinct orders is the expected, and observed, outcome.
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it("left and right are each a permutation of the question's pair ids (nothing dropped or duplicated)", () => {
    const q = buildQuestion(6);
    const { left, right } = shuffledSides(q, 7);
    const wantIds = q.pairs.map((p) => p.id).sort();
    expect(left.map((c) => c.pairId).sort()).toEqual(wantIds);
    expect(right.map((c) => c.pairId).sort()).toEqual(wantIds);
  });

  it("card text matches the question's left/right prose for its pair id", () => {
    const q = buildQuestion(4);
    const { left, right } = shuffledSides(q, 99);
    for (const card of left) {
      expect(card.text).toBe(q.pairs.find((p) => p.id === card.pairId)!.left);
    }
    for (const card of right) {
      expect(card.text).toBe(q.pairs.find((p) => p.id === card.pairId)!.right);
    }
  });

  it("property: for pair counts 3-6 and any seed, at least one pair is displaced (never accidentally already-solved)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 6 }), fc.integer({ min: -50_000, max: 50_000 }), (n, seed) => {
        const q = buildQuestion(n);
        const { left, right } = shuffledSides(q, seed);
        const alignedCount = left.filter((card, i) => card.pairId === right[i].pairId).length;
        expect(alignedCount).toBeLessThan(n);
      }),
      { numRuns: 300 }
    );
  });

  it("property: shuffledSides is a pure function of (question, seed) across many seeds", () => {
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 6 }), fc.integer({ min: -50_000, max: 50_000 }), (n, seed) => {
        const q = buildQuestion(n);
        expect(shuffledSides(q, seed)).toEqual(shuffledSides(q, seed));
      }),
      { numRuns: 200 }
    );
  });
});

describe("scoring.ts integration: scoreAnswer dispatches match_pairs to scoreMatchPairs", () => {
  it("routes a correct match_pairs answer through the main scoreAnswer switch", () => {
    const q = buildQuestion(4);
    const result = scoreAnswer(q, fullyCorrect(4));
    expect(result.correct).toBe(true);
  });

  it("routes an incorrect match_pairs answer through the main scoreAnswer switch, preserving the breakdown", () => {
    const q = buildQuestion(3);
    const result = scoreAnswer(q, { type: "match_pairs", matches: [] });
    expect(result.correct).toBe(false);
    expect(result.failedStep).toBe("mismatched:p1,p2,p3");
  });

  it("rejects a mismatched answer/question type instead of guessing, same as every other format", () => {
    const q = buildQuestion(3);
    expect(() => scoreAnswer(q, { type: "numeric", raw: "1" })).toThrow(/does not match/);
  });

  it("real seed content (match-pairs-seed.ts) scores correctly through the full pipeline", () => {
    const [fundamental, golden] = buildMatchPairsSeed("cit-test-pending");
    expect(fundamental.pairs.length).toBeGreaterThanOrEqual(3);
    expect(fundamental.pairs.length).toBeLessThanOrEqual(6);
    expect(golden.pairs.length).toBeGreaterThanOrEqual(3);
    expect(golden.pairs.length).toBeLessThanOrEqual(6);
    expect(fundamental.provenance).toBe("ai_draft");
    expect(golden.provenance).toBe("ai_draft");
    expect(fundamental.citationIds).toEqual(["cit-test-pending"]);

    for (const q of [fundamental, golden]) {
      const correctAnswer: MatchPairsAnswer = {
        type: "match_pairs",
        matches: q.pairs.map((p) => ({ leftId: p.id, rightId: p.id })),
      };
      expect(scoreAnswer(q, correctAnswer).correct).toBe(true);

      // swap the first two pairs' right ids -> must be marked incorrect
      const [p1, p2, ...rest] = q.pairs;
      const wrongAnswer: MatchPairsAnswer = {
        type: "match_pairs",
        matches: [
          { leftId: p1.id, rightId: p2.id },
          { leftId: p2.id, rightId: p1.id },
          ...rest.map((p) => ({ leftId: p.id, rightId: p.id })),
        ],
      };
      const wrongResult = scoreAnswer(q, wrongAnswer);
      expect(wrongResult.correct).toBe(false);
      expect(wrongResult.failedStep).toBe(`mismatched:${[p1.id, p2.id].sort().join(",")}`);

      // ids in each pair are unique within the question (no accidental collisions)
      expect(new Set(q.pairs.map((p) => p.id)).size).toBe(q.pairs.length);
    }
  });

  it("shuffledSides never accidentally aligns the real seed questions either", () => {
    const seedQuestions = buildMatchPairsSeed("cit-test-pending");
    for (const q of seedQuestions) {
      for (const seed of [1, 2, 3, 42]) {
        const { left, right } = shuffledSides(q, seed);
        const alignedCount = left.filter((c, i) => c.pairId === right[i].pairId).length;
        expect(alignedCount).toBeLessThan(q.pairs.length);
      }
    }
  });
});
