/**
 * Live integration test for the Phase 2 teacher-content sync (D-009).
 * Opt-in: runs only when RUN_SYNC_INTEGRATION=1 and Supabase env vars are set.
 * Exercises the real teacher-sync.ts hydrate/push against the live project,
 * including the owner-scoped RLS boundary on source_documents/concept_links.
 *
 *   RUN_SYNC_INTEGRATION=1 NEXT_PUBLIC_SUPABASE_URL=... \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... npx vitest run src/lib/__tests__/teacher-sync.integration.test.ts
 */

import { beforeAll, describe, expect, it } from "vitest";
import { sectionize, proposeLinks } from "../engine/ingest";
import { SAMPLE_LECTURE_MD, SAMPLE_LECTURE_TITLE } from "../../content/econ13210/sample-lecture";
import { concepts } from "../../content/econ13210";
import { addDoc, approveLink, emptyTeacherState, rejectLink } from "../teacher-state";

const enabled =
  process.env.RUN_SYNC_INTEGRATION === "1" &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const d = describe.skipIf(!enabled);

d("teacher-content sync against live Supabase (owner-scoped)", () => {
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

  it("pushes uploaded docs + approvals and re-hydrates them faithfully", async () => {
    const { getSupabase } = await import("../supabase");
    await getSupabase()!.auth.signOut(); // isolate this run under a fresh anon user
    const { hydrateTeacherRemote, scheduleTeacherPush } = await import("../teacher-sync");

    // build a real teacher state: ingest the sample lecture, approve one link,
    // reject another — the exact shape the store persists
    const doc = sectionize(SAMPLE_LECTURE_TITLE, SAMPLE_LECTURE_MD, new Date().toISOString());
    const proposals = proposeLinks(doc, concepts);
    const approved = proposals.find((p) => p.conceptSlug === "steady-state")!;
    const rejected = proposals.find((p) => p.conceptSlug !== "steady-state")!;

    let state = addDoc(emptyTeacherState(), doc);
    state = approveLink(state, doc.id, approved, new Date().toISOString());
    state = rejectLink(state, doc.id, rejected);

    scheduleTeacherPush(state);
    await new Promise((r) => setTimeout(r, 3500)); // debounce + network

    const back = await hydrateTeacherRemote();
    expect(back).not.toBeNull();
    expect(back!.docs.map((x) => x.id)).toContain(doc.id);
    const backDoc = back!.docs.find((x) => x.id === doc.id)!;
    expect(backDoc.sections.length).toBe(doc.sections.length);
    expect(backDoc.title).toBe(SAMPLE_LECTURE_TITLE);
    // approved link survives with its concept + section intact
    const backApproved = back!.approvedLinks.find(
      (l) => l.docId === doc.id && l.conceptSlug === "steady-state"
    );
    expect(backApproved?.sectionId).toBe(approved.sectionId);
    // rejected link is remembered as rejected, never as an approval
    expect(back!.approvedLinks.some((l) => l.conceptSlug === rejected.conceptSlug)).toBe(false);
    expect(back!.rejectedKeys).toContain(`${doc.id}:${rejected.sectionId}:${rejected.conceptSlug}`);
  }, 30_000);

  it("RLS: a fresh anonymous user cannot see another teacher's uploads (GATE-005)", async () => {
    const { getSupabase } = await import("../supabase");
    await getSupabase()!.auth.signOut(); // new anon user on next call
    const { hydrateTeacherRemote } = await import("../teacher-sync");
    const other = await hydrateTeacherRemote();
    expect(other).not.toBeNull();
    expect(other!.docs).toHaveLength(0);
    expect(other!.approvedLinks).toHaveLength(0);
  }, 30_000);
});
