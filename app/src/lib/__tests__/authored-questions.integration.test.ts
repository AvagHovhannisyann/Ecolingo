/**
 * Live integration test for Phase 4b authored-question persistence + publishing
 * (D-014). Opt-in (RUN_SYNC_INTEGRATION=1 + Supabase env). Proves the full
 * loop: a teacher approves a question on one account, it survives round-trip to
 * Supabase, a learner on a DIFFERENT account reads it via the published-read RLS
 * policy, and removing it locally prunes the remote row.
 *
 *   RUN_SYNC_INTEGRATION=1 NEXT_PUBLIC_SUPABASE_URL=... \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
 *   npx vitest run src/lib/__tests__/authored-questions.integration.test.ts
 */

import { beforeAll, describe, expect, it } from "vitest";
import { toAuthoredQuestion, type DraftQuestion } from "../engine/authored";
import { addAuthoredQuestion, emptyTeacherState, removeAuthoredQuestion } from "../teacher-state";

const enabled =
  process.env.RUN_SYNC_INTEGRATION === "1" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const d = describe.skipIf(!enabled);

// a draft the teacher will ratify into a real mc_single question
const KEEP_DRAFT: DraftQuestion = {
  stem: "In the Solow model at the steady state, what happens to capital per worker?",
  options: ["It stays constant", "It grows without bound", "It falls to zero", "It oscillates"],
  suggestedIndex: 0,
  rationale: "Steady state means k is unchanging.",
};
const PRUNE_DRAFT: DraftQuestion = {
  stem: "Phase4b prune probe: which quantity is unchanging at the Solow steady state?",
  options: ["Capital per worker", "Total population", "The savings rate", "Depreciation"],
  suggestedIndex: 0,
  rationale: "temp row that will be pruned",
};

const keepQuestion = toAuthoredQuestion(KEEP_DRAFT, "steady-state", 0);
const pruneQuestion = toAuthoredQuestion(PRUNE_DRAFT, "steady-state", 0);

let teacherId: string | null = null;

d("authored-question persistence + publishing (Phase 4b, D-014)", () => {
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

  it("round-trips authored questions and prunes removed ones within account A", async () => {
    const { getSupabase, ensureSession } = await import("../supabase");
    await getSupabase()!.auth.signOut(); // isolate this run under a fresh anon user (account A)
    teacherId = await ensureSession();
    const { hydrateTeacherRemote, scheduleTeacherPush } = await import("../teacher-sync");

    // approve both questions, push, and confirm both round-trip
    let state = addAuthoredQuestion(emptyTeacherState(), keepQuestion);
    state = addAuthoredQuestion(state, pruneQuestion);
    scheduleTeacherPush(state);
    await new Promise((r) => setTimeout(r, 3500)); // debounce + network

    const back = await hydrateTeacherRemote();
    expect(back).not.toBeNull();
    const backIds = back!.authoredQuestions.map((q) => q.id);
    expect(backIds).toContain(keepQuestion.id);
    expect(backIds).toContain(pruneQuestion.id);
    const backKeep = back!.authoredQuestions.find((q) => q.id === keepQuestion.id)!;
    expect(backKeep.type).toBe("mc_single");
    expect(backKeep.provenance).toBe("ai_approved");
    expect(backKeep.conceptSlug).toBe("steady-state");

    // remove the prune probe locally, push, and confirm the remote row is gone
    const pruned = removeAuthoredQuestion(state, pruneQuestion.id);
    scheduleTeacherPush(pruned);
    await new Promise((r) => setTimeout(r, 3500));

    const after = await hydrateTeacherRemote();
    const afterIds = after!.authoredQuestions.map((q) => q.id);
    expect(afterIds).toContain(keepQuestion.id); // survivor stays for the cross-account read
    expect(afterIds).not.toContain(pruneQuestion.id); // prune verified
  }, 40_000);

  it("cross-account publish: fresh account B sees the question via published read", async () => {
    const { getSupabase, ensureSession } = await import("../supabase");
    await getSupabase()!.auth.signOut(); // brand-new account B
    const learnerId = await ensureSession();
    const { fetchPublishedQuestions } = await import("../published-questions");
    const published = await fetchPublishedQuestions();

    expect(learnerId).not.toBe(teacherId); // genuinely different accounts
    const found = published.find((q) => q.id === keepQuestion.id);
    expect(found).toBeTruthy();
    expect(found!.provenance).toBe("ai_approved");
    expect(found!.type).toBe("mc_single");
    if (found!.type === "mc_single") {
      expect(found!.answerKey.correctOptionId).toBe(keepQuestion.answerKey.correctOptionId);
    }
  }, 40_000);
});
