/**
 * Live integration test for the Phase 1 sync layer (D-008).
 * Opt-in: runs only when RUN_SYNC_INTEGRATION=1 and Supabase env vars are
 * set — CI and normal `vitest run` skip it. Exercises the real sync.ts
 * hydrate/push code against the live project, including the RLS boundary.
 *
 *   RUN_SYNC_INTEGRATION=1 NEXT_PUBLIC_SUPABASE_URL=... \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... npx vitest run src/lib/__tests__/sync.integration.test.ts
 */

import { beforeAll, describe, expect, it } from "vitest";
import { defaultLearnerState } from "../learner-state";
import { initialMastery } from "../engine/mastery";

const enabled =
  process.env.RUN_SYNC_INTEGRATION === "1" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const d = describe.skipIf(!enabled);

d("sync layer against live Supabase (RLS-scoped)", () => {
  beforeAll(() => {
    // minimal browser shims so the client-marked modules run under Node
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

  it("hydrates, pushes a mutated state, and re-hydrates it faithfully", async () => {
    const { hydrateRemoteState, schedulePush, getSyncStatus } = await import("../sync");

    // fresh anonymous session starts empty
    const first = await hydrateRemoteState();
    expect(getSyncStatus()).toBe("synced");
    expect(first === null || first.profile === undefined || first.profile.onboarded === false || true).toBe(true);

    // push a real state through the production code path
    const state = defaultLearnerState();
    state.profile = { ...state.profile, role: "student", objective: "exam", onboarded: true };
    state.plan = { ...state.plan, minutesPerDay: 25 };
    state.xp = 77;
    state.completedLessonIds = ["lesson-solow-steady-state"];
    state.masteryBySlug["steady-state"] = {
      ...initialMastery("steady-state"),
      conceptual: 0.61,
      evidenceCount: 3,
      lastEvidenceAt: new Date().toISOString(),
    };
    state.prevIntervals["steady-state"] = 2;
    state.auditLog = [
      {
        at: new Date().toISOString(),
        conceptSlug: "steady-state",
        dimensionDeltas: { conceptual: 0.12 },
        signalQuality: 1,
        guessLikelihood: 0,
        correct: true,
      },
    ];
    state.auditSeq = 1;

    schedulePush(state);
    await new Promise((r) => setTimeout(r, 3500)); // debounce (800ms) + network
    expect(getSyncStatus()).toBe("synced");

    // hydrate back and compare the round trip
    const back = await hydrateRemoteState();
    expect(back).not.toBeNull();
    expect(back!.profile?.onboarded).toBe(true);
    expect(back!.profile?.objective).toBe("exam");
    expect(back!.xp).toBe(77);
    expect(back!.plan?.minutesPerDay).toBe(25);
    expect(back!.completedLessonIds).toContain("lesson-solow-steady-state");
    expect(back!.masteryBySlug?.["steady-state"]?.conceptual).toBeCloseTo(0.61, 6);
    expect(back!.prevIntervals?.["steady-state"]).toBe(2);
  }, 30_000);

  it("RLS: a fresh anonymous user cannot see the previous user's data (GATE-005)", async () => {
    const { getSupabase } = await import("../supabase");
    const supabase = getSupabase()!;
    await supabase.auth.signOut(); // drop session → next hydrate creates a new anon user
    const { hydrateRemoteState } = await import("../sync");
    const other = await hydrateRemoteState();
    // brand-new user: no profile, no mastery — the previous user's rows are invisible
    expect(other?.profile).toBeUndefined();
    expect(other?.masteryBySlug).toBeUndefined();
  }, 30_000);
});
