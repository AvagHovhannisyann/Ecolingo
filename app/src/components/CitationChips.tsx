"use client";

import type { Citation } from "@/lib/engine/types";

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

export function UnverifiedBanner() {
  return (
    <p className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900" role="note">
      <strong>Demo course, unverified content.</strong> No teacher materials have been ingested yet, so
      this content is compiled from standard course structure and is marked <em>planned &amp; unverified</em>.
      Citations will attach to real lecture pages once the teacher uploads course files.
    </p>
  );
}
