"use client";

/**
 * Client wrapper for the AI item-writer (D-014). Requests drafted MC questions
 * for a concept from the same-origin /api/draft-questions route. Drafts are
 * advisory — the teacher confirms the answer and approves before they go live.
 * On any error returns [] (GATE-009).
 */

import type { DraftQuestion, QuestionTier } from "../engine/authored";
import type { TeachingStyle } from "../engine/teaching-style";

export async function draftQuestionsForConcept(input: {
  conceptName: string;
  definition: string;
  sectionText: string;
  count?: number;
  /** D-044: difficulty tier that shapes the batch (easy/medium/hard/mixed) */
  tier?: QuestionTier;
  /** D-029: shape the drafted questions to the teacher's voice */
  style?: TeachingStyle | null;
}): Promise<DraftQuestion[]> {
  try {
    const res = await fetch("/api/draft-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { drafts?: DraftQuestion[] };
    return Array.isArray(data.drafts) ? data.drafts : [];
  } catch {
    return [];
  }
}
