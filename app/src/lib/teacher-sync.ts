"use client";

/**
 * Teacher-content sync (Phase 2, D-009): mirrors learner sync.ts. localStorage
 * is the instant layer; Supabase (source_documents + concept_links) is the
 * durable one, so a teacher's uploads and approvals survive reload / new
 * device. Owner-scoped RLS keeps each teacher's review work isolated
 * (course-wide published grounding is Phase 3). Every failure surfaces through
 * the shared SyncStatus channel — nothing fails silently (GATE-009).
 */

import type { DocSection, ProposedLink, TeacherDoc } from "./engine/ingest";
import type { ApprovedLink, TeacherState } from "./teacher-state";
import { emptyTeacherState } from "./teacher-state";
import { ensureSession, getSupabase } from "./supabase";
import { setStatus } from "./sync";

/** pull the teacher's own docs + links; null when Supabase is unconfigured */
export async function hydrateTeacherRemote(): Promise<TeacherState | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    setStatus("syncing");
    const userId = await ensureSession();
    if (!userId) {
      setStatus("error");
      return null;
    }
    const [docsRes, linksRes] = await Promise.all([
      supabase.from("source_documents").select("*").eq("owner_id", userId),
      supabase.from("concept_links").select("*").eq("owner_id", userId),
    ]);
    if (docsRes.error || linksRes.error) {
      setStatus("error");
      return null;
    }
    setStatus("synced");
    const docs: TeacherDoc[] = (docsRes.data ?? []).map((d) => ({
      id: d.doc_id,
      title: d.title,
      uploadedAtISO: d.uploaded_at,
      charCount: d.char_count,
      sections: (d.sections ?? []) as DocSection[],
    }));
    const approvedLinks: ApprovedLink[] = [];
    const rejectedKeys: string[] = [];
    for (const l of linksRes.data ?? []) {
      const base: ProposedLink & { docId: string } = {
        docId: l.doc_id,
        sectionId: l.section_id,
        conceptSlug: l.concept_slug,
        score: l.score,
        matchedTerms: l.matched_terms ?? [],
      };
      if (l.status === "approved") {
        approvedLinks.push({ ...base, approvedAtISO: l.approved_at ?? l.updated_at });
      } else {
        rejectedKeys.push(`${l.doc_id}:${l.section_id}:${l.concept_slug}`);
      }
    }
    return { ...emptyTeacherState(), docs, approvedLinks, rejectedKeys };
  } catch {
    setStatus("error");
    return null;
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: TeacherState | null = null;

/** debounced write-through; fire-and-forget from the store */
export function scheduleTeacherPush(state: TeacherState): void {
  if (!getSupabase()) return; // local-only mode
  pending = state;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const s = pending;
    pending = null;
    if (s) void pushTeacher(s);
  }, 800);
}

async function pushTeacher(state: TeacherState): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    setStatus("syncing");
    const userId = await ensureSession();
    if (!userId) {
      setStatus("error");
      return;
    }

    // documents: upsert current set, then delete any the teacher removed
    const docRows = state.docs.map((d) => ({
      owner_id: userId,
      doc_id: d.id,
      title: d.title,
      uploaded_at: d.uploadedAtISO,
      char_count: d.charCount,
      sections: d.sections,
    }));
    const docUp = docRows.length
      ? supabase.from("source_documents").upsert(docRows)
      : Promise.resolve({ error: null });

    // links: approved + rejected become status rows; delete anything stale
    const rejected = state.rejectedKeys.map((k) => {
      const [docId, sectionId, conceptSlug] = k.split(":");
      return { docId, sectionId, conceptSlug };
    });
    const linkRows = [
      ...state.approvedLinks.map((l) => ({
        owner_id: userId,
        doc_id: l.docId,
        section_id: l.sectionId,
        concept_slug: l.conceptSlug,
        score: l.score,
        matched_terms: l.matchedTerms,
        status: "approved" as const,
        approved_at: l.approvedAtISO,
      })),
      ...rejected.map((r) => ({
        owner_id: userId,
        doc_id: r.docId,
        section_id: r.sectionId,
        concept_slug: r.conceptSlug,
        score: 0,
        matched_terms: [] as string[],
        status: "rejected" as const,
        approved_at: null,
      })),
    ];
    const linkUp = linkRows.length
      ? supabase.from("concept_links").upsert(linkRows)
      : Promise.resolve({ error: null });

    const results = await Promise.all([docUp, linkUp]);
    if (results.some((r) => r.error)) {
      setStatus("error");
      return;
    }

    // prune remote rows for docs the teacher removed locally. A link is only
    // ever orphaned when its parent doc is removed (approve/reject always keep
    // the link in one of the two sets), so pruning both tables by doc_id is
    // sufficient and idempotent.
    const keepDocIds = state.docs.map((d) => d.id);
    for (const table of ["source_documents", "concept_links"] as const) {
      const del = supabase.from(table).delete().eq("owner_id", userId);
      await (keepDocIds.length > 0
        ? del.not("doc_id", "in", `(${keepDocIds.map((d) => `"${d}"`).join(",")})`)
        : del);
    }
    setStatus("synced");
  } catch {
    setStatus("error");
  }
}
