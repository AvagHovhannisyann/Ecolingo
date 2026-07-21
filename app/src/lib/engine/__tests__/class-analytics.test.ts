import { describe, expect, it } from "vitest";
import {
  bucketConceptual,
  classConceptSummary,
  classOverview,
  overconfidenceRanking,
  retentionRiskRanking,
  studentRoster,
  DIMENSION_LABELS,
  MASTERY_DIMENSIONS,
  reteachRanking,
  studentSpread,
  type ConceptSummary,
} from "../class-analytics";
import { initialMastery } from "../mastery";
import type { ClassMastery } from "../../course";
import type { MasteryState } from "../types";

/** Build a mastery state with only the fields a test cares about overridden. */
function mastery(conceptSlug: string, over: Partial<MasteryState> = {}): MasteryState {
  return { ...initialMastery(conceptSlug), evidenceCount: 1, lastEvidenceAt: "2026-07-18T00:00:00Z", ...over };
}

const concepts = [
  { slug: "production-function", name: "Production function" },
  { slug: "steady-state", name: "Steady state" },
  { slug: "golden-rule", name: "Golden Rule of saving" },
];

describe("class-analytics — classConceptSummary", () => {
  it("empty class → every concept has zero students and null weakest dimension", () => {
    const summaries = classConceptSummary({}, concepts);
    expect(summaries).toHaveLength(3);
    for (const s of summaries) {
      expect(s.studentsWithEvidence).toBe(0);
      expect(s.totalStudents).toBe(0);
      expect(s.strugglingCount).toBe(0);
      expect(s.notStartedCount).toBe(0);
      expect(s.weakestDimension).toBeNull();
      for (const dim of MASTERY_DIMENSIONS) expect(s.avgByDimension[dim]).toBe(0);
    }
  });

  it("one student, one concept practiced → averages equal that student; other concept not started", () => {
    const cm: ClassMastery = {
      u1: {
        "steady-state": mastery("steady-state", {
          conceptual: 0.6,
          procedural: 0.5,
          graphInterpretation: 0.3,
          formulaRecall: 0.4,
          transfer: 0.2,
          evidenceCount: 5,
        }),
      },
    };
    const byslug = Object.fromEntries(classConceptSummary(cm, concepts).map((s) => [s.conceptSlug, s]));

    const steady = byslug["steady-state"];
    expect(steady.studentsWithEvidence).toBe(1);
    expect(steady.totalStudents).toBe(1);
    expect(steady.notStartedCount).toBe(0);
    expect(steady.avgByDimension.conceptual).toBeCloseTo(0.6, 6);
    // lowest of the five is transfer (0.2) → weakest
    expect(steady.weakestDimension).toBe("transfer");

    const prod = byslug["production-function"];
    expect(prod.studentsWithEvidence).toBe(0);
    expect(prod.totalStudents).toBe(1);
    expect(prod.notStartedCount).toBe(1);
    expect(prod.weakestDimension).toBeNull();
  });

  it("averages ONLY over students with evidence — a not-started student never dilutes them (§22)", () => {
    const cm: ClassMastery = {
      practiced: { "steady-state": mastery("steady-state", { conceptual: 0.8, evidenceCount: 3 }) },
      // present in the class but no evidence for steady-state (evidenceCount 0)
      idle: { "steady-state": mastery("steady-state", { conceptual: 0.0, evidenceCount: 0 }) },
    };
    const steady = classConceptSummary(cm, concepts).find((s) => s.conceptSlug === "steady-state")!;
    expect(steady.totalStudents).toBe(2);
    expect(steady.studentsWithEvidence).toBe(1);
    expect(steady.notStartedCount).toBe(1);
    // 0.8 only, NOT (0.8 + 0)/2
    expect(steady.avgByDimension.conceptual).toBeCloseTo(0.8, 6);
  });

  it("counts a student as struggling on low conceptual OR a live misconception", () => {
    const cm: ClassMastery = {
      low: { "steady-state": mastery("steady-state", { conceptual: 0.2, evidenceCount: 2 }) },
      misc: {
        "steady-state": mastery("steady-state", {
          conceptual: 0.9,
          misconceptionProbability: { "steady-state-max-output": 0.7 },
          evidenceCount: 2,
        }),
      },
      fine: { "steady-state": mastery("steady-state", { conceptual: 0.85, evidenceCount: 2 }) },
    };
    const steady = classConceptSummary(cm, concepts).find((s) => s.conceptSlug === "steady-state")!;
    expect(steady.studentsWithEvidence).toBe(3);
    expect(steady.strugglingCount).toBe(2); // low + misconception, not "fine"
  });

  it("preserves full dimensionality — never a single collapsed number (§22)", () => {
    const cm: ClassMastery = {
      u1: {
        "steady-state": mastery("steady-state", {
          conceptual: 0.9,
          procedural: 0.1,
          graphInterpretation: 0.5,
          formulaRecall: 0.7,
          transfer: 0.3,
          evidenceCount: 4,
        }),
      },
    };
    const steady = classConceptSummary(cm, concepts).find((s) => s.conceptSlug === "steady-state")!;
    // all five dimensions retained and distinct
    const values = MASTERY_DIMENSIONS.map((d) => steady.avgByDimension[d]);
    expect(new Set(values).size).toBe(5);
    expect(steady.weakestDimension).toBe("procedural"); // lowest = 0.1
  });
});

