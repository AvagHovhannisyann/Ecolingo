/**
 * Source suggester (D-036). Pure and deterministic.
 *
 * For each concept in the teacher's ratified plan, find the section of their
 * uploaded material that best grounds it — by transparent term overlap (reuses
 * the same `proposeLinks` matcher the review queue uses). Nothing AI here: it
 * shows exactly which words matched, so a teacher can trust and approve it.
 */

import type { Concept } from "./types";
import { proposeLinks, type TeacherDoc } from "./ingest";

export interface SourceMatch {
  conceptSlug: string;
  conceptName: string;
  docTitle: string;
  sectionHeading: string;
  score: number;
  matchedTerms: string[];
}

export interface ConceptSources {
  conceptSlug: string;
  conceptName: string;
  /** best matches across all documents, strongest first (may be empty) */
  matches: SourceMatch[];
}

/**
 * Best source sections per concept across every uploaded document. Each
 * concept keeps up to `perConcept` strongest matches; concepts with no match
 * are still listed (empty matches) so the teacher sees what's ungrounded.
 */
export function bestSourcesForConcepts(
  docs: TeacherDoc[],
  concepts: Concept[],
  perConcept = 2,
): ConceptSources[] {
  return concepts.map((c) => {
    const matches: SourceMatch[] = [];
    for (const doc of docs) {
      const headingById = new Map(doc.sections.map((s) => [s.id, s.heading]));
      for (const link of proposeLinks(doc, [c])) {
        matches.push({
          conceptSlug: c.slug,
          conceptName: c.name,
          docTitle: doc.title,
          sectionHeading: headingById.get(link.sectionId) ?? link.sectionId,
          score: link.score,
          matchedTerms: link.matchedTerms,
        });
      }
    }
    matches.sort((a, b) => b.score - a.score || a.sectionHeading.localeCompare(b.sectionHeading));
    return { conceptSlug: c.slug, conceptName: c.name, matches: matches.slice(0, perConcept) };
  });
}
