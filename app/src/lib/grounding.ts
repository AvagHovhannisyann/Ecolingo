"use client";

/**
 * Bridges teacher-approved links to the learner-facing citation display
 * (GATE-001). A concept's citations upgrade from the pending marker to real
 * page-level sources the moment the teacher approves a link — and only then.
 *
 * Two sources are merged: the local teacher store (the teacher's own instant,
 * possibly-offline work) and Supabase published grounding (approved course
 * content from any teacher, so every learner sees it — Phase 3, D-012).
 */

import type { Citation } from "./engine/types";
import { citationFromLink } from "./engine/ingest";
import { useTeacherState } from "./teacher-store";
import { usePublishedGrounding } from "./published-grounding";

function localCitations(
  teacher: ReturnType<typeof useTeacherState>,
  conceptSlug: string
): Citation[] {
  if (!teacher) return [];
  const out: Citation[] = [];
  for (const link of teacher.approvedLinks) {
    if (link.conceptSlug !== conceptSlug) continue;
    const doc = teacher.docs.find((d) => d.id === link.docId);
    const section = doc?.sections.find((s) => s.id === link.sectionId);
    if (doc && section) out.push(citationFromLink(doc, section, conceptSlug));
  }
  return out;
}

export function useGroundedCitations(conceptSlug: string, fallback: Citation[]): Citation[] {
  const teacher = useTeacherState();
  const published = usePublishedGrounding();

  const merged: Citation[] = [...localCitations(teacher, conceptSlug), ...(published?.[conceptSlug] ?? [])];
  // de-dupe by citation id (local + remote often describe the same source)
  const byId = new Map<string, Citation>();
  for (const c of merged) byId.set(c.id, c);
  const citations = [...byId.values()];
  return citations.length > 0 ? citations : fallback;
}

/** true once ANY concept has a teacher-approved source (drives the banner) */
export function useHasGroundedContent(): boolean {
  const teacher = useTeacherState();
  const published = usePublishedGrounding();
  const localCount = teacher?.approvedLinks.length ?? 0;
  const publishedCount = published ? Object.values(published).reduce((n, cs) => n + cs.length, 0) : 0;
  return localCount + publishedCount > 0;
}