describe("class-analytics — reteachRanking", () => {
  it("struggling concepts rank first (by count), then not-started, then healthy", () => {
    const cm: ClassMastery = {
      a: {
        // production-function: 2 struggling
        "production-function": mastery("production-function", { conceptual: 0.2, evidenceCount: 2 }),
        // golden-rule: healthy (practiced, none struggling)
        "golden-rule": mastery("golden-rule", { conceptual: 0.85, evidenceCount: 2 }),
      },
      b: {
        "production-function": mastery("production-function", { conceptual: 0.1, evidenceCount: 2 }),
        "golden-rule": mastery("golden-rule", { conceptual: 0.9, evidenceCount: 2 }),
      },
      // steady-state: nobody has any evidence → not_started
    };
    const summaries = classConceptSummary(cm, concepts);
    const ranked = reteachRanking(summaries, concepts);

    expect(ranked.map((r) => r.conceptSlug)).toEqual([
      "production-function", // struggling (2)
      "steady-state", // not started
      "golden-rule", // healthy
    ]);
    expect(ranked.map((r) => r.priority)).toEqual(["struggling", "not_started", "healthy"]);
  });

  it("within the struggling tier: more strugglers first, then lower conceptual, then slug", () => {
    // two struggling concepts with equal counts → tiebreak on avg conceptual asc
    const cm: ClassMastery = {
      a: {
        "production-function": mastery("production-function", { conceptual: 0.35, evidenceCount: 2 }),
        "steady-state": mastery("steady-state", { conceptual: 0.15, evidenceCount: 2 }),
      },
    };
    const ranked = reteachRanking(classConceptSummary(cm, concepts), concepts);
    // both have strugglingCount 1; steady-state has lower conceptual → ranks first
    expect(ranked[0].conceptSlug).toBe("steady-state");
    expect(ranked[1].conceptSlug).toBe("production-function");
  });

  it("produces a learner-readable reason string naming the weakest dimension", () => {
    const cm: ClassMastery = {
      a: {
        "steady-state": mastery("steady-state", {
          conceptual: 0.2,
          graphInterpretation: 0.05,
          evidenceCount: 2,
        }),
      },
    };
    const ranked = reteachRanking(classConceptSummary(cm, concepts), concepts);
    const top = ranked.find((r) => r.conceptSlug === "steady-state")!;
    expect(top.reason).toContain("1 of 1 student");
    expect(top.reason).toContain("40% conceptual");
    expect(top.reason).toContain(DIMENSION_LABELS.graphInterpretation); // "graph interpretation"
  });

  it("is a pure sort — deterministic across repeated and reordered inputs", () => {
    const cm: ClassMastery = {
      a: {
        "production-function": mastery("production-function", { conceptual: 0.2, evidenceCount: 2 }),
        "steady-state": mastery("steady-state", { conceptual: 0.3, evidenceCount: 2 }),
        "golden-rule": mastery("golden-rule", { conceptual: 0.25, evidenceCount: 2 }),
      },
    };
    const summaries = classConceptSummary(cm, concepts);
    const once = reteachRanking(summaries, concepts).map((r) => r.conceptSlug);
    const twice = reteachRanking(summaries, concepts).map((r) => r.conceptSlug);
    expect(once).toEqual(twice);
    // reordering the summaries input must not change the ranking
    const shuffled: ConceptSummary[] = [summaries[2], summaries[0], summaries[1]];
    expect(reteachRanking(shuffled, concepts).map((r) => r.conceptSlug)).toEqual(once);
  });

  it("all-healthy class still returns lowest-average concept first within the healthy tier", () => {
    const cm: ClassMastery = {
      a: {
        "production-function": mastery("production-function", { conceptual: 0.95, evidenceCount: 2 }),
        "steady-state": mastery("steady-state", { conceptual: 0.72, evidenceCount: 2 }),
        "golden-rule": mastery("golden-rule", { conceptual: 0.8, evidenceCount: 2 }),
      },
    };
    const ranked = reteachRanking(classConceptSummary(cm, concepts), concepts);
    expect(ranked.every((r) => r.priority === "healthy")).toBe(true);
    expect(ranked[0].conceptSlug).toBe("steady-state"); // lowest avg conceptual
  });
});

