/**
 * Student spread — per-concept distribution of the class across the three
 * conceptual buckets, as labeled horizontal bars.
 *
 * Every bucket count is a tally of `studentSpread()`'s own per-student output
 * (src/lib/engine/class-analytics.ts) — grouping already-classified students
 * into their already-assigned bucket is not a new metric, and nothing here
 * blends dimensions into one score (§22). Thresholds shown are the engine's
 * own exported constants (STRUGGLING_CONCEPTUAL / STRONG_CONCEPTUAL), not
 * re-typed numbers.
 *
 * Zero-evidence concepts stay honest text ("no evidence yet"), never an
 * empty/zero-width chart.
 */

import type { Concept } from "@/lib/engine/types";
import {
  pct,
  STRONG_CONCEPTUAL,
  STRUGGLING_CONCEPTUAL,
  studentSpread,
  type ConceptSummary,
  type SpreadBucket,
} from "@/lib/engine/class-analytics";
import type { ClassMastery } from "@/lib/course";
import { SpreadIcon } from "./icons";

const BUCKET_ORDER: SpreadBucket[] = ["strong", "developing", "struggling"];

const BUCKET_META: Record<SpreadBucket, { label: string; hint: string; className: string }> = {
  strong: {
    label: "Strong",
    hint: `≥${pct(STRONG_CONCEPTUAL)}%`,
    className: "analytics-spread-bar__fill--green",
  },
  developing: {
    label: "Developing",
    hint: `${pct(STRUGGLING_CONCEPTUAL)}–${pct(STRONG_CONCEPTUAL)}%`,
    className: "analytics-spread-bar__fill--blue",
  },
  struggling: {
    label: "Struggling",
    hint: `<${pct(STRUGGLING_CONCEPTUAL)}%`,
    className: "analytics-spread-bar__fill--red",
  },
};

function countBuckets(mastery: ClassMastery, conceptSlug: string): Record<SpreadBucket, number> {
  const counts: Record<SpreadBucket, number> = { strong: 0, developing: 0, struggling: 0 };
  for (const entry of studentSpread(mastery, conceptSlug)) counts[entry.bucket] += 1;
  return counts;
}

function ConceptSpreadRow({
  concept,
  summary,
  mastery,
}: {
  concept: Pick<Concept, "slug" | "name">;
  summary: ConceptSummary | undefined;
  mastery: ClassMastery;
}) {
  const withEvidence = summary?.studentsWithEvidence ?? 0;
  const bucketCounts = withEvidence > 0 ? countBuckets(mastery, concept.slug) : null;

  return (
    <div className="analytics-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">{concept.name}</p>
        <span className="stat-chip text-xs">
          {withEvidence} of {summary?.totalStudents ?? 0} practiced
        </span>
      </div>

      {withEvidence === 0 ? (
        <p className="mt-2 text-sm text-app-muted">No evidence yet — nobody has practiced this concept.</p>
      ) : (
        <>
          <div
            className="mt-3 space-y-2"
            role="group"
            aria-label={`${concept.name} student spread, ${withEvidence} of ${summary?.totalStudents ?? 0} practiced`}
          >
            {BUCKET_ORDER.map((bucket) => {
              const count = bucketCounts?.[bucket] ?? 0;
              const width = withEvidence > 0 ? Math.round((count / withEvidence) * 100) : 0;
              const meta = BUCKET_META[bucket];
              return (
                <div key={bucket}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-app">
                      {meta.label} <span className="text-app-faint">({meta.hint})</span>
                    </span>
                    <span className="tabular-nums text-app">
                      {count} of {withEvidence}
                    </span>
                  </div>
                  <div
                    className="analytics-spread-bar mt-1"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={withEvidence}
                    aria-valuenow={count}
                    aria-valuetext={`${count} of ${withEvidence} students ${meta.label.toLowerCase()}`}
                    aria-label={`${concept.name}, ${meta.label}`}
                  >
                    <div className={`analytics-spread-bar__fill ${meta.className}`} style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {summary && summary.notStartedCount > 0 && (
            <p className="mt-3 text-xs text-app-muted">
              {summary.notStartedCount} of {summary.totalStudents} student
              {summary.totalStudents === 1 ? "" : "s"} {summary.notStartedCount === 1 ? "hasn't" : "haven't"} started
              this concept yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function StudentSpread({
  concepts,
  mastery,
  summaryBySlug,
}: {
  concepts: readonly Pick<Concept, "slug" | "name">[];
  mastery: ClassMastery;
  summaryBySlug: Map<string, ConceptSummary>;
}) {
  return (
    <section aria-labelledby="spread-heading">
      <h2 id="spread-heading" className="analytics-section-heading">
        <SpreadIcon className="h-6 w-6" />
        Student spread
      </h2>
      <p className="mt-1 text-sm text-app-muted">
        How the class splits across conceptual understanding, per concept. Every bar is labeled with the count, not
        just its color.
      </p>
      <div className="mt-3 space-y-3">
        {concepts.map((c) => (
          <ConceptSpreadRow key={c.slug} concept={c} summary={summaryBySlug.get(c.slug)} mastery={mastery} />
        ))}
      </div>
    </section>
  );
}
