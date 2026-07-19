/**
 * XP and leveling engine tests (D-020, IDEA-121/123). Exhaustive example-based
 * coverage of the award table and level curve, plus fast-check property
 * tests pinned to the invariants the module docstring in `../xp.ts` promises:
 * monotonicity of `levelForXp`, exact inverse consistency with `xpForLevel`,
 * `levelProgress().fraction` always landing in [0, 1), and every award being
 * non-negative. Mirrors the property-test idiom in `scheduler-properties.test.ts`
 * (bounded `numRuns`, arbitraries restricted to values the real system can
 * produce, no reliance on fast-check's own RNG seed for reproducibility).
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  LEVEL_XP_STEP,
  XP_LESSON_COMPLETE_BONUS,
  XP_QUESTION_CORRECT_PER_DIFFICULTY,
  XP_REVIEW_COMPLETE,
  XP_STEP_COMPLETE,
  XP_STREAK_DAY_BONUS,
  awardXp,
  levelForXp,
  levelProgress,
  titleForLevel,
  xpForEvent,
  xpForLevel,
  type XpEvent,
} from "../xp";

// ---------------------------------------------------------------------------
// Award constants
// ---------------------------------------------------------------------------

describe("XP award constants (IDEA-121)", () => {
  it("are all positive integers", () => {
    for (const c of [
      XP_STEP_COMPLETE,
      XP_QUESTION_CORRECT_PER_DIFFICULTY,
      XP_LESSON_COMPLETE_BONUS,
      XP_REVIEW_COMPLETE,
      XP_STREAK_DAY_BONUS,
      LEVEL_XP_STEP,
    ]) {
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThan(0);
    }
  });

  it("streak bonus sits strictly between a review and a full lesson (documented rationale)", () => {
    expect(XP_STREAK_DAY_BONUS).toBeGreaterThan(XP_REVIEW_COMPLETE);
    expect(XP_STREAK_DAY_BONUS).toBeLessThan(XP_LESSON_COMPLETE_BONUS);
  });

  it("a lesson-complete bonus alone reaches level 2 — 'level 2 within one lesson' holds unconditionally", () => {
    // This is the load-bearing guarantee behind the docstring's claim: it
    // doesn't depend on how many steps or questions a particular lesson has,
    // only on the bonus itself clearing the level-2 threshold.
    expect(XP_LESSON_COMPLETE_BONUS).toBeGreaterThanOrEqual(xpForLevel(2));
    expect(levelForXp(XP_LESSON_COMPLETE_BONUS)).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// xpForEvent / awardXp
// ---------------------------------------------------------------------------

describe("xpForEvent", () => {
  it("awards XP_STEP_COMPLETE for a step_complete event", () => {
    expect(xpForEvent({ type: "step_complete" })).toBe(XP_STEP_COMPLETE);
  });

  it("scales question_correct linearly with difficulty 1-5", () => {
    for (const difficulty of [1, 2, 3, 4, 5] as const) {
      expect(xpForEvent({ type: "question_correct", difficulty })).toBe(
        XP_QUESTION_CORRECT_PER_DIFFICULTY * difficulty
      );
    }
    // explicit table, so a silent formula change is caught immediately
    expect(xpForEvent({ type: "question_correct", difficulty: 1 })).toBe(2);
    expect(xpForEvent({ type: "question_correct", difficulty: 2 })).toBe(4);
    expect(xpForEvent({ type: "question_correct", difficulty: 3 })).toBe(6);
    expect(xpForEvent({ type: "question_correct", difficulty: 4 })).toBe(8);
    expect(xpForEvent({ type: "question_correct", difficulty: 5 })).toBe(10);
  });

  it("awards XP_LESSON_COMPLETE_BONUS for lesson_complete", () => {
    expect(xpForEvent({ type: "lesson_complete" })).toBe(XP_LESSON_COMPLETE_BONUS);
  });

  it("awards XP_REVIEW_COMPLETE for review_complete", () => {
    expect(xpForEvent({ type: "review_complete" })).toBe(XP_REVIEW_COMPLETE);
  });

  it("awards XP_STREAK_DAY_BONUS for streak_day", () => {
    expect(xpForEvent({ type: "streak_day" })).toBe(XP_STREAK_DAY_BONUS);
  });

  it("clamps out-of-range difficulty defensively instead of producing nonsense XP", () => {
    // The type system pins difficulty to 1|2|3|4|5, but callers deserializing
    // untrusted data (e.g. from storage) could hand back something else at
    // runtime; the engine must not silently mint negative or huge XP.
    const tooLow = { type: "question_correct", difficulty: 0 } as unknown as XpEvent;
    const tooHigh = { type: "question_correct", difficulty: 9 } as unknown as XpEvent;
    const fractional = { type: "question_correct", difficulty: 2.6 } as unknown as XpEvent;
    expect(xpForEvent(tooLow)).toBe(XP_QUESTION_CORRECT_PER_DIFFICULTY * 1);
    expect(xpForEvent(tooHigh)).toBe(XP_QUESTION_CORRECT_PER_DIFFICULTY * 5);
    expect(xpForEvent(fractional)).toBe(XP_QUESTION_CORRECT_PER_DIFFICULTY * 3); // rounds to nearest
  });
});

describe("awardXp", () => {
  it("is 0 for an empty event list", () => {
    expect(awardXp([])).toBe(0);
  });

  it("sums a mixed batch of events deterministically", () => {
    const events: XpEvent[] = [
      { type: "step_complete" },
      { type: "step_complete" },
      { type: "question_correct", difficulty: 3 },
      { type: "lesson_complete" },
      { type: "review_complete" },
      { type: "streak_day" },
    ];
    const expected =
      2 * XP_STEP_COMPLETE +
      XP_QUESTION_CORRECT_PER_DIFFICULTY * 3 +
      XP_LESSON_COMPLETE_BONUS +
      XP_REVIEW_COMPLETE +
      XP_STREAK_DAY_BONUS;
    expect(awardXp(events)).toBe(expected);
    // calling again with the same input gives byte-identical output
    expect(awardXp(events)).toBe(awardXp(events));
  });

  it("models a realistic single lesson: five steps plus a correct mastery check plus completion", () => {
    const lessonEvents: XpEvent[] = [
      { type: "step_complete" }, // core_idea
      { type: "step_complete" }, // intuition
      { type: "step_complete" }, // visual
      { type: "step_complete" }, // math
      { type: "step_complete" }, // guided
      { type: "question_correct", difficulty: 2 }, // mastery_check
      { type: "lesson_complete" },
    ];
    const total = awardXp(lessonEvents);
    expect(total).toBe(5 * XP_STEP_COMPLETE + XP_QUESTION_CORRECT_PER_DIFFICULTY * 2 + XP_LESSON_COMPLETE_BONUS);
    expect(levelForXp(total)).toBeGreaterThanOrEqual(2);
  });

  it("never rewards an incorrect answer — there is no XpEvent variant for it (IDEA-132)", () => {
    // Structural proof, not a runtime branch: the only question-related event
    // is question_correct. A caller with a wrong answer has nothing to award.
    const events: XpEvent[] = [{ type: "step_complete" }];
    expect(awardXp(events)).toBe(XP_STEP_COMPLETE);
  });
});

// ---------------------------------------------------------------------------
// Level curve
// ---------------------------------------------------------------------------

describe("xpForLevel (triangular curve)", () => {
  it("level 1 costs 0 XP", () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it("matches the documented closed form for a spread of levels", () => {
    const table: [number, number][] = [
      [1, 0],
      [2, 10],
      [3, 30],
      [4, 60],
      [5, 100],
      [10, 450],
      [20, 1900],
      [50, 12250],
      [100, 49500],
    ];
    for (const [level, xp] of table) {
      expect(xpForLevel(level)).toBe((LEVEL_XP_STEP * (level - 1) * level) / 2);
      expect(xpForLevel(level)).toBe(xp);
    }
  });

  it("is strictly increasing", () => {
    let prev = xpForLevel(1);
    for (let level = 2; level <= 200; level++) {
      const next = xpForLevel(level);
      expect(next).toBeGreaterThan(prev);
      prev = next;
    }
  });

  it("grows quadratically, not exponentially: doubling the level roughly quadruples the cost", () => {
    const ratio = xpForLevel(100) / xpForLevel(50);
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
  });

  it("clamps sub-1 or fractional input to a valid level instead of throwing", () => {
    expect(xpForLevel(0)).toBe(xpForLevel(1));
    expect(xpForLevel(-5)).toBe(xpForLevel(1));
    expect(xpForLevel(3.9)).toBe(xpForLevel(3));
  });
});

describe("levelForXp (inverse of the curve)", () => {
  it("0 XP is level 1", () => {
    expect(levelForXp(0)).toBe(1);
  });

  it("sits exactly on each level's threshold", () => {
    for (const level of [2, 3, 5, 10, 20, 50, 100]) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
    }
  });

  it("one XP short of a threshold is still the previous level", () => {
    for (const level of [2, 3, 5, 10, 20, 50, 100]) {
      expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
  });

  it("one XP past a threshold has not yet reached the next level", () => {
    for (const level of [1, 2, 3, 5, 10, 20]) {
      expect(levelForXp(xpForLevel(level) + 1)).toBe(level);
    }
  });

  it("clamps negative, NaN, and non-finite input to level 1 instead of throwing", () => {
    expect(levelForXp(-100)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
    expect(levelForXp(Number.POSITIVE_INFINITY)).toBe(1);
    expect(levelForXp(Number.NEGATIVE_INFINITY)).toBe(1);
  });

  it("is non-decreasing across a dense sweep of XP values", () => {
    let prevLevel = levelForXp(0);
    for (let xp = 0; xp <= 5000; xp += 7) {
      const level = levelForXp(xp);
      expect(level).toBeGreaterThanOrEqual(prevLevel);
      prevLevel = level;
    }
  });
});

describe("levelProgress", () => {
  it("reports fraction 0 exactly at a level threshold", () => {
    for (const level of [1, 2, 5, 10]) {
      const p = levelProgress(xpForLevel(level));
      expect(p.level).toBe(level);
      expect(p.intoLevel).toBe(0);
      expect(p.fraction).toBe(0);
    }
  });

  it("neededForNext equals the exact gap between consecutive thresholds", () => {
    for (const level of [1, 2, 5, 10, 50]) {
      const p = levelProgress(xpForLevel(level));
      expect(p.neededForNext).toBe(xpForLevel(level + 1) - xpForLevel(level));
      expect(p.neededForNext).toBe(LEVEL_XP_STEP * level); // documented closed form
    }
  });

  it("intoLevel and fraction advance consistently mid-level", () => {
    const base = xpForLevel(5);
    const gap = xpForLevel(6) - base;
    const midXp = base + Math.floor(gap / 2);
    const p = levelProgress(midXp);
    expect(p.level).toBe(5);
    expect(p.intoLevel).toBe(midXp - base);
    expect(p.fraction).toBeCloseTo(p.intoLevel / gap, 10);
  });

  it("never reaches fraction 1, even one XP below the next threshold", () => {
    const justBelow = xpForLevel(6) - 1;
    const p = levelProgress(justBelow);
    expect(p.level).toBe(5);
    expect(p.fraction).toBeLessThan(1);
    expect(p.fraction).toBeGreaterThan(0);
  });

  it("handles 0 XP without throwing", () => {
    const p = levelProgress(0);
    expect(p).toEqual({ level: 1, intoLevel: 0, neededForNext: LEVEL_XP_STEP, fraction: 0 });
  });
});

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

describe("titleForLevel", () => {
  it("returns the two named anchor titles at the levels that introduce them", () => {
    expect(titleForLevel(1)).toBe("Curious Consumer");
    expect(titleForLevel(3)).toBe("Apprentice Optimizer");
    expect(titleForLevel(75)).toBe("Golden-Rule Sage");
  });

  it("is non-decreasing in prestige across the whole 1-200 range and yields at least 10 distinct titles", () => {
    const seen = new Set<string>();
    let prevTitle = titleForLevel(1);
    let changes = 0;
    for (let level = 1; level <= 200; level++) {
      const title = titleForLevel(level);
      seen.add(title);
      if (title !== prevTitle) {
        changes += 1;
        prevTitle = title;
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(10);
    // titles must only ever advance forward as level increases, never regress
    expect(changes).toBe(seen.size - 1);
  });

  it("is a total function: never throws, always returns a non-empty string", () => {
    const edgeCases = [
      0,
      -1,
      -1000,
      1.9,
      2.999999,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.MAX_SAFE_INTEGER,
    ];
    for (const level of edgeCases) {
      expect(() => titleForLevel(level)).not.toThrow();
      const title = titleForLevel(level);
      expect(typeof title).toBe("string");
      expect(title.length).toBeGreaterThan(0);
    }
  });

  it("+Infinity resolves to the top-ranked title, not the bottom one", () => {
    expect(titleForLevel(Number.POSITIVE_INFINITY)).toBe(titleForLevel(Number.MAX_SAFE_INTEGER));
  });

  it("fractional levels use the same title as their floor", () => {
    for (const level of [1, 3, 5, 8, 24.7, 49.999]) {
      expect(titleForLevel(level)).toBe(titleForLevel(Math.floor(level)));
    }
  });
});

// ---------------------------------------------------------------------------
// Property tests (fast-check) — see module docstring in ../xp.ts for the
// invariants these are pinned to.
// ---------------------------------------------------------------------------

const arbDifficulty = fc.constantFrom(1, 2, 3, 4, 5) as fc.Arbitrary<1 | 2 | 3 | 4 | 5>;

const arbXpEvent: fc.Arbitrary<XpEvent> = fc.oneof(
  fc.constant<XpEvent>({ type: "step_complete" }),
  arbDifficulty.map((difficulty): XpEvent => ({ type: "question_correct", difficulty })),
  fc.constant<XpEvent>({ type: "lesson_complete" }),
  fc.constant<XpEvent>({ type: "review_complete" }),
  fc.constant<XpEvent>({ type: "streak_day" })
);

const arbXpEvents = fc.array(arbXpEvent, { maxLength: 200 });

/** Any XP total the engine could plausibly be asked about: non-negative,
 *  bounded well above any level a real learner could reach, and including
 *  both integers (the only values awardXp actually produces) and doubles
 *  (defensive coverage — callers could hand back a persisted float). */
