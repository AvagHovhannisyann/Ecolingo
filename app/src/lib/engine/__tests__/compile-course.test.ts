import { describe, expect, it } from "vitest";
import {
  slugify,
  sanitizeCoursePlan,
  planToCourseDraft,
  isSolowAdjacent,
  generatedQuestionId,
  estimateCompileSeconds,
  formatCompileEstimate,
  type DraftCoursePlan,
} from "../compile-course";
import { scoreAnswer } from "../scoring";
import type { McSingleQuestion, Question } from "../types";

describe("slugify (deterministic kebab-case)", () => {
  it("kebab-cases names, strips punctuation and accents, trims hyphens", () => {
    expect(slugify("Steady State")).toBe("steady-state");
    expect(slugify("  The Golden Rule! ")).toBe("the-golden-rule");
    expect(slugify("Production function (per worker)")).toBe("production-function-per-worker");
    expect(slugify("Crème brûlée")).toBe("creme-brulee");
    expect(slugify("multiple   spaces")).toBe("multiple-spaces");
  });
  it("is idempotent on an already-slugged string", () => {
    expect(slugify("steady-state")).toBe("steady-state");
  });
  it("returns empty for punctuation-only input", () => {
    expect(slugify("!!!")).toBe("");
    expect(slugify("   ")).toBe("");
  });
});

const allowed = new Set(["doc-s1", "doc-s2", "doc-s3"]);

function lesson(name: string, extra: Record<string, unknown> = {}) {
  return {
    title: `Learn ${name}`,
    conceptName: name,
    definition: `Definition of ${name}.`,
    coreIdea: `Core idea of ${name}.`,
    intuition: `Intuition for ${name}.`,
    estimatedMinutes: 8,
    sourceSectionIds: ["doc-s1"],
    ...extra,
  };
}

describe("sanitizeCoursePlan — structural validation", () => {
  it("keeps well-formed units/lessons and derives slugs deterministically", () => {
    const raw = {
      units: [{ title: "Unit 1", lessons: [lesson("Steady State"), lesson("Golden Rule")] }],
      prereqPairs: [],
    };
    const { plan, droppedLessons, droppedUnits } = sanitizeCoursePlan(raw, allowed);
    expect(droppedUnits).toBe(0);
    expect(droppedLessons).toBe(0);
    expect(plan.units).toHaveLength(1);
    expect(plan.units[0].lessons.map((l) => l.conceptSlug)).toEqual(["steady-state", "golden-rule"]);
  });

  it("drops malformed lessons (missing prose / unnameable concept) and counts them", () => {
    const raw = {
      units: [
        {
          title: "U",
          lessons: [
            lesson("Good One"),
            lesson("No Def", { definition: "" }),
            lesson("!!!"), // slugifies to ""
            { junk: true },
          ],
        },
      ],
      prereqPairs: [],
    };
    const { plan, droppedLessons } = sanitizeCoursePlan(raw, allowed);
    expect(plan.units[0].lessons.map((l) => l.conceptSlug)).toEqual(["good-one"]);
    expect(droppedLessons).toBe(3);
  });

  it("dedupes lessons that slugify to the same slug (keeps first)", () => {
    const raw = {
      units: [{ title: "U", lessons: [lesson("Steady State"), lesson("steady   state")] }],
      prereqPairs: [],
    };
    const { plan, droppedLessons } = sanitizeCoursePlan(raw, allowed);
    expect(plan.units[0].lessons).toHaveLength(1);
    expect(droppedLessons).toBe(1);
  });

  it("filters sourceSectionIds to the allowlist (fabricated ids can't survive)", () => {
    const raw = {
      units: [{ title: "U", lessons: [lesson("Steady State", { sourceSectionIds: ["doc-s2", "ghost-99", "doc-s3"] })] }],
      prereqPairs: [],
    };
    const { plan } = sanitizeCoursePlan(raw, allowed);
    expect(plan.units[0].lessons[0].sourceSectionIds).toEqual(["doc-s2", "doc-s3"]);
  });

  it("caps to ≤24 units and ≤8 lessons/unit", () => {
    const manyLessons = Array.from({ length: 12 }, (_, i) => lesson(`Concept ${i}`));
    const manyUnits = Array.from({ length: 30 }, (_, u) => ({ title: `U${u}`, lessons: [lesson(`U${u} C`)] }));
    const capUnits = sanitizeCoursePlan({ units: manyUnits, prereqPairs: [] }, allowed);
    expect(capUnits.plan.units).toHaveLength(24);
    const capLessons = sanitizeCoursePlan({ units: [{ title: "U", lessons: manyLessons }], prereqPairs: [] }, allowed);
    expect(capLessons.plan.units[0].lessons).toHaveLength(8);
  });

  it("coerces bad estimatedMinutes to a sane value", () => {
    const raw = {
      units: [{ title: "U", lessons: [lesson("A", { estimatedMinutes: -5 }), lesson("B", { estimatedMinutes: 999 })] }],
      prereqPairs: [],
    };
    const { plan } = sanitizeCoursePlan(raw, allowed);
    expect(plan.units[0].lessons[0].estimatedMinutes).toBeGreaterThan(0);
    expect(plan.units[0].lessons[1].estimatedMinutes).toBeLessThanOrEqual(60);
  });

  it("treats non-object / empty raw as an empty plan", () => {
    expect(sanitizeCoursePlan(null, allowed).plan).toEqual({ units: [], prereqPairs: [] });
    expect(sanitizeCoursePlan({ units: "nope" }, allowed).plan.units).toEqual([]);
  });
});