describe("class-analytics — studentSpread + bucketConceptual", () => {
  it("buckets on the documented thresholds (developing = [0.4, 0.7))", () => {
    expect(bucketConceptual(0.7)).toBe("strong");
    expect(bucketConceptual(0.69)).toBe("developing");
    expect(bucketConceptual(0.4)).toBe("developing");
    expect(bucketConceptual(0.39)).toBe("struggling");
  });

  it("returns only students with evidence, in stable userId order", () => {
    const cm: ClassMastery = {
      u3: { "steady-state": mastery("steady-state", { conceptual: 0.8, evidenceCount: 2 }) },
      u1: { "steady-state": mastery("steady-state", { conceptual: 0.5, evidenceCount: 2 }) },
      u2: { "steady-state": mastery("steady-state", { conceptual: 0.2, evidenceCount: 0 }) }, // no evidence
    };
    const spread = studentSpread(cm, "steady-state");
    expect(spread.map((e) => e.userId)).toEqual(["u1", "u3"]); // u2 excluded, sorted
    expect(spread.map((e) => e.bucket)).toEqual(["developing", "strong"]);
  });

  it("empty for a concept nobody has practiced", () => {
    const cm: ClassMastery = {
      u1: { "steady-state": mastery("steady-state", { evidenceCount: 3 }) },
    };
    expect(studentSpread(cm, "golden-rule")).toEqual([]);
  });
});

describe("class-analytics — classOverview (D-045)", () => {
  it("empty class → zeros and null weakest dimension", () => {
    const o = classOverview({}, concepts);
    expect(o).toMatchObject({
      totalStudents: 0,
      activeStudents: 0,
      conceptsCovered: 0,
      coverage: 0,
      weakestDimension: null,
      weakestDimensionValue: 0,
    });
  });

  it("computes coverage, active students and the class-wide weakest dimension", () => {
    // set every dimension explicitly so transfer is unambiguously the lowest
    // (otherwise the initialMastery defaults would dominate the comparison).
    const dims = { conceptual: 0.8, procedural: 0.8, graphInterpretation: 0.8, formulaRecall: 0.8 };
    const cm: ClassMastery = {
      u1: {
        "steady-state": mastery("steady-state", { ...dims, transfer: 0.2 }),
        "golden-rule": mastery("golden-rule", { ...dims, conceptual: 0.6, transfer: 0.3 }),
      },
      u2: {
        "steady-state": mastery("steady-state", { ...dims, conceptual: 0.4, transfer: 0.1 }),
      },
      u3: {}, // enrolled, never practiced
    };
    const o = classOverview(cm, concepts);
    expect(o.totalStudents).toBe(3);
    expect(o.activeStudents).toBe(2); // u3 has no evidence
    expect(o.conceptsCovered).toBe(2); // production-function never touched
    // 3 evidence cells out of 3 students × 3 concepts = 9
    expect(o.coverage).toBeCloseTo(3 / 9, 6);
    // transfer is the lowest dimension across cells
    expect(o.weakestDimension).toBe("transfer");
  });
});

