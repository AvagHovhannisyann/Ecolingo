import { describe, expect, it } from "vitest";
import { applyEvidence, dominantMisconception, initialMastery, retentionAt } from "../mastery";
import { buildReviewQueue, dueNow, isoDate, nextIntervalDays, planToday } from "../scheduler";
import { concepts } from "../../../content/econ13210";
import type { EvidenceEvent, MasteryState } from "../types";

const NOW = "2026-07-16T09:00:00.000Z";

function ev(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    at: NOW,
    conceptSlug: "steady-state",
    questionType: "mc_single",
    correct: true,
    difficulty: 3,
    hintsUsed: 0,
    timeMs: 25_000,
    expectedSeconds: 30,
    confidence: 3,
    attemptNo: 1,
    transferDistance: 0,
    misconceptionSlugs: [],
    ...overrides,
  };
}

describe("mastery model (§22): multi-dimensional, evidence-weighted, auditable", () => {
  it("correct evidence raises only the dimensions the question measures", () => {
    const m0 = initialMastery("steady-state");
    const { state, audit } = applyEvidence(m0, ev());
    expect(state.conceptual).toBeGreaterThan(m0.conceptual);
    expect(state.procedural).toBe(m0.procedural); // MC doesn't prove procedure
    expect(state.formulaRecall).toBe(m0.formulaRecall);
    expect(audit.evidence).toBeDefined(); // GATE-006: update carries evidence
    expect(Object.keys(audit.dimensionDeltas).length).toBeGreaterThan(0);
  });

  it("hints and repeat attempts discount the update (signal quality)", () => {
    const m0 = initialMastery("steady-state");
    const clean = applyEvidence(m0, ev()).state.conceptual;
    const hinted = applyEvidence(m0, ev({ hintsUsed: 2 })).state.conceptual;
    const retried = applyEvidence(m0, ev({ attemptNo: 3 })).state.conceptual;
    expect(hinted).toBeLessThan(clean);
    expect(retried).toBeLessThan(clean);
  });

  it("fast correct multiple-choice is discounted as possible guessing", () => {
    const m0 = initialMastery("steady-state");
    const normal = applyEvidence(m0, ev()).state.conceptual;
    const suspiciouslyFast = applyEvidence(m0, ev({ timeMs: 2_000 })).state.conceptual;
    expect(suspiciouslyFast).toBeLessThan(normal);
  });

  it("transfer moves only on transfer-distance evidence", () => {
    const m0 = initialMastery("steady-state");
    expect(applyEvidence(m0, ev()).state.transfer).toBe(m0.transfer);
    expect(applyEvidence(m0, ev({ transferDistance: 1 })).state.transfer).toBeGreaterThan(m0.transfer);
  });

  it("misconception evidence raises its probability; later correct answers decay it", () => {
    const m0 = initialMastery("steady-state");
    const withMc = applyEvidence(m0, ev({ correct: false, misconceptionSlugs: ["steady-state-max-output"] })).state;
    expect(withMc.misconceptionProbability["steady-state-max-output"]).toBeGreaterThan(0.3);
    expect(dominantMisconception(withMc)?.slug).toBe("steady-state-max-output");
    let m = withMc;
    for (let i = 0; i < 5; i++) m = applyEvidence(m, ev()).state;
    expect(m.misconceptionProbability["steady-state-max-output"]).toBeLessThan(0.3);
  });

  it("estimates stay in [0,1] under long streaks either way", () => {
    let m = initialMastery("steady-state");
    for (let i = 0; i < 50; i++) m = applyEvidence(m, ev({ difficulty: 5 })).state;
    expect(m.conceptual).toBeLessThanOrEqual(1);
    for (let i = 0; i < 50; i++) m = applyEvidence(m, ev({ correct: false })).state;
    expect(m.conceptual).toBeGreaterThanOrEqual(0);
  });

  it("retention decays over time and decays slower for stronger memories", () => {
    const m = { ...initialMastery("steady-state"), retentionStrength: 0.8, lastEvidenceAt: NOW };
    const weak = { ...m, retentionStrength: 0.4 };
    const later = "2026-07-26T09:00:00.000Z";
    expect(retentionAt(m, later)).toBeLessThan(0.8);
    expect(retentionAt(weak, later) / 0.4).toBeLessThan(retentionAt(m, later) / 0.8);
  });

  it("refuses cross-concept evidence", () => {
    expect(() => applyEvidence(initialMastery("golden-rule"), ev())).toThrow(/applied to state/);
  });
});

