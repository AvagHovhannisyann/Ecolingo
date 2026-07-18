/**
 * Live integration test for Phase 5 class analytics (on the D-015 substrate).
 * Opt-in (RUN_SYNC_INTEGRATION=1 + Supabase env). Proves the whole path end to
 * end: a teacher owns a course, TWO students join and write different mastery
 * rows, the teacher reads them through fetchClassMastery, and the PURE analytics
 * engine turns that into a sensible per-concept summary + reteach ranking.
 *
 * Identity note (same constraint as course.integration.test.ts): signOut revokes
 * the anon session server-side, so the shared singleton client stays the fixed
 * TEACHER identity for the whole test, and each student is an independent raw
 * anon client.
 *
 *   export $(grep -v '^#' .env.local | grep -E 'SUPABASE' | xargs)
 *   RUN_SYNC_INTEGRATION=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt \
 *     npx vitest run src/lib/__tests__/class-analytics.integration.test.ts
 *
 * Cleanup: the test logs a CLEANUP-ANALYTICS line with the course/user ids so the
 * created rows can be deleted afterwards (courses cascade to enrollments; the two
 * mastery_states rows are removed by user_id).
 */

import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { initialMastery } from "../engine/mastery";
import { classConceptSummary, reteachRanking } from "../engine/class-analytics";
import type { MasteryState } from "../engine/types";

const enabled =
  process.env.RUN_SYNC_INTEGRATION === "1" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const d = describe.skipIf(!enabled);

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
    },
  );
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("anon sign-in failed");
  return { client, userId: data.user.id };
}

const concepts = [
  { slug: "production-function", name: "Production function" },
  { slug: "steady-state", name: "Steady state" },
];

async function writeMastery(client: SupabaseClient, userId: string, state: MasteryState) {
  const wrote = await client.from("mastery_states").upsert({
    user_id: userId,
    concept_slug: state.conceptSlug,
    state,
    prev_interval_days: 2,
  });
  expect(wrote.error).toBeNull();
}

d("class analytics against live Supabase (Phase 5, D-015)", () => {
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

  it("two students with different mastery → summary + reteach ranking are sensible", async () => {
    const { getSupabase, ensureSession } = await import("../supabase");
    const { ensureMyCourse, fetchRoster, fetchClassMastery } = await import("../course");
    const singleton = getSupabase()!;

    // teacher on the singleton for the whole test
    await singleton.auth.signOut({ scope: "local" });
    const teacherId = await ensureSession();
    expect(teacherId).not.toBeNull();
    const course = await ensureMyCourse(`IT-ANALYTICS ${new Date().toISOString()}`);
    expect(course).not.toBeNull();

    // student A: strong on steady-state, struggling on production-function
    const { client: a, userId: aId } = await rawAnonClient();
    expect((await a.rpc("join_course", { code: course!.joinCode })).error).toBeNull();
    await writeMastery(a, aId, {
      ...initialMastery("steady-state"),
      conceptual: 0.82,
      procedural: 0.7,
      evidenceCount: 5,
      lastEvidenceAt: new Date().toISOString(),
    });
    await writeMastery(a, aId, {
      ...initialMastery("production-function"),
      conceptual: 0.2,
      evidenceCount: 4,
      lastEvidenceAt: new Date().toISOString(),
    });

    // student B: struggling on steady-state (low conceptual), untouched production-function
    const { client: b, userId: bId } = await rawAnonClient();
    expect((await b.rpc("join_course", { code: course!.joinCode })).error).toBeNull();
    await writeMastery(b, bId, {
      ...initialMastery("steady-state"),
      conceptual: 0.25,
      evidenceCount: 3,
      lastEvidenceAt: new Date().toISOString(),
    });

    // teacher reads the class mastery and runs the pure engine over it
    const roster = await fetchRoster(course!.id);
    expect(roster.map((r) => r.userId).sort()).toEqual([aId, bId].sort());

    const classMastery = await fetchClassMastery(course!.id);
    const summaries = classConceptSummary(classMastery, concepts);
    const bySlug = Object.fromEntries(summaries.map((s) => [s.conceptSlug, s]));

    // steady-state: both practiced, exactly one (B) struggling
    expect(bySlug["steady-state"].studentsWithEvidence).toBe(2);
    expect(bySlug["steady-state"].strugglingCount).toBe(1);
    // production-function: only A practiced, and A is struggling
    expect(bySlug["production-function"].studentsWithEvidence).toBe(1);
    expect(bySlug["production-function"].strugglingCount).toBe(1);

    // ranking: both concepts have one struggler → tiebreak on avg conceptual asc.
    // production-function avg conceptual (0.2) < steady-state (~0.535) → ranks first.
    const ranked = reteachRanking(summaries, concepts);
    expect(ranked[0].conceptSlug).toBe("production-function");
    expect(ranked[0].priority).toBe("struggling");
    expect(ranked[0].reason).toContain("conceptual");

    await a.auth.signOut({ scope: "local" });
    await b.auth.signOut({ scope: "local" });
    console.log(`CLEANUP-ANALYTICS course=${course!.id} teacher=${teacherId} studentA=${aId} studentB=${bId}`);
  }, 90_000);
});
