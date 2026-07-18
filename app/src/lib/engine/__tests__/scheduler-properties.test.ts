/**
 * Property-based tests for the deterministic review scheduler (Phase 6 exit
 * criterion, docs/06-roadmap.md: "property tests green; review reasons rendered;
 * plan respects no-study days"; test pyramid "Property" row, docs/05-testing-strategy.md §2).
 *
 * These complement — never replace — the example-based cases in
 * `mastery-scheduler.test.ts`. fast-check explores a randomized-but-seeded input
 * space; runs are deterministic given fast-check's default seed, so the SUITE
 * stays reproducible even though each individual case is generated. Every
 * `fc.assert` is pinned to a bounded `numRuns` to keep the suite fast.
 *
 * The scheduler exposes no `markReviewed`; the spaced-repetition interval
 * invariant lives entirely in `nextIntervalDays`, and the no-study / exam
 * mechanisms live in `buildReviewQueue`. The properties below target the real
 * API shapes, verified against the implementation rather than assumed.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildReviewQueue, dueNow, isoDate, nextIntervalDays } from "../scheduler";
import { concepts } from "../../../content/econ13210";
import type { MasteryState, StudyPlanInput } from "../types";

const NOW = "2026-07-16T09:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const DAY = 86_400_000;

const dayISO = (n: number) => new Date(NOW_MS + n * DAY).toISOString();
const dayDate = (n: number) => isoDate(NOW_MS + n * DAY);

// ---------------------------------------------------------------------------
// Arbitraries — all bounded to values the real system can actually produce.
// ---------------------------------------------------------------------------

/** any mastery estimate is a probability in [0,1] */
const unit = fc.double({ min: 0, max: 1, noNaN: true });

const MISCONCEPTION_POOL = ["steady-state-max-output", "depreciation-vs-saving", "growth-vs-level"];

function arbMasteryState(slug: string): fc.Arbitrary<MasteryState> {
  return fc
    .record({
      conceptual: unit,
      procedural: unit,
      graphInterpretation: unit,
      formulaRecall: unit,
      transfer: unit,
      confidence: unit,
      retentionStrength: unit,
      misc: fc.dictionary(fc.constantFrom(...MISCONCEPTION_POOL), unit, { maxKeys: 3 }),
      // studied in the past 40 days; evidenceCount >= 1 so it belongs to Review
      lastOffset: fc.integer({ min: -40, max: 0 }),
      evidenceCount: fc.integer({ min: 1, max: 30 }),
    })
    .map(
      (r): MasteryState => ({
        conceptSlug: slug,
        conceptual: r.conceptual,
        procedural: r.procedural,
        graphInterpretation: r.graphInterpretation,
        formulaRecall: r.formulaRecall,
        transfer: r.transfer,
        confidence: r.confidence,
        retentionStrength: r.retentionStrength,
        misconceptionProbability: r.misc,
        lastEvidenceAt: dayISO(r.lastOffset),
        evidenceCount: r.evidenceCount,
      })
    );
}

const arbMasteryMap = fc.record(
  Object.fromEntries(concepts.map((c) => [c.slug, arbMasteryState(c.slug)]))
) as fc.Arbitrary<Record<string, MasteryState>>;

const arbPrevIntervals = fc.record(
  Object.fromEntries(concepts.map((c) => [c.slug, fc.integer({ min: 1, max: 300 })]))
) as fc.Arbitrary<Record<string, number>>;

/** a bounded, scattered set of no-study days (never 30 consecutive) */
const arbNoStudyDays = fc
  .array(fc.integer({ min: -2, max: 45 }), { maxLength: 8 })
  .map((offs) => Array.from(new Set(offs.map(dayDate))));

/** plan with a randomly-present exam date */
const arbPlan: fc.Arbitrary<StudyPlanInput> = fc
  .record({
    examOffset: fc.option(fc.integer({ min: 0, max: 45 }), { nil: null }),
    minutesPerDay: fc.integer({ min: 1, max: 180 }),
    noStudyDays: arbNoStudyDays,
  })
  .map((r) => ({
    examDateISO: r.examOffset === null ? null : dayISO(r.examOffset),
    minutesPerDay: r.minutesPerDay,
    noStudyDays: r.noStudyDays,
  }));