describe("sanitizeCoursePlan — prereq DAG enforcement", () => {
  const threeLessons = {
    units: [{ title: "U", lessons: [lesson("A"), lesson("B"), lesson("C")] }],
  };

  it("keeps valid edges referencing existing slugs (accepts names or slugs)", () => {
    const { plan, droppedPrereqPairs } = sanitizeCoursePlan(
      { ...threeLessons, prereqPairs: [["A", "B"], ["b", "c"]] },
      allowed
    );
    expect(plan.prereqPairs).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(droppedPrereqPairs).toEqual([]);
  });

  it("drops edges with unknown slugs, self-loops, and duplicates, recording reasons", () => {
    const { plan, droppedPrereqPairs } = sanitizeCoursePlan(
      { ...threeLessons, prereqPairs: [["A", "Ghost"], ["A", "A"], ["A", "B"], ["a", "b"]] },
      allowed
    );
    expect(plan.prereqPairs).toEqual([["a", "b"]]);
    const reasons = droppedPrereqPairs.map((d) => d.reason);
    expect(reasons).toContain("unknown_slug");
    expect(reasons).toContain("self_loop");
    expect(reasons).toContain("duplicate");
  });

  it("drops the cycle-closing edge deterministically (keeps first-seen), records 'cycle'", () => {
    // A→B, B→C accepted; C→A would close a cycle and must be dropped
    const { plan, droppedPrereqPairs } = sanitizeCoursePlan(
      { ...threeLessons, prereqPairs: [["A", "B"], ["B", "C"], ["C", "A"]] },
      allowed
    );
    expect(plan.prereqPairs).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
    const cyc = droppedPrereqPairs.find((d) => d.reason === "cycle");
    expect(cyc?.pair).toEqual(["c", "a"]);
  });

  it("drops a direct 2-node cycle closer (A→B kept, B→A dropped)", () => {
    const { plan, droppedPrereqPairs } = sanitizeCoursePlan(
      { units: [{ title: "U", lessons: [lesson("A"), lesson("B")] }], prereqPairs: [["A", "B"], ["B", "A"]] },
      allowed
    );
    expect(plan.prereqPairs).toEqual([["a", "b"]]);
    expect(droppedPrereqPairs.map((d) => d.reason)).toEqual(["cycle"]);
  });
});

