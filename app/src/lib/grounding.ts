"use client";

/**
 * Bridges teacher-approved links to the learner-facing citation display
 * (GATE-001). A concept's citations upgrade from the pending marker to real
 * page-level sources the moment the teacher approves a link — and only then.
 */

import type { Citation } from "./engine/types";
import { citationFromLink } from "./engine/ingest";
import { useTeacherState } from "./teacher-store";

export function useGroundedCitations(conceptSlug: string, fallback: Citation[]): Citation[] {
  const teacher = useTeacherState();
  if (!teacher) return fallback;
  const grounded: Citation[] = [];
  for (const link of teacher.approvedLinks) {
    if (link.conceptSlug !== conceptSlug) continue;
    const doc = teacher.docs.find((d) => d.id === link.docId);
    const section = doc?.sections.find((s) => s.id === link.sectionId);
    if (doc && section) grounded.push(citationFromLink(doc, section, conceptSlug));
  }
  return grounded.length > 0 ? grounded : fallback;
}

/** true once ANY concept has a teacher-approved source (drives the banner) */
export function useHasGroundedContent(): boolean {
  const teacher = useTeacherState();
  return (teacher?.approvedLinks.length ?? 0) > 0;
}