/**
 * Exam scenario that deliberately, sometimes, blocks the day before the exam
 * and/or the exam day itself — the exact situation that can push an examinable
 * review past the deadline. This is what surfaces the back-planning/no-study bug.
 */
const arbExamScenario = fc
  .record({
    examOffset: fc.integer({ min: 0, max: 20 }),
    extra: fc.array(fc.integer({ min: -2, max: 25 }), { maxLength: 6 }),
    blockPre: fc.boolean(),
    blockDay: fc.boolean(),
  })
  .map((r) => {
    const offs = [...r.extra];
    if (r.blockPre) offs.push(r.examOffset - 1);
    if (r.blockDay) offs.push(r.examOffset);
    return {
      examISO: dayISO(r.examOffset),
      examMs: NOW_MS + r.examOffset * DAY,
      noStudyDays: Array.from(new Set(offs.map(dayDate))),
    };
  });

const conceptBySlug = new Map(concepts.map((c) => [c.slug, c] as const));

describe("scheduler properties (Phase 6): fast-check invariants over randomized inputs", () => {
  // -------------------------------------------------------------------------
  // 1. Determinism
  // -------------------------------------------------------------------------
  it("buildReviewQueue is deterministic — identical inputs give byte-identical output", () => {
    fc.assert(
      fc.property(arbMasteryMap, arbPrevIntervals, arbPlan, (mastery, prevIntervals, plan) => {
        const ctx = { nowISO: NOW, concepts, mastery, prevIntervals, plan };
        const a = JSON.stringify(buildReviewQueue(ctx));
        const b = JSON.stringify(buildReviewQueue(ctx));
        expect(a).toBe(b);
      }),
      { numRuns: 200 }
    );
  });

  it("buildReviewQueue does not depend on object key iteration order", () => {
    // Rebuild the mastery map (and each misconception map) with keys inserted in
    // reverse order. A scheduler that leaked key-iteration order into its result
    // would diverge here; a value-driven one must not.
    const shuffle = (mastery: Record<string, MasteryState>): Record<string, MasteryState> => {
      const out: Record<string, MasteryState> = {};
      for (const slug of Object.keys(mastery).reverse()) {
        const s = mastery[slug];
        const misc: Record<string, number> = {};
        for (const k of Object.keys(s.misconceptionProbability).reverse()) {
          misc[k] = s.misconceptionProbability[k];
        }
        out[slug] = { ...s, misconceptionProbability: misc };
      }
      return out;
    };
    fc.assert(
      fc.property(arbMasteryMap, arbPrevIntervals, arbPlan, (mastery, prevIntervals, plan) => {
        const base = buildReviewQueue({ nowISO: NOW, concepts, mastery, prevIntervals, plan });
        const shuffled = buildReviewQueue({
          nowISO: NOW,
          concepts,
          mastery: shuffle(mastery),
          prevIntervals,
          plan,
        });
        expect(JSON.stringify(shuffled)).toBe(JSON.stringify(base));
      }),
      { numRuns: 150 }
    );
  });

  // -------------------------------------------------------------------------
  // 2. No-study-day respect (IDEA-119)
  // -------------------------------------------------------------------------
  it("no review is ever scheduled ON a no-study day", () => {
    fc.assert(
      fc.property(arbMasteryMap, arbPrevIntervals, arbNoStudyDays, (mastery, prevIntervals, noStudyDays) => {
        const plan: StudyPlanInput = { examDateISO: null, minutesPerDay: 30, noStudyDays };
        const queue = buildReviewQueue({ nowISO: NOW, concepts, mastery, prevIntervals, plan });
        for (const item of queue) {
          expect(noStudyDays).not.toContain(isoDate(Date.parse(item.dueAt)));
        }
      }),
      { numRuns: 200 }
    );
  });

  // -------------------------------------------------------------------------
  // 3. Interval growth on success (real invariant of nextIntervalDays)
  //
  // The code's spaced-repetition rule: strong/adequate recall (retention >= 0.35)
  // never shrinks the interval; only forgetting evidence (retention < 0.35)
  // resets it to 1 ("relearn tomorrow"). That reset is the intended, documented
  // exception — not a monotonicity violation — so we test both halves explicitly.
  // -------------------------------------------------------------------------
  it("nextIntervalDays never shrinks the interval when recall succeeds (retention >= 0.35)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 400 }),
        fc.double({ min: 0.35, max: 1, noNaN: true }),
        (prev, retention) => {
          expect(nextIntervalDays(prev, retention)).toBeGreaterThanOrEqual(prev);
        }
      ),
      { numRuns: 300 }
    );
  });

  it("nextIntervalDays resets to 1 only on forgetting evidence (retention < 0.35)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 400 }),
        fc.double({ min: 0, max: 0.35, maxExcluded: true, noNaN: true }),
        (prev, retention) => {
          expect(nextIntervalDays(prev, retention)).toBe(1);
        }
      ),
      { numRuns: 200 }
    );
  });

  // -------------------------------------------------------------------------
  // 4. Review reasons are always non-empty, learner-readable strings (§22)
  // -------------------------------------------------------------------------
  it("every review reason is a non-empty learner-readable string, free of internal jargon", () => {
    const FORBIDDEN = ["undefined", "NaN", "[object Object]", "null"];
    fc.assert(
      fc.property(arbMasteryMap, arbPrevIntervals, arbPlan, (mastery, prevIntervals, plan) => {
        const queue = buildReviewQueue({ nowISO: NOW, concepts, mastery, prevIntervals, plan });
        // Also exercise the overdue-catch-up reason wording by asking "now" to be
        // far in the future, forcing the overdue branch of dueNow.
        const overdue = dueNow(queue, dayISO(60));
        for (const item of [...queue, ...overdue]) {
          expect(typeof item.reasonText).toBe("string");
          expect(item.reasonText.trim().length).toBeGreaterThan(0);
          expect(item.reasonText).toMatch(/You're seeing this because/);
          for (const bad of FORBIDDEN) {
            expect(item.reasonText).not.toContain(bad);
          }
          expect(item.reasonCode).toBeTruthy();
        }
      }),
      { numRuns: 200 }
    );
  });

  // -------------------------------------------------------------------------
  // 5. No negative or nonsensical intervals
  // -------------------------------------------------------------------------
  it("every scheduled intervalDays is a positive finite integer", () => {
    fc.assert(
      fc.property(arbMasteryMap, arbPrevIntervals, arbPlan, (mastery, prevIntervals, plan) => {
        const queue = buildReviewQueue({ nowISO: NOW, concepts, mastery, prevIntervals, plan });
        for (const item of queue) {
          expect(Number.isFinite(item.intervalDays)).toBe(true);
          expect(Number.isInteger(item.intervalDays)).toBe(true);
          expect(item.intervalDays).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("every dueAt is a valid, parseable ISO timestamp", () => {
    fc.assert(
      fc.property(arbMasteryMap, arbPrevIntervals, arbPlan, (mastery, prevIntervals, plan) => {
        const queue = buildReviewQueue({ nowISO: NOW, concepts, mastery, prevIntervals, plan });
        for (const item of queue) {
          expect(Number.isFinite(Date.parse(item.dueAt))).toBe(true);
        }
      }),
      { numRuns: 150 }
    );
  });

  // -------------------------------------------------------------------------
  // 6. Exam back-planning stays before the exam (IDEA-110)
  //
  // Regression guard: before the fix in scheduler.ts, a no-study day at/just
  // before the exam could push an examinable review PAST the exam, because the
  // no-study skip only moves forward. This property fails on the pre-fix code
  // and passes once the backward-walk guard is in place.
  // -------------------------------------------------------------------------
  it("no examinable review is ever scheduled strictly after the exam date", () => {
    fc.assert(
      fc.property(arbMasteryMap, arbPrevIntervals, arbExamScenario, (mastery, prevIntervals, scenario) => {
        const plan: StudyPlanInput = {
          examDateISO: scenario.examISO,
          minutesPerDay: 30,
          noStudyDays: scenario.noStudyDays,
        };
        const queue = buildReviewQueue({ nowISO: NOW, concepts, mastery, prevIntervals, plan });
        for (const item of queue) {
          if (conceptBySlug.get(item.conceptSlug)?.examinable) {
            expect(Date.parse(item.dueAt)).toBeLessThanOrEqual(scenario.examMs);
          }
        }
      }),
      { numRuns: 300 }
    );
  });
});
