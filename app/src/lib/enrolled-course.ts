"use client";

/**
 * The student's enrolled course (D-022).
 *
 * A join code binds a student to a course row carrying the teacher-RATIFIED
 * compiled plan (see /teach/compile). This hook fetches that plan once per
 * mount and validates its shape defensively — the jsonb comes from our own
 * ratify flow, but a malformed row must degrade to "none", never crash the
 * learning path (GATE-009).
 *
 * States:
 *  - "loading":   fetch in flight
 *  - "cloudless": no Supabase env — the app runs in local demo mode
 *  - "none":      signed in but not enrolled, or the course has no plan yet
 *  - { plan }:    a validated, ratified course plan ready to render
 */

import { useEffect, useState } from "react";
import type { Concept, ConceptEdge, Lesson } from "./engine/types";
import { fetchEnrolledCompiledPlan } from "./course";
import { getSupabase } from "./supabase";

export interface EnrolledPlan {
  courseId: string;
  courseTitle: string;
  approvedAtISO: string | null;
  model: string | null;
  concepts: Concept[];
  edges: ConceptEdge[];
  lessons: Lesson[];
  /** AI-designed roadmap units (goal title + lesson ids), when the ratified
   *  plan carries them; older plans without units fall back to client chunking. */
  units: { title: string; lessonIds: string[] }[];
}

export type EnrolledCourseState = "loading" | "cloudless" | "none" | EnrolledPlan;

/** Defensive shape-check of the stored jsonb → typed plan, or null. */
export function parseStoredPlan(courseId: string, courseTitle: string, raw: unknown): EnrolledPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const draft = p.draft as Record<string, unknown> | undefined;
  if (!draft) return null;
  const concepts = draft.concepts as Concept[] | undefined;
  const edges = draft.edges as ConceptEdge[] | undefined;
  const lessons = draft.lessons as Lesson[] | undefined;
  if (!Array.isArray(concepts) || !Array.isArray(edges) || !Array.isArray(lessons)) return null;
  if (lessons.length === 0) return null;
  const conceptsOk = concepts.every((c) => typeof c?.slug === "string" && typeof c?.name === "string");
  const lessonsOk = lessons.every(
    (l) => typeof l?.id === "string" && typeof l?.conceptSlug === "string" && Array.isArray(l?.steps)
  );
  if (!conceptsOk || !lessonsOk) return null;
  // Units are optional and defensively validated: every entry needs a title
  // and only lesson ids that exist in the plan survive.
  const lessonIdSet = new Set(lessons.map((l) => l.id));
  const rawUnits = Array.isArray(draft.units) ? draft.units : [];
  const units = rawUnits
    .map((u) => {
      const r = u as Record<string, unknown>;
      const title = typeof r?.title === "string" ? r.title.trim() : "";
      const ids = Array.isArray(r?.lessonIds) ? r.lessonIds.filter((id): id is string => typeof id === "string" && lessonIdSet.has(id)) : [];
      return { title, lessonIds: ids };
    })
    .filter((u) => u.title !== "" && u.lessonIds.length > 0);
  return {
    courseId,
    courseTitle,
    approvedAtISO: typeof p.approvedAtISO === "string" ? p.approvedAtISO : null,
    model: typeof p.model === "string" ? p.model : null,
    concepts,
    edges,
    lessons,
    units,
  };
}

export function useEnrolledCourse(refreshKey = 0): EnrolledCourseState {
  // Results are keyed to the refreshKey they were fetched for; a stale key
  // renders as "loading" — no synchronous setState in the effect needed.
  const [result, setResult] = useState<{ key: number; value: EnrolledCourseState } | null>(null);

  useEffect(() => {
    if (getSupabase() === null) return; // cloudless is terminal
    let alive = true;
    // Never hang on a slow/unreachable backend: race the fetch against a
    // timeout so a stalled Supabase degrades to local mode instead of an
    // infinite "Loading your plan…" spinner.
    const timeout = new Promise<"unreachable">((resolve) => setTimeout(() => resolve("unreachable"), 7000));
    void Promise.race([fetchEnrolledCompiledPlan(), timeout]).then((res) => {
      if (!alive) return;
      // Unreachable ≠ unenrolled: degrade to local demo mode, never to the
      // join gate — a network blip must not hide a student's course.
      if (res === "unreachable") return setResult({ key: refreshKey, value: "cloudless" });
      if (!res) return setResult({ key: refreshKey, value: "none" });
      const parsed = parseStoredPlan(res.courseId, res.title, res.plan);
      setResult({ key: refreshKey, value: parsed ?? "none" });
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (getSupabase() === null) return "cloudless";
  return result && result.key === refreshKey ? result.value : "loading";
}
