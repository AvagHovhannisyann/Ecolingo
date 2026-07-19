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

/** map a raw `courses` row (snake_case join_code) to the CourseSummary shape */
function toSummary(row: { id: string; title: string; join_code: string }): CourseSummary {
  return { id: row.id, title: row.title, joinCode: row.join_code };
}

/**
 * The outcome of a single course-insert attempt, from the caller's point of
 * view — deliberately DB-agnostic so the retry orchestration below is pure and
 * unit-testable without a live database:
 *   - "ok":        the row was created (or, for ensureMyCourse, a concurrent
 *                  create of the teacher's course was found and reused).
 *   - "collision": the join_code hit the unique constraint (23505) — retry with
 *                  a fresh code.
 *   - "error":     any other failure — abort immediately, no retry.
 */
export type CourseInsertOutcome =
  | { status: "ok"; course: CourseSummary }
  | { status: "collision" }
  | { status: "error" };

/**
 * Pure retry orchestrator shared by ensureMyCourse and createCourse. Calls
 * `attempt` with a fresh join code up to `maxAttempts` times: an "ok" resolves,
 * an "error" aborts (null), a "collision" retries with a newly generated code,
 * and exhausting the attempts yields null. The collision-vs-reuse *policy* lives
 * in each caller's `attempt` closure (createCourse always wants a new row;
 * ensureMyCourse reuses an already-owned course on collision), so this function
 * stays free of any single-course assumption. Exported for unit testing.
 */
export async function retryInsertCourse(
  attempt: (joinCode: string) => Promise<CourseInsertOutcome>,
  genCode: () => string = generateJoinCode,
  maxAttempts = 5,
): Promise<CourseSummary | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const outcome = await attempt(genCode());
    if (outcome.status === "ok") return outcome.course;
    if (outcome.status === "error") return null;
    // "collision" → loop and try again with a fresh code
  }
  return null;
}

/** the caller's earliest-created owned course, or null (owner-scoped by RLS) */
async function firstOwnedCourse(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string,
): Promise<CourseSummary | null> {
  const res = await supabase
    .from("courses")
    .select("id, title, join_code")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (res.error || !res.data) return null;
  return toSummary(res.data);
}

/** insert one new course row for `userId` with the given join code */
async function insertCourseRow(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string,
  title: string,
  joinCode: string,
) {
  return supabase
    .from("courses")
    .insert({ owner_id: userId, title, join_code: joinCode })
    .select("id, title, join_code")
    .maybeSingle();
}

/**
 * Teacher path: return the caller's existing (first) owned course, or lazily
 * create one with a fresh join code. Backward-compatible "my one course, lazily
 * created" semantics — existing callers depend on it. Null in local-only /
 * unreachable mode (GATE-009). It is now sugar over the same insert-with-retry
 * primitive createCourse uses; the only difference is that a join_code
 * collision here re-checks for (and reuses) an already-owned course, so two
 * concurrent first-time calls resolve to one course rather than erroring.
 */
export async function ensureMyCourse(title: string): Promise<CourseSummary | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const userId = await ensureSession();
    if (!userId) return null;

    const existing = await firstOwnedCourse(supabase, userId);
    if (existing) return existing;

    return await retryInsertCourse(async (joinCode) => {
      const created = await insertCourseRow(supabase, userId, title, joinCode);
      if (!created.error && created.data) return { status: "ok", course: toSummary(created.data) };
      // 23505 = unique_violation. Could be a code clash, or a concurrent create
      // of this teacher's course — reuse an owned course before retrying.
      if (created.error?.code === "23505") {
        const race = await firstOwnedCourse(supabase, userId);
        if (race) return { status: "ok", course: race };
        return { status: "collision" };
      }
      return { status: "error" };
    });
  } catch {
    return null;
  }
}

/**
 * Teacher path (reusable templates): ALWAYS insert a NEW course row — a fresh
 * section with its own independent join code and roster. The teacher's grounding
 * (concept_links / source_documents) and authored_questions are owner-scoped,
 * not course-scoped, so every new section automatically inherits the teacher's
 * approved citations and question bank — no re-ingestion, no re-approval. Null
 * in local-only / unreachable mode (GATE-009). Retries only on a join_code
 * collision (never reuses an existing course — that is ensureMyCourse's job).
 */
export async function createCourse(title: string): Promise<CourseSummary | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const userId = await ensureSession();
    if (!userId) return null;

    return await retryInsertCourse(async (joinCode) => {
      const created = await insertCourseRow(supabase, userId, title, joinCode);
      if (!created.error && created.data) return { status: "ok", course: toSummary(created.data) };
      if (created.error?.code === "23505") return { status: "collision" };
      return { status: "error" };
    });
  } catch {
    return null;
  }
}

/** A course the caller owns, with its live enrolled-student count. */
export type OwnedCourse = CourseSummary & { studentCount: number };

/**
 * Teacher path: every course owned by the caller (oldest first), each with its
 * live roster count. One count query per course — fine at this scale, and the
 * count is RLS-gated (enrollments_read_roster), so a non-owner would see 0.
 * Empty [] in local-only / unreachable mode (GATE-009).
 */
export async function listMyCourses(): Promise<OwnedCourse[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  try {
    const userId = await ensureSession();
    if (!userId) return [];
    const { data, error } = await supabase
      .from("courses")
      .select("id, title, join_code")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return await Promise.all(
      data.map(async (row) => {
        const summary = toSummary(row);
        const { count, error: countError } = await supabase
          .from("enrollments")
          .select("*", { count: "exact", head: true })
          .eq("course_id", summary.id);
        return { ...summary, studentCount: countError ? 0 : count ?? 0 };
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Teacher path: rename a course the caller owns. Owner-only — RLS
 * (courses_owner) silently no-ops the update for a non-owner, so this returns
 * true only when the caller actually owns the row. false in local-only /
 * unreachable mode (GATE-009).
 */
export async function renameCourse(courseId: string, title: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const userId = await ensureSession();
    if (!userId) return false;
    const { data, error } = await supabase
      .from("courses")
      .update({ title })
      .eq("id", courseId)
      .eq("owner_id", userId)
      .select("id");
    if (error) return false;
    // RLS lets a non-owner's update match zero rows without erroring; treat an
    // empty result set as "not updated".
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
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
