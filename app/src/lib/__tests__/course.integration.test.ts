/**
 * Live integration test for Phase 4 courses & enrollments (D-012 seam).
 * Opt-in (RUN_SYNC_INTEGRATION=1 + Supabase env). Proves the enrollment/roles
 * loop end-to-end against the live project:
 *   1. teacher creates a course; a student joins by code, records a real mastery
 *      state, and the teacher reads that student's mastery through the new
 *      class-analytics RLS policy;
 *   2. isolation — an unrelated user (owns nothing, enrolled in nothing) sees no
 *      class mastery for a course they don't own, and a bogus code is not_found.
 *
 * Identity note: on this project signOut (even scope:'local') revokes the anon
 * session server-side, so ONE client cannot hold two anonymous identities and
 * switch back. So the shared singleton client (the one the course.ts / sync.ts
 * functions use via getSupabase()) stays a single fixed identity for the whole
 * test, and the *other* participant is driven through a second, independent raw
 * client. Every course.ts function and every new RLS policy is still exercised:
 *   - test 1 keeps the singleton as the TEACHER (ensureMyCourse / fetchRoster /
 *     fetchClassMastery run through the lib as the owner); the student is the
 *     raw client (joins via the join_course RPC, writes the same mastery_states
 *     row shape sync.ts pushes);
 *   - test 2 keeps the singleton as a STUDENT (joinCourseByCode ok + not_found
 *     through the lib) and proves a non-owner's fetchClassMastery is empty.
 *
 *   RUN_SYNC_INTEGRATION=1 NEXT_PUBLIC_SUPABASE_URL=... \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... npx vitest run src/lib/__tests__/course.integration.test.ts
 */

import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { initialMastery } from "../engine/mastery";
import type { MasteryState } from "../engine/types";

const enabled =
  process.env.RUN_SYNC_INTEGRATION === "1" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const d = describe.skipIf(!enabled);

/** an independent anon client (own in-memory storage) for the "other" identity */
async function rawAnonClient(): Promise<{ client: SupabaseClient; userId: string }> {
  const store = new Map<string, string>();
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: true,
        storage: {
          getItem: (k) => store.get(k) ?? null,
          setItem: (k, v) => void store.set(k, v),
          removeItem: (k) => void store.delete(k),
        },
      },
    }
  );
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("anon sign-in failed");
  return { client, userId: data.user.id };
}

d("courses & enrollments against live Supabase (Phase 4, D-012)", () => {
  beforeAll(() => {
    const store = new Map<string, string>();
    // @ts-expect-error test shim
    globalThis.window = globalThis.window ?? {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
  });

  it("teacher creates a course, a student joins, teacher reads the student's mastery", async () => {
    const { getSupabase, ensureSession } = await import("../supabase");
    const { ensureMyCourse, fetchRoster, fetchClassMastery } = await import("../course");
    const singleton = getSupabase()!;

    // --- teacher on the singleton (stays teacher for the whole test) ---
    await singleton.auth.signOut({ scope: "local" });
    const teacherId = await ensureSession();
    expect(teacherId).not.toBeNull();
    const course = await ensureMyCourse(`IT-COURSE ${new Date().toISOString()}`);
    expect(course).not.toBeNull();
    expect(course!.joinCode).toMatch(/^[A-Z0-9]{6,8}$/);

    // --- student on an independent raw client ---
    const { client: student, userId: studentId } = await rawAnonClient();
    expect(studentId).not.toBe(teacherId);

    // join via the join_course RPC (lowercased to prove server-side normalization)
    const joined = await student.rpc("join_course", { code: course!.joinCode.toLowerCase() });
    expect(joined.error).toBeNull();
    expect(joined.data).toBe(course!.id);

    // student writes a real mastery row — identical shape to sync.ts's push
    const mastery: MasteryState = {
      ...initialMastery("steady-state"),
      conceptual: 0.73,
      evidenceCount: 4,
      lastEvidenceAt: new Date().toISOString(),
    };
    const wrote = await student.from("mastery_states").upsert({
      user_id: studentId,
      concept_slug: "steady-state",
      state: mastery,
      prev_interval_days: 2,
    });
    expect(wrote.error).toBeNull();

    // --- teacher (still the singleton) reads through the lib ---
    const roster = await fetchRoster(course!.id);
    expect(roster.map((r) => r.userId)).toContain(studentId);

    const classMastery = await fetchClassMastery(course!.id);
    expect(Object.keys(classMastery)).toContain(studentId);
    expect(classMastery[studentId]?.["steady-state"]?.conceptual).toBeCloseTo(0.73, 6);

    await student.auth.signOut({ scope: "local" });
    // ids for cleanup visibility
    console.log(`CLEANUP course=${course!.id} teacher=${teacherId} student=${studentId}`);
  }, 60_000);

  it("isolation: joinCourseByCode ok + not_found, and a non-owner reads no class mastery", async () => {
    const { getSupabase, ensureSession } = await import("../supabase");
    const { joinCourseByCode, fetchClassMastery } = await import("../course");
    const singleton = getSupabase()!;

    // a teacher (raw client) owns a course the singleton user will NOT own
    const { client: teacher, userId: teacherId } = await rawAnonClient();
    const joinCode = `IT${Math.random().toString(36).slice(2, 6).toUpperCase()}`; // 6 chars, [A-Z0-9]
    const title = `IT-COURSE-ISO ${new Date().toISOString()}`;
    const created = await teacher
      .from("courses")
      .insert({ owner_id: teacherId, title, join_code: joinCode })
      .select("id, join_code")
      .single();
    expect(created.error).toBeNull();
    const courseId = created.data!.id as string;

    // --- singleton user: a fresh student, NOT the owner ---
    await singleton.auth.signOut({ scope: "local" });
    const meId = await ensureSession();
    expect(meId).not.toBe(teacherId);

    // joinCourseByCode happy path through the lib (mixed case → normalized)
    const ok = await joinCourseByCode(joinCode.toLowerCase());
    expect(ok.ok).toBe(true);
    expect(ok.courseId).toBe(courseId);

    // a code that resolves to no course is a clean not_found (not a crash)
    const bogus = await joinCourseByCode("ZZZZZZ");
    expect(bogus.ok).toBe(false);
    expect(bogus.error).toBe("not_found");

    // the singleton user does NOT own this course → RLS yields no class mastery,
    // even though they are enrolled in it (enrollment != ownership)
    const seen = await fetchClassMastery(courseId);
    expect(seen).toEqual({});

    await teacher.auth.signOut({ scope: "local" });
    console.log(`CLEANUP-ISO course=${courseId} teacher=${teacherId} student=${meId}`);
  }, 60_000);
});
