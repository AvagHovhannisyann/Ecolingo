/**
 * The built-in SAMPLE course (D-026).
 *
 * The app ships blank: teachers compile their own material, students join by
 * code. That means a fresh learner — including a designated TESTER account —
 * has nothing on the learning path. To let testers observe the full learner
 * experience (Duolingo-style roadmap with AI-style units, fully playable
 * lessons, sections, guidebook) WITHOUT enrolling in a live class, this module
 * assembles the complete econ13210 Solow-growth fixture into an EnrolledPlan
 * shaped exactly like a ratified compiled plan.
 *
 * It is honest demo content: `isSample: true` makes every surface label it as
 * a sample/test course, and it only ever appears for tester accounts with no
 * real enrollment (see applyTesterSample). It is NOT a teacher's ratified
 * course and never reaches a real student.
 */

import {
  concepts,
  conceptEdges,
  equations,
  questions,
  course as fixtureCourse,
} from "./econ13210/index";
import type { EnrolledPlan } from "@/lib/enrolled-course";

/**
 * AI-style roadmap units over the fixture's three playable lessons. Titles are
 * student-facing GOALS (the shape the compiler now asks the model for), so the
 * roadmap renders colored unit banners exactly as a real compiled course would.
 */
const SAMPLE_UNITS: { title: string; lessonIds: string[] }[] = [
  {
    title: "Build the Solow growth engine",
    lessonIds: ["lesson-production-function", "lesson-solow-steady-state"],
  },
  {
    title: "Optimize the economy",
    lessonIds: ["lesson-golden-rule"],
  },
];

export const SAMPLE_ENROLLED_PLAN: EnrolledPlan = {
  courseId: "sample-solow-growth",
  courseTitle: "Sample course — Solow growth",
  approvedAtISO: null,
  model: "sample",
  concepts,
  edges: conceptEdges,
  lessons: fixtureCourse.lessons,
  units: SAMPLE_UNITS,
  questions,
  equations,
  isSample: true,
};
