"use client";

/**
 * Courses & enrollments client (Phase 4, D-012 seam). Same posture as the rest
 * of the client layer: env-guarded getSupabase(), anonymous ensureSession(),
 * and a typed degrade to null/[]/{} when Supabase is unconfigured or
 * unreachable — never a silent failure, never a thrown crash (GATE-009).
 *
 * A teacher owns a course with a shareable join code; a learner enrolls by
 * code through the security-definer join_course RPC (so course rows stay
 * unenumerable). Teacher analytics read the enrolled learners' mastery rows
 * through the additive mastery_states_read_class RLS policy.
 */

import { getSupabase, ensureSession } from "./supabase";
import type { MasteryState } from "./engine/types";

/** unambiguous alphabet: no 0/O/1/I. 32 chars → Uint32 % 32 is unbiased. */
const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 6 uppercase alphanumeric chars from the unambiguous set (crypto RNG) */
export function generateJoinCode(length = 6): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += JOIN_CODE_ALPHABET[bytes[i] % JOIN_CODE_ALPHABET.length];
  }
  return out;
}

export interface CourseSummary {
  id: string;
  title: string;
  joinCode: string;
}

/**
 * Teacher path: return the caller's existing owned course, or lazily create one
 * with a fresh join code. Null in local-only / unreachable mode (GATE-009).
 */
export async function ensureMyCourse(title: string): Promise<CourseSummary | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const userId = await ensureSession();
    if (!userId) return null;

    const existing = await supabase
      .from("courses")
      .select("id, title, join_code")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing.error) return null;
    if (existing.data) {
      return { id: existing.data.id, title: existing.data.title, joinCode: existing.data.join_code };
    }

    // create; retry on the (astronomically unlikely) join_code unique collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const joinCode = generateJoinCode();
      const created = await supabase
        .from("courses")
        .insert({ owner_id: userId, title, join_code: joinCode })
        .select("id, title, join_code")
        .maybeSingle();
      if (!created.error && created.data) {
        return { id: created.data.id, title: created.data.title, joinCode: created.data.join_code };
      }
      // 23505 = unique_violation. Could be a code clash, or a concurrent create
      // of this teacher's course — re-check for an owned course before retrying.
      if (created.error?.code === "23505") {
        const race = await supabase
          .from("courses")
          .select("id, title, join_code")
          .eq("owner_id", userId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (race.data) {
          return { id: race.data.id, title: race.data.title, joinCode: race.data.join_code };
        }
        continue;
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

export interface JoinResult {
  ok: boolean;
  courseId?: string;
  error?: "not_found" | "unavailable";
}

/**
 * Student path: enroll by code via the join_course RPC. Normalizes the code
 * (trim + uppercase) to match the stored form. "not_found" when the code
 * resolves to no course; "unavailable" in local-only / unreachable mode.
 */
export async function joinCourseByCode(code: string): Promise<JoinResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, error: "unavailable" };
  try {
    const userId = await ensureSession();
    if (!userId) return { ok: false, error: "unavailable" };
    const normalized = code.trim().toUpperCase();
    if (!normalized) return { ok: false, error: "not_found" };
    const { data, error } = await supabase.rpc("join_course", { code: normalized });
    if (error) return { ok: false, error: "unavailable" };
    if (!data) return { ok: false, error: "not_found" };
    return { ok: true, courseId: data as string };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export interface EnrollmentSummary {
  courseId: string;
  title: string;
}

/**
 * Student view: the course the caller is enrolled in (most recent if several).
 * Null when not enrolled or in local-only / unreachable mode. The embedded
 * course title is readable via the courses_read_enrolled policy.
 */
export async function fetchMyEnrollment(): Promise<EnrollmentSummary | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const userId = await ensureSession();
    if (!userId) return null;
    const { data, error } = await supabase
      .from("enrollments")
      .select("course_id, courses(title)")
      .eq("user_id", userId)
      .order("enrolled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    // PostgREST types the embed as object-or-array depending on inference
    const course = data.courses as unknown as { title: string } | { title: string }[] | null;
    const title = Array.isArray(course) ? course[0]?.title : course?.title;
    return { courseId: data.course_id as string, title: title ?? "Your class" };
  } catch {
    return null;
  }
}

export interface RosterEntry {
  userId: string;
  enrolledAtISO: string;
}

/** Owner-only roster (RLS enforces): the learners enrolled in a course. */
export async function fetchRoster(courseId: string): Promise<RosterEntry[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    await ensureSession();
    const { data, error } = await supabase
      .from("enrollments")
      .select("user_id, enrolled_at")
      .eq("course_id", courseId)
      .order("enrolled_at", { ascending: true });
    if (error || !data) return [];
    return data.map((r) => ({ userId: r.user_id as string, enrolledAtISO: r.enrolled_at as string }));
  } catch {
    return [];
  }
}

/** userId → conceptSlug → mastery state, for every enrolled learner. */
export type ClassMastery = Record<string, Record<string, MasteryState>>;

/**
 * Teacher analytics: the mastery rows of learners enrolled in a course the
 * caller owns, read through the mastery_states_read_class policy. Empty {} for
 * a non-owner (RLS returns nothing) or in local-only / unreachable mode.
 */
export async function fetchClassMastery(courseId: string): Promise<ClassMastery> {
  const supabase = getSupabase();
  if (!supabase) return {};
  try {
    await ensureSession();
    // roster is owner-gated; a non-owner gets an empty roster and thus {}
    const roster = await fetchRoster(courseId);
    if (roster.length === 0) return {};
    const userIds = roster.map((r) => r.userId);
    const { data, error } = await supabase
      .from("mastery_states")
      .select("user_id, concept_slug, state")
      .in("user_id", userIds);
    if (error || !data) return {};
    const out: ClassMastery = {};
    for (const row of data) {
      (out[row.user_id as string] ??= {})[row.concept_slug as string] = row.state as MasteryState;
    }
    return out;
  } catch {
    return {};
  }
}