describe("class-analytics — overconfidence & retention flags (D-045)", () => {
  it("flags overconfident students (high confidence, low conceptual) and ranks by count", () => {
    const cm: ClassMastery = {
      u1: { "steady-state": mastery("steady-state", { conceptual: 0.2, confidence: 0.9 }) }, // overconfident
      u2: { "steady-state": mastery("steady-state", { conceptual: 0.3, confidence: 0.8 }) }, // overconfident
      u3: { "steady-state": mastery("steady-state", { conceptual: 0.2, confidence: 0.3 }) }, // struggling but NOT overconfident
      u4: { "golden-rule": mastery("golden-rule", { conceptual: 0.1, confidence: 0.95 }) }, // overconfident, other concept
    };
    const flags = overconfidenceRanking(cm, concepts);
    expect(flags.map((f) => f.conceptSlug)).toEqual(["steady-state", "golden-rule"]);
    expect(flags[0].count).toBe(2);
    expect(flags[0].studentsWithEvidence).toBe(3);
    expect(flags[1].count).toBe(1);
  });

  it("flags fading retention only for concepts the student actually learned", () => {
    const cm: ClassMastery = {
      u1: { "steady-state": mastery("steady-state", { conceptual: 0.8, retentionStrength: 0.2 }) }, // learned, fading
      u2: { "steady-state": mastery("steady-state", { conceptual: 0.2, retentionStrength: 0.1 }) }, // not learned → not a retention flag
      u3: { "steady-state": mastery("steady-state", { conceptual: 0.9, retentionStrength: 0.9 }) }, // solid, no risk
    };
    const flags = retentionRiskRanking(cm, concepts);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ conceptSlug: "steady-state", count: 1, studentsWithEvidence: 3 });
  });
});

describe("class-analytics — studentRoster (D-045)", () => {
  it("one row per enrolled student incl. never-started, most-needing-attention first", () => {
    const cm: ClassMastery = {
      u1: {
        "steady-state": mastery("steady-state", { conceptual: 0.2, lastEvidenceAt: "2026-07-19T00:00:00Z" }), // struggling
        "golden-rule": mastery("golden-rule", { conceptual: 0.9 }),
      },
      u2: {
        "steady-state": mastery("steady-state", { conceptual: 0.85 }),
        "golden-rule": mastery("golden-rule", { conceptual: 0.75 }),
      }, // on track
    };
    const roster = [{ userId: "u1" }, { userId: "u2" }, { userId: "u3" }]; // u3 never started
    const rows = studentRoster(cm, roster, concepts);
    // struggling first, then not_started, then on_track — same convention as the
    // reteach ranking (a not-started learner outranks one who's doing fine).
    expect(rows.map((r) => r.userId)).toEqual(["u1", "u3", "u2"]);
    expect(rows[0]).toMatchObject({ status: "struggling", conceptsStarted: 2, strugglingConcepts: 1 });
    expect(rows[0].lastActiveAt).toBe("2026-07-19T00:00:00Z");
    expect(rows[1]).toMatchObject({ status: "not_started", conceptsStarted: 0, coverage: 0, lastActiveAt: null });
    expect(rows[2]).toMatchObject({ status: "on_track", conceptsStarted: 2, strugglingConcepts: 0 });
    expect(rows[2].avgConceptual).toBeCloseTo(0.8, 6);
  });
});
