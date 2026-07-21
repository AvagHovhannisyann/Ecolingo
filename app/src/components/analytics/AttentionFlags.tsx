/**
 * Attention flags (D-045) — two cohorts the mastery model captures but the page
 * used to ignore: OVERCONFIDENT students (confident yet below the floor) and
 * FADING RETENTION (learned but decaying). Both come straight from the engine
 * (`overconfidenceRanking` / `retentionRiskRanking`); this only arranges them.
 *
 * The whole section renders nothing when there is nothing to flag, so it never
 * adds noise to a healthy class.
 *
 * Implementation only; reuses existing analytics tokens (Fabel owns aesthetic).
 */

import type { ConceptFlag } from "@/lib/engine/class-analytics";
import { FlagIcon } from "./icons";

function FlagList({ title, blurb, items }: { title: string; blurb: string; items: ConceptFlag[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="font-bold">{title}</h3>
      <p className="mt-0.5 text-sm text-app-muted">{blurb}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.conceptSlug} className="analytics-tier-card analytics-tier--struggling">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-bold">{item.conceptName}</p>
              <span className="analytics-tier-badge">
                {item.count} of {item.studentsWithEvidence}
              </span>
            </div>
            <p className="mt-2 text-sm text-app">{item.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AttentionFlags({
  overconfident,
  retentionRisk,
}: {
  overconfident: ConceptFlag[];
  retentionRisk: ConceptFlag[];
}) {
  if (overconfident.length === 0 && retentionRisk.length === 0) return null;
  return (
    <section aria-labelledby="flags-heading">
      <h2 id="flags-heading" className="analytics-section-heading">
        <FlagIcon className="h-6 w-6" />
        Needs a closer look
      </h2>
      <FlagList
        title="Overconfident"
        blurb="Students who feel sure but score below the floor — they won't ask for help."
        items={overconfident}
      />
      <FlagList
        title="Fading retention"
        blurb="Learned earlier, now decaying — a quick spaced review re-anchors it."
        items={retentionRisk}
      />
    </section>
  );
}
