/**
 * Live integration test for Phase 3 published grounding (D-012).
 * Opt-in (RUN_SYNC_INTEGRATION=1 + Supabase env). Proves the whole point of a
 * "course compiler": a teacher approves a source on one account, and a learner
 * on a DIFFERENT account sees the real citation — via the published-read RLS
 * policy, not the owner policy.
 *
 *   RUN_SYNC_INTEGRATION=1 NEXT_PUBLIC_SUPABASE_URL=... \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... npx vitest run src/lib/__tests__/published-grounding.integration.test.ts
 */

import { beforeAll, describe, expect, it } from "vitest";
import { sectionize, proposeLinks } from "../engine/ingest";
import { SAMPLE_LECTURE_MD, SAMPLE_LECTURE_TITLE } from "../../content/econ13210/sample-lecture";
import { concepts } from "../../content/econ13210";
import { addDoc, approveLink, emptyTeacherState } from "../teacher-state";

const enabled =
  process.env.RUN_SYNC_INTEGRATION === "1" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const d = describe.skipIf(!enabled);

d("published grounding across accounts (Phase 3, D-012)", () => {
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

  it("teacher approves on account A → learner on account B sees the citation", async () => {
    const { getSupabase, ensureSession } = await import("../supabase");

    // --- teacher: account A ---
    await getSupabase()!.auth.signOut();
    const teacherId = await ensureSession();
    const { scheduleTeacherPush } = await import("../teacher-sync");
    const doc = sectionize(SAMPLE_LECTURE_TITLE, SAMPLE_LECTURE_MD, new Date().toISOString());
    const gold = proposeLinks(doc, concepts).find((p) => p.conceptSlug === "golden-rule")!;
    const state = approveLink(addDoc(emptyTeacherState(), doc), doc.id, gold, new Date().toISOString());
    scheduleTeacherPush(state);
    await new Promise((r) => setTimeout(r, 3500)); // debounce + network

    // --- learner: a brand-new account B ---
    await getSupabase()!.auth.signOut();
    const { fetchPublishedGrounding } = await import("../published-grounding");
    const learnerId = await ensureSession();
    const grounding = await fetchPublishedGrounding();

    expect(learnerId).not.toBe(teacherId); // genuinely different accounts
    const golden = grounding["golden-rule"] ?? [];
    expect(golden.length).toBeGreaterThan(0);
    expect(golden[0].status).toBe("verified");
    expect(golden[0].label).toContain("Golden Rule");
  }, 40_000);
});