describe("deterministic scheduler (§20.7) with explainable reasons", () => {
  function masteryFor(slugs: string[], overrides: Partial<MasteryState> = {}): Record<string, MasteryState> {
    const out: Record<string, MasteryState> = {};
    for (const slug of slugs) {
      out[slug] = {
        ...initialMastery(slug),
        evidenceCount: 3,
        retentionStrength: 0.7,
        lastEvidenceAt: NOW,
        ...overrides,
        conceptSlug: slug,
      };
    }
    return out;
  }

  it("intervals expand on strong retention and contract on weak", () => {
    expect(nextIntervalDays(4, 0.9)).toBeGreaterThan(4);
    expect(nextIntervalDays(4, 0.5)).toBeGreaterThanOrEqual(4);
    expect(nextIntervalDays(4, 0.2)).toBe(1);
  });

  it("every queued item carries a learner-readable reason (§22)", () => {
    const queue = buildReviewQueue({
      nowISO: NOW,
      concepts,
      mastery: masteryFor(["steady-state", "fundamental-equation"]),
      prevIntervals: {},
      plan: { examDateISO: null, minutesPerDay: 20, noStudyDays: [] },
    });
    expect(queue.length).toBe(2);
    for (const item of queue) {
      expect(item.reasonText).toMatch(/You're seeing this because/);
      expect(item.reasonCode).toBeTruthy();
    }
  });

  it("active misconception pulls review to tomorrow", () => {
    const mastery = masteryFor(["steady-state"]);
    mastery["steady-state"].misconceptionProbability = { "steady-state-max-output": 0.6 };
    const [item] = buildReviewQueue({
      nowISO: NOW,
      concepts: concepts.filter((c) => c.slug === "steady-state"),
      mastery,
      prevIntervals: { "steady-state": 8 },
      plan: { examDateISO: null, minutesPerDay: 20, noStudyDays: [] },
    });
    expect(item.reasonCode).toBe("misconception_active");
    expect(item.intervalDays).toBe(1);
  });

  it("exam back-planning pulls examinable concepts inside the exam window (IDEA-110)", () => {
    const mastery = masteryFor(["steady-state"], { retentionStrength: 0.95 });
    const [item] = buildReviewQueue({
      nowISO: NOW,
      concepts: concepts.filter((c) => c.slug === "steady-state"),
      mastery,
      prevIntervals: { "steady-state": 30 }, // would otherwise be far out
      plan: { examDateISO: "2026-07-20T09:00:00.000Z", minutesPerDay: 20, noStudyDays: [] },
    });
    expect(item.reasonCode).toBe("exam_priority");
    expect(Date.parse(item.dueAt)).toBeLessThan(Date.parse("2026-07-20T09:00:00.000Z"));
    expect(item.reasonText).toMatch(/exam is in \d+ day/);
  });

  it("respects no-study days (IDEA-119)", () => {
    const mastery = masteryFor(["steady-state"], { retentionStrength: 0.2 });
    const tomorrow = isoDate(Date.parse(NOW) + 86_400_000);
    const [item] = buildReviewQueue({
      nowISO: NOW,
      concepts: concepts.filter((c) => c.slug === "steady-state"),
      mastery,
      prevIntervals: { "steady-state": 1 },
      plan: { examDateISO: null, minutesPerDay: 20, noStudyDays: [tomorrow] },
    });
    expect(isoDate(Date.parse(item.dueAt))).not.toBe(tomorrow);
  });

  it("overdue items become no-penalty catch-up items (IDEA-112)", () => {
    const queue = [
      {
        conceptSlug: "steady-state",
        dueAt: "2026-07-13T09:00:00.000Z",
        intervalDays: 2,
        reasonCode: "retention_falling" as const,
        reasonText: "You're seeing this because your retention estimate is falling.",
      },
    ];
    const due = dueNow(queue, NOW);
    expect(due[0].overdue).toBe(true);
    expect(due[0].reasonCode).toBe("overdue_catchup");
    expect(due[0].reasonText).toMatch(/no penalty/);
  });

  it("daily plan respects the minute budget (IDEA-111)", () => {
    const due = Array.from({ length: 10 }, (_, i) => ({
      conceptSlug: `c${i}`,
      dueAt: NOW,
      intervalDays: 1,
      reasonCode: "retention_falling" as const,
      reasonText: "You're seeing this because…",
    }));
    const plan = planToday(due, [{ id: "lesson", estimatedMinutes: 12 }], 15);
    expect(plan.minutesPlanned).toBeLessThanOrEqual(15);
    expect(plan.reviews.length).toBe(5); // 5×3min, no room for the 12-min lesson
    expect(plan.lessons.length).toBe(0);
  });

  it("never-studied concepts are not scheduled for review", () => {
    const queue = buildReviewQueue({
      nowISO: NOW,
      concepts,
      mastery: {},
      prevIntervals: {},
      plan: { examDateISO: null, minutesPerDay: 20, noStudyDays: [] },
    });
    expect(queue).toEqual([]);
  });
});
