"use client";

import type { Citation } from "@/lib/engine/types";
import { useGroundedCitations, useHasGroundedContent } from "@/lib/grounding";

/**
 * Source provenance display (GATE-001, IDEA-181/182).
 * Verified citations show their page-level label; unverified content is
 * clearly flagged, never dressed up as a real source.
 */
export function CitationChips({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Sources">
      {citations.map((c) => (
        <li
          key={c.id}
          className={
            c.status === "planned_unverified"
              ? "rounded-full border border-amber-400 bg-amber-50 px-3 py-1 text-xs text-amber-900"
              : "rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs"
          }
        >
          {c.status === "planned_unverified" ? "⚠ " : "📄 "}
          {c.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Like CitationChips, but upgrades the pending marker to the concept's
 * teacher-approved sources when they exist (GATE-001 grounding bridge).
 */
export function GroundedCitationChips({ conceptSlug, fallback }: { conceptSlug: string; fallback: Citation[] }) {
  const citations = useGroundedCitations(conceptSlug, fallback);
  return <CitationChips citations={citations} />;
}

export function UnverifiedBanner({ conceptSlug }: { conceptSlug?: string }) {
  const anyGrounded = useHasGroundedContent();
  const conceptCitations = useGroundedCitations(conceptSlug ?? "", []);
  if (conceptSlug && conceptCitations.length > 0) {
    return (
      <p
        className="rounded-xl border border-[var(--growth-green)] bg-[var(--growth-green-tint)] p-3 text-sm text-[var(--deep-ink)]"
        role="note"
      >
        <strong>Teacher-verified sources attached.</strong> This concept is grounded in your teacher&apos;s
        uploaded materials — see the source chips on each step.
      </p>
    );
  }
  if (anyGrounded) {
    return (
      <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900" role="note">
        <strong>Partially grounded course.</strong> Some concepts already cite the teacher&apos;s uploaded
        materials; the rest remain <em>planned &amp; unverified</em> until more sources are approved in the{" "}
        <a href="/teach" className="underline">
          teacher review queue
        </a>
        .
      </p>
    );
  }
  return (
    <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900" role="note">
      <strong>Demo course, unverified content.</strong> No teacher materials have been ingested yet, so
      this content is compiled from standard course structure and is marked <em>planned &amp; unverified</em>.
      Citations will attach to real lecture pages once the teacher uploads course files.
    </p>
  );
}
