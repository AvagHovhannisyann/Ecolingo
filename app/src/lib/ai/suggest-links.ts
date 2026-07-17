"use client";

/**
 * Client wrapper for AI-assisted ingestion (D-011). Sends the teacher's
 * document sections to the same-origin /api/suggest-links route and returns
 * validated AI link suggestions (origin: "ai"). These are advisory only — they
 * flow into the same review queue and require teacher approval like any other
 * proposal (GATE-001). On any error it returns [] so the queue degrades to the
 * deterministic proposals with no broken UI (GATE-009).
 */

import type { ProposedLink, TeacherDoc } from "../engine/ingest";

export async function suggestLinksForDoc(doc: TeacherDoc): Promise<ProposedLink[]> {
  try {
    const res = await fetch("/api/suggest-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: doc.sections.map((s) => ({ id: s.id, heading: s.heading, text: s.text })),
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { suggestions?: ProposedLink[] };
    return Array.isArray(data.suggestions) ? data.suggestions : [];
  } catch {
    return [];
  }
}
