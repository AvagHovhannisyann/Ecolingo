/**
 * Mastery by dimension — per-concept class averages across the five learning
 * dimensions (§22: never collapsed into one grade). Averaged only over
 * students who have practiced each concept, straight from `classConceptSummary`
 * (src/lib/engine/class-analytics.ts). This component only arranges numbers
 * the engine already computed.
 */

import type { Concept } from "@/lib/engine/types";
import {
  DIMENSION_LABELS,
  MASTERY_DIMENSIONS,
  pct,
  type ConceptSummary,
} from "@/lib/engine/class-analytics";
import { DimensionsIcon } from "./icons";

export function DimensionBars({
  concepts,
  summaryBySlug,
}: {
  concepts: readonly Pick<Concept, "slug" | "name">[];
  summaryBySlug: Map<string, ConceptSummary>;
}) {
  return (
    <section aria-labelledby="dimensions-heading">
      <h2 id="dimensions-heading" className="analytics-section-heading">
        <DimensionsIcon className="h-6 w-6" />
        Mastery by dimension
      </h2>
      <p className="mt-1 text-sm text-app-muted">
        Class averages across the five learning dimensions — never collapsed into one grade. Averaged over students
        who have practiced each concept.
      </p>
      <div className="mt-3 space-y-3">
        {concepts.map((c) => {
          const s = summaryBySlug.get(c.slug);
          if (!s) return null;
          return (
            <div key={c.slug} className="analytics-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold">{c.name}</p>
                <span className="stat-chip text-xs">
                  {s.studentsWithEvidence} of {s.totalStudents} practiced
                </span>
              </div>
              {s.studentsWithEvidence === 0 ? (
                <p className="mt-2 text-sm text-app-muted">No evidence yet — nobody has practiced this concept.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {MASTERY_DIMENSIONS.map((dim) => {
                    const value = s.avgByDimension[dim];
                    const isWeakest = s.weakestDimension === dim;
                    return (
                      <li key={dim}>
                        <div className="flex items-center justify-between text-xs">
                          <span className={isWeakest ? "font-semibold text-[color:var(--duo-red-text)]" : "text-app"}>
                            {DIMENSION_LABELS[dim]}
                            {isWeakest ? " — weakest" : ""}
                          </span>
                          <span className="tabular-nums text-app">{pct(value)}%</span>
                        </div>
                        <div
                          className="bar-track mt-1 h-3 w-full"
                          role="meter"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={pct(value)}
                          aria-label={`${c.name}, ${DIMENSION_LABELS[dim]} class average`}
                        >
                          <div className="bar-fill" style={{ width: `${pct(value)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
