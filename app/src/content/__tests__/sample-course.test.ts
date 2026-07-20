import { describe, it, expect } from "vitest";
import { SAMPLE_ENROLLED_PLAN } from "../sample-course";
import { applyTesterSample, type EnrolledCourseState } from "@/lib/enrolled-course";
import { scoreAnswer } from "@/lib/engine/scoring";

/**
 * The sample course is what a designated tester sees with no enrollment. It
 * must be a fully-formed, PLAYABLE EnrolledPlan: every lesson's question steps
 * must resolve to a real question, every math step to a real equation, and its
 * units must reference only real lessons — otherwise a tester hits a broken
 * path instead of observing the finished experience.
 */
describe("sample course plan", () => {
  const plan = SAMPLE_ENROLLED_PLAN;

  it("is flagged as a sample and has a title, concepts, and lessons", () => {
    expect(plan.isSample).toBe(true);
    expect(plan.courseTitle).toMatch(/sample/i);
    expect(plan.concepts.length).toBeGreaterThan(0);
    expect(plan.lessons.length).toBeGreaterThan(0);
  });

  it("units reference only real lessons and cover every lesson exactly once", () => {
    const lessonIds = new Set(plan.lessons.map((l) => l.id));
    const seen = new Set<string>();
    for (const unit of plan.units) {
      expect(unit.title.trim()).not.toBe("");
      for (const id of unit.lessonIds) {
        expect(lessonIds.has(id)).toBe(true);
        expect(seen.has(id)).toBe(false); // no lesson in two units
        seen.add(id);
      }
    }
    expect(seen.size).toBe(plan.lessons.length); // every lesson placed
  });

  it("every lesson's concept is present in the plan's concepts", () => {
    const slugs = new Set(plan.concepts.map((c) => c.slug));
    for (const lesson of plan.lessons) expect(slugs.has(lesson.conceptSlug)).toBe(true);
  });

  it("every question step resolves to a real question, every math step to a real equation", () => {
    const qById = new Map(plan.questions.map((q) => [q.id, q]));
    const eqById = new Map(plan.equations.map((e) => [e.id, e]));
    for (const lesson of plan.lessons) {
      for (const step of lesson.steps) {
        if (step.type === "guided" || step.type === "mastery_check") {
          expect(qById.has(step.questionId), `${lesson.id}/${step.id} → ${step.questionId}`).toBe(true);
        }
        if (step.type === "math") {
          expect(eqById.has(step.equationId), `${lesson.id}/${step.id} → ${step.equationId}`).toBe(true);
        }
      }
    }
  });

  it("every question's answer key scores its own correct answer as correct", () => {
    for (const q of plan.questions) {
      if (q.type === "mc_single") {
        const r = scoreAnswer(q, { type: "mc_single", optionId: q.answerKey.correctOptionId });
        expect(r.correct, q.id).toBe(true);
      }
    }
  });
});

describe("applyTesterSample", () => {
  const other: EnrolledCourseState[] = ["loading", "cloudless"];

  it("returns the sample only when signed-in-but-unenrolled AND a tester", () => {
    expect(applyTesterSample("none", true)).toBe(SAMPLE_ENROLLED_PLAN);
  });

  it("leaves a non-tester's empty state untouched (they see the join gate)", () => {
    expect(applyTesterSample("none", false)).toBe("none");
  });

  it("never overrides loading/cloudless, even for a tester", () => {
    for (const s of other) {
      expect(applyTesterSample(s, true)).toBe(s);
      expect(applyTesterSample(s, false)).toBe(s);
    }
  });

  it("never overrides a real enrollment for a tester", () => {
    const real = { ...SAMPLE_ENROLLED_PLAN, isSample: false, courseId: "real" };
    expect(applyTesterSample(real, true)).toBe(real);
  });
});
