import { describe, expect, it } from "vitest";
import { buildPacingPlan, buildPacingPlanByClasses, orderedLessons } from "../pacing";
import type { CourseDraft } from "../compile-course";
import type { Lesson } from "../types";

function lesson(id: string, minutes: number): Lesson {
  return {
    id,
    conceptSlug: id,
    title: `Lesson ${id}`,
    steps: [],
    estimatedMinutes: minutes,
  } as unknown as Lesson;
}

const draft: CourseDraft = {
  concepts: [],
  edges: [],
  lessons: [lesson("a", 20), lesson("b", 20), lesson("c", 20), lesson("d", 15)],
  units: [
    { title: "Unit 1", lessonIds: ["a", "b"] },
    { title: "Unit 2", lessonIds: ["c", "d"] },
  ],
} as unknown as CourseDraft;

describe("orderedLessons", () => {
  it("returns lessons in unit order, tagged with their unit", () => {
    const o = orderedLessons(draft);
    expect(o.map((l) => l.lessonTitle)).toEqual(["Lesson a", "Lesson b", "Lesson c", "Lesson d"]);
    expect(o[0].unitTitle).toBe("Unit 1");
    expect(o[2].unitTitle).toBe("Unit 2");
  });

  it("appends lessons not referenced by any unit", () => {
    const d = { ...draft, lessons: [...draft.lessons, lesson("z", 10)] } as CourseDraft;
    const o = orderedLessons(d);
    expect(o.find((l) => l.lessonTitle === "Lesson z")?.unitTitle).toBe("More");
    expect(o).toHaveLength(5);
  });
});

describe("buildPacingPlan", () => {
  it("packs lessons in order into classes capped at minutesPerClass, never reordering", () => {
    // cap 50: [a20,b20] = 40, +c20 would be 60 > 50 → new class [c20,d15]=35
    const plan = buildPacingPlan(draft, 50);
    expect(plan.classes).toHaveLength(2);
    expect(plan.classes[0].items.map((i) => i.lessonTitle)).toEqual(["Lesson a", "Lesson b"]);
    expect(plan.classes[0].totalMinutes).toBe(40);
    expect(plan.classes[1].items.map((i) => i.lessonTitle)).toEqual(["Lesson c", "Lesson d"]);
    expect(plan.totalMinutes).toBe(75);
    // teaching order preserved across the flattened plan
    const flat = plan.classes.flatMap((c) => c.items.map((i) => i.lessonTitle));
    expect(flat).toEqual(["Lesson a", "Lesson b", "Lesson c", "Lesson d"]);
  });

  it("a lesson longer than a whole class still gets its own class (never dropped)", () => {
    const d = { ...draft, lessons: [lesson("big", 90)], units: [{ title: "U", lessonIds: ["big"] }] } as CourseDraft;
    const plan = buildPacingPlan(d, 50);
    expect(plan.classes).toHaveLength(1);
    expect(plan.classes[0].items[0].minutes).toBe(90);
  });
});

describe("buildPacingPlan — over-length flag", () => {
  it("flags a lesson longer than a whole class", () => {
    const big: CourseDraft = {
      concepts: [], edges: [],
      lessons: [lesson("a", 15), lesson("big", 90), lesson("c", 15)],
      units: [{ title: "U", lessonIds: ["a", "big", "c"] }],
    } as unknown as CourseDraft;
    const plan = buildPacingPlan(big, 50);
    const all = plan.classes.flatMap((c) => c.items);
    const flagged = all.filter((l) => l.overLength);
    expect(flagged.map((l) => l.lessonTitle)).toEqual(["Lesson big"]);
    // the 90-min lesson sits alone in its own class
    const bigClass = plan.classes.find((c) => c.items.some((i) => i.overLength))!;
    expect(bigClass.items).toHaveLength(1);
  });
});

describe("buildPacingPlanByClasses", () => {
  it("produces exactly N classes, order preserved, balanced by minutes", () => {
    const plan = buildPacingPlanByClasses(draft, 2); // 4 lessons, 75 min total
    expect(plan.classes).toHaveLength(2);
    // order never changes
    expect(plan.classes.flatMap((c) => c.items.map((i) => i.lessonTitle))).toEqual([
      "Lesson a", "Lesson b", "Lesson c", "Lesson d",
    ]);
    // both classes carry at least one lesson and roughly half the minutes
    for (const c of plan.classes) expect(c.items.length).toBeGreaterThan(0);
    expect(plan.totalMinutes).toBe(75);
  });

  it("never leaves a class empty — caps effective classes at the lesson count", () => {
    const plan = buildPacingPlanByClasses(draft, 10); // only 4 lessons
    expect(plan.classes).toHaveLength(4);
    for (const c of plan.classes) expect(c.items).toHaveLength(1);
  });

  it("N=1 puts everything in one class", () => {
    const plan = buildPacingPlanByClasses(draft, 1);
    expect(plan.classes).toHaveLength(1);
    expect(plan.classes[0].items).toHaveLength(4);
    expect(plan.classes[0].totalMinutes).toBe(75);
  });

  it("accounts for every lesson's minutes across the classes", () => {
    const plan = buildPacingPlanByClasses(draft, 3);
    const sum = plan.classes.reduce((s, c) => s + c.totalMinutes, 0);
    expect(sum).toBe(75);
    expect(plan.classes).toHaveLength(3);
  });
});
