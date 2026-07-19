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
  return {
    courseId,
    courseTitle,
    approvedAtISO: typeof p.approvedAtISO === "string" ? p.approvedAtISO : null,
    model: typeof p.model === "string" ? p.model : null,
    concepts,
    edges,
    lessons,
  };
}

export function useEnrolledCourse(refreshKey = 0): EnrolledCourseState {
  const [state, setState] = useState<EnrolledCourseState>(() =>
    getSupabase() === null ? "cloudless" : "loading"
  );

  useEffect(() => {
    if (getSupabase() === null) return; // cloudless is terminal
    let alive = true;
    setState("loading");
    void fetchEnrolledCompiledPlan().then((res) => {
      if (!alive) return;
      // Unreachable ≠ unenrolled: degrade to local demo mode, never to the
      // join gate — a network blip must not hide a student's course.
      if (res === "unreachable") return setState("cloudless");
      if (!res) return setState("none");
      const parsed = parseStoredPlan(res.courseId, res.title, res.plan);
      setState(parsed ?? "none");
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return state;
}