describe("isSolowAdjacent", () => {
  it("is true for Solow concepts, false for unrelated ones", () => {
    expect(isSolowAdjacent("steady-state", "Steady state", "capital per worker stops changing")).toBe(true);
    expect(isSolowAdjacent("golden-rule", "Golden Rule", "maximizes consumption")).toBe(true);
    expect(isSolowAdjacent("supply-demand", "Supply and demand", "price where curves cross")).toBe(false);
  });
});

describe("planToCourseDraft — conversion to real engine types", () => {
  const plan: DraftCoursePlan = {
    units: [
      {
        title: "Growth",
        lessons: [
          {
            title: "The steady state",
            conceptName: "Steady State",
            conceptSlug: "steady-state",
            definition: "Capital per worker stops changing at k*.",
            coreIdea: "Investment equals break-even investment.",
            intuition: "A leaky bucket settles where inflow equals leak.",
            estimatedMinutes: 10,
            sourceSectionIds: ["doc-s1"],
          },
          {
            title: "Supply and demand",
            conceptName: "Supply and demand",
            conceptSlug: "supply-and-demand",
            definition: "Price settles where supply meets demand.",
            coreIdea: "Markets clear at the crossing price.",
            intuition: "An auction finds the clearing price.",
            estimatedMinutes: 8,
            sourceSectionIds: [],
          },
        ],
      },
    ],
    prereqPairs: [["steady-state", "supply-and-demand"]],
  };

  const genQuestions: Question[] = [
    makeQ("q-gen-steady-state-1", "steady-state", 2),
    makeQ("q-gen-steady-state-2", "steady-state", 4),
  ];

  it("mints planned_unverified, unlocked concepts", () => {
    const { concepts } = planToCourseDraft(plan, genQuestions);
    expect(concepts).toHaveLength(2);
    for (const c of concepts) {
      expect(c.sourceStatus).toBe("planned_unverified");
      expect(c.locked).toBe(false);
    }
    expect(concepts[0].slug).toBe("steady-state");
  });

  it("builds edges only between known slugs", () => {
    const { edges } = planToCourseDraft(plan, genQuestions);
    expect(edges).toEqual([{ prereqSlug: "steady-state", conceptSlug: "supply-and-demand", kind: "requires" }]);
  });

  it("emits a Solow-lab visual step ONLY for the Solow-adjacent lesson", () => {
    const { lessons } = planToCourseDraft(plan, genQuestions);
    const steady = lessons.find((l) => l.conceptSlug === "steady-state")!;
    const supply = lessons.find((l) => l.conceptSlug === "supply-and-demand")!;
    expect(steady.steps.some((s) => s.type === "visual")).toBe(true);
    expect(supply.steps.some((s) => s.type === "visual")).toBe(false);
  });

  it("never emits a math step (equations are never fabricated)", () => {
    const { lessons } = planToCourseDraft(plan, genQuestions);
    for (const l of lessons) expect(l.steps.some((s) => s.type === "math")).toBe(false);
  });

  it("always emits core_idea + intuition from the draft text", () => {
    const { lessons } = planToCourseDraft(plan, genQuestions);
    const steady = lessons.find((l) => l.conceptSlug === "steady-state")!;
    const core = steady.steps.find((s) => s.type === "core_idea");
    expect(core && "body" in core && core.body.standard).toContain("break-even");
  });

  it("references only question ids that actually exist (guided + mastery both resolve)", () => {
    const { lessons } = planToCourseDraft(plan, genQuestions);
    const steady = lessons.find((l) => l.conceptSlug === "steady-state")!;
    const guided = steady.steps.find((s) => s.type === "guided");
    const mastery = steady.steps.find((s) => s.type === "mastery_check");
    expect(guided && "questionId" in guided && guided.questionId).toBe("q-gen-steady-state-1");
    expect(mastery && "questionId" in mastery && mastery.questionId).toBe("q-gen-steady-state-2");
  });

  it("omits guided/mastery steps for a concept with no generated questions", () => {
    const { lessons } = planToCourseDraft(plan, []);
    for (const l of lessons) {
      expect(l.steps.some((s) => s.type === "guided" || s.type === "mastery_check")).toBe(false);
    }
  });

  it("uses a lone question as the mastery check when only one exists", () => {
    const one: Question[] = [makeQ("q-gen-steady-state-1", "steady-state", 2)];
    const { lessons } = planToCourseDraft(plan, one);
    const steady = lessons.find((l) => l.conceptSlug === "steady-state")!;
    expect(steady.steps.some((s) => s.type === "guided")).toBe(false);
    const mastery = steady.steps.find((s) => s.type === "mastery_check");
    expect(mastery && "questionId" in mastery && mastery.questionId).toBe("q-gen-steady-state-1");
  });

  it("marks compiled lessons as draft status (never auto-published)", () => {
    const { lessons } = planToCourseDraft(plan, genQuestions);
    for (const l of lessons) expect(l.status).toBe("draft");
  });
});

