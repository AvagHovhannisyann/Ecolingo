/**
 * Per-student roster (D-045) — the student-centric view the page lacked, most
 * needing attention first. Rows come from the engine's `studentRoster`; this
 * only labels. Learners are anonymous UUIDs (no PII): a short, stable handle is
 * shown, never a name.
 *
 * Status is always VISIBLE TEXT (the badge), never colour alone (WCAG 1.4.1).
 *
 * Implementation only; reuses existing analytics tokens (Fabel owns aesthetic).
 */

import { pct, type StudentRow, type StudentStatus } from "@/lib/engine/class-analytics";
import { HealthyIcon, NotStartedIcon, RosterIcon, StrugglingIcon } from "./icons";

const STATUS_META: Record<
  StudentStatus,
  { label: string; tierClass: string; Icon: (p: { className?: string }) => React.ReactNode }
> = {
  struggling: { label: "Needs help", tierClass: "analytics-tier--struggling", Icon: StrugglingIcon },
  not_started: { label: "Not started", tierClass: "analytics-tier--not_started", Icon: NotStartedIcon },
  on_track: { label: "On track", tierClass: "analytics-tier--healthy", Icon: HealthyIcon },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function StudentRosterTable({ rows }: { rows: StudentRow[] }) {
  return (
    <section aria-labelledby="roster-heading">
      <h2 id="roster-heading" className="analytics-section-heading">
        <RosterIcon className="h-6 w-6" />
        Students
      </h2>
      <p className="mt-1 text-sm text-app-muted">
        Each enrolled learner, most needing attention first. Anonymous — no names, no single grade.
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const meta = STATUS_META[row.status];
          const Icon = meta.Icon;
          return (
            <li key={row.userId} className={`analytics-tier-card ${meta.tierClass}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-bold">
                  Student <span className="font-mono text-sm">{row.shortId}</span>
                </p>
                <span className="analytics-tier-badge">
                  <Icon className="h-4 w-4" />
                  {meta.label}
                </span>
              </div>
              <dl className="analytics-evidence">
                <div className="analytics-evidence__stat">
                  <dt>Coverage</dt>
                  <dd>
                    {row.conceptsStarted} of {row.conceptsTotal}
                  </dd>
                </div>
                <div className="analytics-evidence__stat">
                  <dt>Avg conceptual</dt>
                  <dd>{row.conceptsStarted > 0 ? `${pct(row.avgConceptual)}%` : "—"}</dd>
                </div>
                {row.strugglingConcepts > 0 && (
                  <div className="analytics-evidence__stat analytics-evidence__stat--red">
                    <dt>Struggling on</dt>
                    <dd>
                      {row.strugglingConcepts} concept{row.strugglingConcepts === 1 ? "" : "s"}
                    </dd>
                  </div>
                )}
                <div className="analytics-evidence__stat">
                  <dt>Last active</dt>
                  <dd>{formatDate(row.lastActiveAt)}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
