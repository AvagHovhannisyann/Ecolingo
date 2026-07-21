/**
 * Whole-class overview (D-045) — a calm health read above the reteach list.
 * Every number comes from the engine's `classOverview`; this only labels.
 *
 * Implementation only; reuses existing analytics tokens (Fabel owns aesthetic).
 */

import { DIMENSION_LABELS, pct, type ClassOverview as ClassOverviewData } from "@/lib/engine/class-analytics";
import { DimensionsIcon } from "./icons";

export function ClassOverview({ overview }: { overview: ClassOverviewData }) {
  const { totalStudents, activeStudents, conceptsCovered, conceptsTotal, coverage, weakestDimension, weakestDimensionValue } =
    overview;
  return (
    <section aria-labelledby="overview-heading">
      <h2 id="overview-heading" className="analytics-section-heading">
        <DimensionsIcon className="h-6 w-6" />
        Class overview
      </h2>
      <dl className="analytics-evidence mt-3">
        <div className="analytics-evidence__stat">
          <dt>Active</dt>
          <dd>
            {activeStudents} of {totalStudents}
          </dd>
        </div>
        <div className="analytics-evidence__stat">
          <dt>Course coverage</dt>
          <dd>{pct(coverage)}%</dd>
        </div>
        <div className="analytics-evidence__stat">
          <dt>Concepts touched</dt>
          <dd>
            {conceptsCovered} of {conceptsTotal}
          </dd>
        </div>
        <div className="analytics-evidence__stat">
          <dt>Weakest area</dt>
          <dd>
            {weakestDimension ? `${DIMENSION_LABELS[weakestDimension]} · ${pct(weakestDimensionValue)}%` : "—"}
          </dd>
        </div>
      </dl>
      {weakestDimension && (
        <p className="mt-2 text-sm text-app-muted">
          Across everything practiced, the class is weakest on{" "}
          <strong className="text-app">{DIMENSION_LABELS[weakestDimension]}</strong> — worth a targeted activity.
        </p>
      )}
    </section>
  );
}