describe("generatedQuestionId", () => {
  it("follows the q-gen-<slug>-<n> scheme", () => {
    expect(generatedQuestionId("steady-state", 1)).toBe("q-gen-steady-state-1");
  });
});

// --- helpers -------------------------------------------------------------
function makeQ(id: string, conceptSlug: string, difficulty: 1 | 2 | 3 | 4 | 5): McSingleQuestion {
  return {
    id,
    conceptSlug,
    type: "mc_single",
    stem: `Q ${id}`,
    difficulty,
    expectedSeconds: 40,
    transferDistance: 0,
    provenance: "ai_approved",
    hint: "",
    citationIds: [],
    options: [
      { id: "a", text: "right" },
      { id: "b", text: "wrong" },
    ],
    answerKey: { correctOptionId: "a" },
  };
}

describe("compiled lessons are consistent with the deterministic scorer", () => {
  it("a resolved guided question scores through engine/scoring", () => {
    const q = makeQ("q-gen-x-1", "x", 2);
    expect(scoreAnswer(q, { type: "mc_single", optionId: "a" }).correct).toBe(true);
  });
});

describe("estimateCompileSeconds — honest, monotonic compile-time estimate", () => {
  it("more material never estimates a shorter wait", () => {
    const small = estimateCompileSeconds(2_000, 3);
    const big = estimateCompileSeconds(200_000, 60);
    expect(big.lowSeconds).toBeGreaterThan(small.lowSeconds);
    expect(big.highSeconds).toBeGreaterThan(small.highSeconds);
  });
  it("low ≤ high, and both stay positive even for empty input", () => {
    const zero = estimateCompileSeconds(0, 0);
    expect(zero.lowSeconds).toBeGreaterThan(0);
    expect(zero.highSeconds).toBeGreaterThanOrEqual(zero.lowSeconds);
    const neg = estimateCompileSeconds(-100, -5);
    expect(neg.lowSeconds).toBeGreaterThan(0);
  });
  it("a big corpus lands in the minutes, not seconds", () => {
    const est = estimateCompileSeconds(240_000, 80);
    expect(est.highSeconds).toBeGreaterThan(120);
  });
});

describe("formatCompileEstimate — friendly range for the UI", () => {
  it("renders sub-90s waits in seconds", () => {
    expect(formatCompileEstimate({ lowSeconds: 20, highSeconds: 45 })).toMatch(/second/);
  });
  it("renders multi-minute waits in minutes", () => {
    const s = formatCompileEstimate({ lowSeconds: 150, highSeconds: 360 });
    expect(s).toMatch(/minute/);
    expect(s).toContain("about");
  });
  it("collapses an equal range to a single value", () => {
    expect(formatCompileEstimate({ lowSeconds: 30, highSeconds: 30 })).toBe("about 30 seconds");
  });
});
