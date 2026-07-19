/**
 * Summary stat tiles — the top-of-dashboard "at a glance" row.
 *
 * Every number is a plain tally of engine-classified output, never an
 * invented aggregate: `studentCount` is the roster length, and the concept
 * counts are the reteach-ranking tiers (`reteachRanking` from
 * class-analytics.ts) grouped by their own `priority` field. No score is
 * blended across dimensions (§22) — these are counts of things the engine
 * already labelled, not new math.
 */

import { HealthyIcon, RosterIcon, StrugglingIcon } from "./icons";

export function StatTiles({
  studentCount,
  strugglingCount,
  healthyCount,
}: {
  studentCount: number;
  strugglingCount: number;
  healthyCount: number;
}) {
  return (
    <ul className="analytics-tiles" aria-label="Class summary">
      <li className="analytics-tile">
        <span className="analytics-tile__icon analytics-tile__icon--blue">
          <RosterIcon className="h-7 w-7" />
        </span>
        <span className="analytics-tile__number">{studentCount}</span>
        <span className="analytics-tile__label">
          student{studentCount === 1 ? "" : "s"} enrolled
        </span>
      </li>
      <li className="analytics-tile analytics-tile--struggling">
        <span className="analytics-tile__icon analytics-tile__icon--red">
          <StrugglingIcon className="h-7 w-7" />
        </span>
        <span className="analytics-tile__number">{strugglingCount}</span>
        <span className="analytics-tile__label">
          concept{strugglingCount === 1 ? "" : "s"} struggling
        </span>
      </li>
      <li className="analytics-tile analytics-tile--healthy">
        <span className="analytics-tile__icon analytics-tile__icon--green">
          <HealthyIcon className="h-7 w-7" />
        </span>
        <span className="analytics-tile__number">{healthyCount}</span>
        <span className="analytics-tile__label">
          concept{healthyCount === 1 ? "" : "s"} on track
        </span>
      </li>
    </ul>
  );
}
