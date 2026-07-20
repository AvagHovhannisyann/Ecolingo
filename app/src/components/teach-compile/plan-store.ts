"use client";

/**
 * Persistence for the teacher-ratified compiled course plan (D-020, Wave 2
 * Stream L).
 *
 * The teacher-side ingestion store (`ecolingo.teacher.v1`, teacher-state.ts) has
 * no field for a whole compiled COURSE plan, and that module is owned by another
 * stream — so a compiled plan gets its OWN clearly-namespaced localStorage key,
 * mirroring the load/save/degrade discipline of `saveTeacherState`:
 *   - a `version` tag so a future migration is possible,
 *   - a try/catch around storage so a full/blocked quota never crashes the UI
 *     (GATE-009: the caller reads state back, nothing silently pretends to save).
 *
 * What is stored is the SANITIZED-then-CONVERTED artifact: the real
 * Concept/ConceptEdge/Lesson values from `planToCourseDraft`, every concept
 * `planned_unverified` (GATE-001). No learner surface reads this key yet — that
 * wiring is a later architect task; this stream only persists + confirms.
 */

import type { CourseDraft } from "@/lib/engine/compile-course";
import type { TeachingStyle } from "@/lib/engine/teaching-style";

export const COMPILED_PLAN_KEY = "ecolingo.compiledCoursePlan.v1";

export interface StoredCompiledPlan {
  version: 1;
  /** when the teacher ratified the plan */
  approvedAtISO: string;
  /** the OpenRouter model that drafted it (provenance), or null if unknown */
  model: string | null;
  /** the material the sections came from, for the teacher's own reference */
  sourceTitle: string;
  /** units the teacher kept (empty units are dropped before persisting) */
  unitCount: number;
  /** lessons the teacher checked and kept */
  lessonCount: number;
  /** the real engine types — concepts are planned_unverified, lessons draft */
  draft: CourseDraft;
  /** D-022: set when the plan was bound to a real course row (cloud mode) */
  courseId?: string;
  /** the bound course's join code — what the teacher shares with students */
  joinCode?: string;
  /** D-029: the teacher's teaching style, so the student tutor speaks in their
   *  voice. Absent when the teacher kept the default voice. */
  teachingStyle?: TeachingStyle;
}

export function loadCompiledPlan(): StoredCompiledPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COMPILED_PLAN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCompiledPlan;
    if (!parsed || parsed.version !== 1 || !parsed.draft) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCompiledPlan(plan: StoredCompiledPlan): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMPILED_PLAN_KEY, JSON.stringify(plan));
  } catch {
    // storage full/blocked — the confirmation state still renders from the
    // in-memory value the caller holds; nothing pretends to have persisted.
  }
}

export function clearCompiledPlan(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(COMPILED_PLAN_KEY);
  } catch {
    /* ignore */
  }
}
