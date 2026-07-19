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

  it("reusable template: one teacher runs TWO sections; grounding + question bank are shared, not siloed (IDEA-205)", async () => {
    const { getSupabase, ensureSession } = await import("../supabase");
    const { createCourse, listMyCourses, renameCourse, fetchRoster, fetchClassMastery } =
      await import("../course");
    const singleton = getSupabase()!;

    // --- teacher on the singleton owns BOTH sections ---
    await singleton.auth.signOut({ scope: "local" });
    const teacherId = await ensureSession();
    expect(teacherId).not.toBeNull();

    const stamp = new Date().toISOString();
    // createCourse ALWAYS inserts a fresh section with its own join code
    const sectionA = await createCourse(`IT-TMPL A ${stamp}`);
    const sectionB = await createCourse(`IT-TMPL B ${stamp}`);
    expect(sectionA).not.toBeNull();
    expect(sectionB).not.toBeNull();
    expect(sectionA!.id).not.toBe(sectionB!.id);
    // two distinct, independent join codes
    expect(sectionA!.joinCode).not.toBe(sectionB!.joinCode);
    expect(sectionA!.joinCode).toMatch(/^[A-Z0-9]{6,8}$/);
    expect(sectionB!.joinCode).toMatch(/^[A-Z0-9]{6,8}$/);

    // listMyCourses returns BOTH with correct titles (oldest first)
    const listed = await listMyCourses();
    const byId = new Map(listed.map((c) => [c.id, c]));
    expect(byId.has(sectionA!.id)).toBe(true);
    expect(byId.has(sectionB!.id)).toBe(true);
    expect(byId.get(sectionA!.id)!.title).toBe(`IT-TMPL A ${stamp}`);
    expect(byId.get(sectionB!.id)!.title).toBe(`IT-TMPL B ${stamp}`);
    expect(byId.get(sectionA!.id)!.studentCount).toBe(0);

    // renameCourse updates one section; the change is visible on the next fetch
    const renamedTitle = `IT-TMPL A (renamed) ${stamp}`;
    expect(await renameCourse(sectionA!.id, renamedTitle)).toBe(true);
    const relisted = await listMyCourses();
    expect(relisted.find((c) => c.id === sectionA!.id)!.title).toBe(renamedTitle);
    // the other section is untouched
    expect(relisted.find((c) => c.id === sectionB!.id)!.title).toBe(`IT-TMPL B ${stamp}`);

    // --- the teacher grounds the course ONCE (owner-scoped, not course-scoped):
    //     an approved source document + concept link, and an authored question.
    //     None of these tables carry a course_id — that is the template claim. ---
    const docId = `it-tmpl-doc-${Math.random().toString(36).slice(2, 10)}`;
    const sectionId = "s1";
    const conceptSlug = "steady-state";
    const wroteDoc = await singleton.from("source_documents").insert({
      owner_id: teacherId,
      doc_id: docId,
      title: `IT-TMPL source ${stamp}`,
      char_count: 1234,
      sections: [{ id: sectionId, heading: "Steady state", text: "capital per worker is constant", pageStart: 1, pageEnd: 1 }],
    });
    expect(wroteDoc.error).toBeNull();
    const wroteLink = await singleton.from("concept_links").insert({
      owner_id: teacherId,
      doc_id: docId,
      section_id: sectionId,
      concept_slug: conceptSlug,
      score: 0.9,
      matched_terms: ["steady", "state"],
      status: "approved",
      approved_at: new Date().toISOString(),
    });
    expect(wroteLink.error).toBeNull();

    const questionId = `q-authored-${conceptSlug}-${Math.random().toString(36).slice(2, 8)}`;
    const wroteQuestion = await singleton.from("authored_questions").insert({
      owner_id: teacherId,
      question_id: questionId,
      concept_slug: conceptSlug,
      question: { id: questionId, type: "mc_single", stem: "What is the steady state?", provenance: "ai_approved" },
    });
    expect(wroteQuestion.error).toBeNull();

    // --- a student enrolls in SECTION B ONLY (the second/other section) ---
    const { client: student, userId: studentId } = await rawAnonClient();
    const joined = await student.rpc("join_course", { code: sectionB!.joinCode });
    expect(joined.error).toBeNull();
    expect(joined.data).toBe(sectionB!.id);

    // KEY PROOF #1 — grounding is teacher-global: the student (in section B) sees
    // the teacher's approved concept link, even though it was never "assigned" to
    // section B. concept_links_read_published gates on status='approved' only.
    const seenLink = await student
      .from("concept_links")
      .select("owner_id, doc_id, concept_slug, status")
      .eq("owner_id", teacherId)
      .eq("doc_id", docId);
    expect(seenLink.error).toBeNull();
    expect(seenLink.data?.length).toBe(1);
    expect(seenLink.data![0].status).toBe("approved");
    expect(seenLink.data![0].concept_slug).toBe(conceptSlug);

    // the source document behind that approved link is readable too (published)
    const seenDoc = await student
      .from("source_documents")
      .select("doc_id, title")
      .eq("owner_id", teacherId)
      .eq("doc_id", docId);
    expect(seenDoc.error).toBeNull();
    expect(seenDoc.data?.length).toBe(1);

    // KEY PROOF #2 — the question bank is shared across sections too
    const seenQuestion = await student
      .from("authored_questions")
      .select("question_id, concept_slug")
      .eq("question_id", questionId);
    expect(seenQuestion.error).toBeNull();
    expect(seenQuestion.data?.length).toBe(1);
    expect(seenQuestion.data![0].concept_slug).toBe(conceptSlug);

    // --- and the multi-course analytics read path still works per section ---
    const mastery: MasteryState = {
      ...initialMastery(conceptSlug),
      conceptual: 0.66,
      evidenceCount: 3,
      lastEvidenceAt: new Date().toISOString(),
    };
    const wroteMastery = await student.from("mastery_states").upsert({
      user_id: studentId,
      concept_slug: conceptSlug,
      state: mastery,
      prev_interval_days: 1,
    });
    expect(wroteMastery.error).toBeNull();

    // teacher reads section B's roster + mastery (owns_class_of is not scoped to
    // a single course, so the owner of either section can read it)
    const rosterB = await fetchRoster(sectionB!.id);
    expect(rosterB.map((r) => r.userId)).toContain(studentId);
    const masteryB = await fetchClassMastery(sectionB!.id);
    expect(masteryB[studentId]?.[conceptSlug]?.conceptual).toBeCloseTo(0.66, 6);

    // section A has no roster of its own — sections are independent
    expect((await fetchRoster(sectionA!.id)).length).toBe(0);
    expect(await fetchClassMastery(sectionA!.id)).toEqual({});

    await student.auth.signOut({ scope: "local" });
    console.log(
      `CLEANUP-TMPL courseA=${sectionA!.id} courseB=${sectionB!.id} teacher=${teacherId} ` +
        `student=${studentId} docId=${docId} questionId=${questionId} conceptSlug=${conceptSlug}`,
    );
  }, 90_000);
});
