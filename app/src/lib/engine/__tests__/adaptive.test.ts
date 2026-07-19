import { describe, expect, it } from "vitest";
import { targetDifficulty, pickQuestion } from "../adaptive";
import { initialMastery } from "../mastery";
import type { MasteryState, McSingleQuestion, Question } from "../types";

function mastery(partial: Partial<MasteryState>): MasteryState {
  return { ...initialMastery("steady-state"), evidenceCount: 5, ...partial };
}

describe("targetDifficulty — bands", () => {
  it("no mastery at all → [1,2]", () => {
    expect(targetDifficulty(undefined).band).toEqual([1, 2]);
    expect(targetDifficulty(undefined).reason).toMatch(/fresh/i);
  });

  it("zero evidence → [1,2] regardless of seeded dimensions", () => {
    expect(targetDifficulty(mastery({ evidenceCount: 0, conceptual: 0.9, transfer: 0.9 })).band).toEqual([1, 2]);
  });

  it("conceptual < 0.4 → [1,2]", () => {
    expect(targetDifficulty(mastery({ conceptual: 0.2 })).band).toEqual([1, 2]);
  });

  it("0.4 ≤ conceptual < 0.7 → [2,3]", () => {
    expect(targetDifficulty(mastery({ conceptual: 0.4 })).band).toEqual([2, 3]);
    expect(targetDifficulty(mastery({ conceptual: 0.55 })).band).toEqual([2, 3]);
    expect(targetDifficulty(mastery({ conceptual: 0.69 })).band).toEqual([2, 3]);
  });

  it("conceptual ≥ 0.7 with low transfer → [3,4]", () => {
    expect(targetDifficulty(mastery({ conceptual: 0.7, transfer: 0.2 })).band).toEqual([3, 4]);
    expect(targetDifficulty(mastery({ conceptual: 0.95, transfer: 0.49 })).band).toEqual([3, 4]);
  });

  it("conceptual ≥ 0.7 AND transfer ≥ 0.5 → [4,5]", () => {
    expect(targetDifficulty(mastery({ conceptual: 0.7, transfer: 0.5 })).band).toEqual([4, 5]);
    expect(targetDifficulty(mastery({ conceptual: 0.9, transfer: 0.8 })).band).toEqual([4, 5]);
  });

  it("every reason is a non-empty learner-readable string", () => {
    for (const c of [undefined, mastery({ conceptual: 0.2 }), mastery({ conceptual: 0.5 }), mastery({ conceptual: 0.8 }), mastery({ conceptual: 0.8, transfer: 0.6 })]) {
      expect(targetDifficulty(c).reason.length).toBeGreaterThan(10);
    }
  });
});

// --- pool -----------------------------------------------------------------
function q(id: string, difficulty: 1 | 2 | 3 | 4 | 5, conceptSlug = "steady-state"): McSingleQuestion {
  return {
    id,
    conceptSlug,
    type: "mc_single",
    stem: id,
    difficulty,
    expectedSeconds: 40,
    transferDistance: 0,
    provenance: "ai_approved",
    hint: "",
    citationIds: [],
    options: [
      { id: "a", text: "a" },
      { id: "b", text: "b" },
    ],
    answerKey: { correctOptionId: "a" },
  };
}

const pool: Question[] = [
  q("d1", 1),
  q("d2", 2),
  q("d3", 3),
  q("d4", 4),
  q("d5", 5),
  q("other", 2, "golden-rule"),
];

describe("pickQuestion", () => {
  it("filters to the mastery's concept", () => {
    const res = pickQuestion(pool, mastery({ conceptual: 0.5 }), []);
    expect(res?.question.conceptSlug).toBe("steady-state");
  });

  it("prefers an in-band difficulty", () => {
    // conceptual 0.5 → band [2,3]; d2 or d3 are in band, d2 wins on id tiebreak
    const res = pickQuestion(pool, mastery({ conceptual: 0.5 }), []);
    expect(["d2", "d3"]).toContain(res?.question.id);
  });

  it("avoids recently-seen questions when an alternative is in band", () => {
    // band [2,3]; d2 recently seen → d3 should be chosen
    const res = pickQuestion(pool, mastery({ conceptual: 0.5 }), ["d2"]);
    expect(res?.question.id).toBe("d3");
  });

  it("deterministic tie-break by id among equal candidates", () => {
    const twoAtBand: Question[] = [q("zeta", 2), q("alpha", 2)];
    const res = pickQuestion(twoAtBand, mastery({ conceptual: 0.5 }), []);
    expect(res?.question.id).toBe("alpha");
  });

  it("falls back to the nearest difficulty when the band is empty", () => {
    // band [4,5] but only difficulty-1 and 2 questions exist → difficulty 2 is nearest
    const lowOnly: Question[] = [q("a", 1), q("b", 2)];
    const res = pickQuestion(lowOnly, mastery({ conceptual: 0.9, transfer: 0.9 }), []);
    expect(res?.question.id).toBe("b");
  });

  it("returns the reason and band alongside the question", () => {
    const res = pickQuestion(pool, mastery({ conceptual: 0.8, transfer: 0.6 }), []);
    expect(res?.band).toEqual([4, 5]);
    expect(res?.reason).toMatch(/challenge/i);
  });

  it("returns null when the concept pool is empty", () => {
    expect(pickQuestion([q("other", 2, "golden-rule")], mastery({ conceptual: 0.5 }), [])).toBeNull();
    expect(pickQuestion([], mastery({ conceptual: 0.5 }), [])).toBeNull();
  });

  it("still returns a question when every candidate was recently seen (best-effort avoidance)", () => {
    const res = pickQuestion([q("d2", 2)], mastery({ conceptual: 0.5 }), ["d2"]);
    expect(res?.question.id).toBe("d2");
  });

  it("with no mastery, uses the whole pool and the beginner band", () => {
    const res = pickQuestion(pool, undefined, []);
    expect(res).not.toBeNull();
    expect(res?.band).toEqual([1, 2]);
    // difficulty 1 or 2 in band; d1 wins id tiebreak among {d1,d2}
    expect(["d1", "d2"]).toContain(res?.question.id);
  });
});