const arbXp = fc.oneof(
  fc.integer({ min: 0, max: 2_000_000 }),
  fc.double({ min: 0, max: 2_000_000, noNaN: true })
);

describe("property: awards are always non-negative", () => {
  it("xpForEvent never returns a negative number for any valid event", () => {
    fc.assert(
      fc.property(arbXpEvent, (event) => {
        expect(xpForEvent(event)).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 200 }
    );
  });

  it("awardXp never returns a negative number for any batch of events", () => {
    fc.assert(
      fc.property(arbXpEvents, (events) => {
        expect(awardXp(events)).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 300 }
    );
  });

  it("awardXp is order-independent — shuffling the same events gives the same total", () => {
    fc.assert(
      fc.property(arbXpEvents, fc.integer({ min: 0, max: 2 ** 31 - 1 }), (events, seed) => {
        // deterministic Fisher-Yates using a seeded LCG, so the property
        // itself stays reproducible independent of fast-check's internals
        let state = seed || 1;
        const rand = () => {
          state = (state * 1103515245 + 12345) & 0x7fffffff;
          return state / 0x7fffffff;
        };
        const shuffled = [...events];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        expect(awardXp(shuffled)).toBe(awardXp(events));
      }),
      { numRuns: 150 }
    );
  });
});

describe("property: level curve monotonicity and inverse consistency", () => {
  it("levelForXp is monotonically non-decreasing in xp", () => {
    fc.assert(
      fc.property(arbXp, arbXp, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(levelForXp(lo)).toBeLessThanOrEqual(levelForXp(hi));
      }),
      { numRuns: 300 }
    );
  });

  it("xpForLevel is strictly increasing for level >= 1", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 5000 }),
        (a, b) => {
          fc.pre(a !== b);
          const [lo, hi] = a < b ? [a, b] : [b, a];
          expect(xpForLevel(lo)).toBeLessThan(xpForLevel(hi));
        }
      ),
      { numRuns: 300 }
    );
  });

  it("levelForXp(xpForLevel(n)) === n for every level in the supported range", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (n) => {
        expect(levelForXp(xpForLevel(n))).toBe(n);
      }),
      { numRuns: 500 }
    );
  });

  it("levelForXp never exceeds the level whose threshold it was fed, and never falls short of it", () => {
    // Cross-check against the definition directly, independent of the
    // sqrt-estimate implementation: xpForLevel(level) <= xp < xpForLevel(level+1).
    fc.assert(
      fc.property(arbXp, (xp) => {
        const level = levelForXp(xp);
        expect(xpForLevel(level)).toBeLessThanOrEqual(xp);
        expect(xpForLevel(level + 1)).toBeGreaterThan(xp);
      }),
      { numRuns: 300 }
    );
  });
});

describe("property: levelProgress().fraction is always in [0, 1)", () => {
  it("holds across a wide, randomized sweep of XP totals", () => {
    fc.assert(
      fc.property(arbXp, (xp) => {
        const p = levelProgress(xp);
        expect(p.fraction).toBeGreaterThanOrEqual(0);
        expect(p.fraction).toBeLessThan(1);
        expect(Number.isFinite(p.fraction)).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it("intoLevel is always within [0, neededForNext)", () => {
    fc.assert(
      fc.property(arbXp, (xp) => {
        const p = levelProgress(xp);
        expect(p.intoLevel).toBeGreaterThanOrEqual(0);
        expect(p.intoLevel).toBeLessThan(p.neededForNext);
      }),
      { numRuns: 500 }
    );
  });
});

describe("property: titleForLevel is total over the entire real number line", () => {
  it("never throws and always returns a non-empty string for arbitrary doubles", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ noNaN: false }),
          fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)
        ),
        (level) => {
          expect(() => titleForLevel(level)).not.toThrow();
          expect(titleForLevel(level).length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 300 }
    );
  });
});
