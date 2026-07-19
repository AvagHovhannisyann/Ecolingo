/**
 * "Reteach next" — the star of class analytics, rendered as prioritized tier
 * cards. Every field on screen comes straight off the engine's `ReteachItem`
 * (src/lib/engine/class-analytics.ts, reteachRanking) — this component only
 * arranges and labels, it computes nothing.
 *
 * Tier is always shown as VISIBLE TEXT (the pill label), never carried by
 * border colour alone — colour is a reinforcing cue for sighted/colour users,
 * not the only signal (WCAG 1.4.1).
 */

import type { ReteachItem, ReteachPriority } from "@/lib/engine/class-analytics";
import { FlagIcon, HealthyIcon, NotStartedIcon, StrugglingIcon } from "./icons";

const TIER_META: Record<
  ReteachPriority,
  { label: string; tierClass: string; Icon: (p: { className?: string }) => React.ReactNode }
> = {
  struggling: { label: "Reteach", tierClass: "analytics-tier--struggling", Icon: StrugglingIcon },
  not_started: { label: "Not started", tierClass: "analytics-tier--not_started", Icon: NotStartedIcon },
  healthy: { label: "On track", tierClass: "analytics-tier--healthy", Icon: HealthyIcon },
};

export function ReteachRanking({ items }: { items: ReteachItem[] }) {
  return (
    <section aria-labelledby="reteach-heading">
      <h2 id="reteach-heading" className="analytics-section-heading">
        <FlagIcon className="h-6 w-6" />
        Reteach next
      </h2>
      <p className="mt-1 text-sm text-app-muted">
        Ranked by where the class is struggling most. Each card explains why.
      </p>
      <ol className="mt-3 space-y-3">
        {items.map((item, i) => {
          const tier = TIER_META[item.priority];
          const Icon = tier.Icon;
          return (
            <li key={item.conceptSlug} className={`analytics-tier-card ${tier.tierClass}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex items-center gap-2 font-bold">
                  <span className="analytics-rank" aria-label={`Priority ${i + 1}`}>
                    {i + 1}
                  </span>
                  {item.conceptName}
                </p>
                <span className="analytics-tier-badge">
                  <Icon className="h-4 w-4" />
                  {tier.label}
                </span>
              </div>

              <p className="mt-2 text-sm text-app">{item.reason}</p>

              <dl className="analytics-evidence">
                <div className="analytics-evidence__stat">
                  <dt>Practiced</dt>
                  <dd>
                    {item.studentsWithEvidence} of {item.totalStudents}
                  </dd>
                </div>
                {item.priority === "struggling" && (
                  <div className="analytics-evidence__stat analytics-evidence__stat--red">
                    <dt>Struggling</dt>
                    <dd>{item.strugglingCount}</dd>
                  </div>
                )}
              </dl>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
