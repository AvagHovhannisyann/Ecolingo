/**
 * The app ships with NO built-in course (D-022 platform pivot).
 *
 * Courses come from teachers: they compile their uploaded materials into a
 * plan (see /teach/compile), students join by code, and every learner
 * surface reads its content from the ENROLLED course — never from here.
 *
 * These empty exports are what the platform's shared components import, so a
 * signed-in student with no course sees honest "join a course" empty states
 * instead of a demo course. The former ECON 13210 / Solow content is retained
 * only as a test fixture under `content/econ13210/` (imported by the engine
 * tests), never by the app.
 */

import type {
  Citation,
  Concept,
  ConceptEdge,
  Equation,
  Lesson,
  Misconception,
  Question,
} from "@/lib/engine/types";

export const concepts: Concept[] = [];
export const conceptEdges: ConceptEdge[] = [];
export const equations: Equation[] = [];
export const misconceptions: Misconception[] = [];
export const questions: Question[] = [];
export const citations: Citation[] = [];

export const course = {
  id: "none",
  title: "",
  joinCode: "",
  sourceStatus: "planned_unverified" as const,
  concepts,
  conceptEdges,
  equations,
  misconceptions,
  questions,
  lessons: [] as Lesson[],
  citations,
};

/**
 * Lookup helpers kept for import compatibility. They throw on any id because
 * no built-in course content exists — in practice the app never calls them
 * (every content lookup goes through the enrolled course's own arrays).
 */
export function getConcept(slug: string): Concept {
  throw new Error(`no built-in course: concept "${slug}" not found`);
}
export function getEquation(id: string): Equation {
  throw new Error(`no built-in course: equation "${id}" not found`);
}
export function getQuestion(id: string): Question {
  throw new Error(`no built-in course: question "${id}" not found`);
}
