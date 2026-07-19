/**
 * Status cards for the non-data phases of class analytics: loading, the
 * honest offline degrade (GATE-009 — Supabase unreachable/unconfigured), and
 * the zero-enrollment empty state. Copy is preserved verbatim from the
 * pre-restyle version; only the chrome changed.
 */

import type { CourseSummary } from "@/lib/course";
import { CloudOfflineIcon } from "./icons";

export function LoadingCard() {
  return (
    <div className="analytics-card mt-4">
      <p className="text-sm text-app-muted" role="status">
        Loading class data…
      </p>
    </div>
  );
}

export function OfflineCard() {
  return (
    <div className="analytics-card analytics-card--status mt-4" role="status">
      <span className="analytics-tile__icon analytics-tile__icon--neutral" aria-hidden>
        <CloudOfflineIcon className="h-7 w-7" />
      </span>
      <div>
        <h2 className="font-bold">Cloud connection needed</h2>
        <p className="mt-1 text-sm text-app-muted">
          Class analytics reads your enrolled learners&apos; mastery from the cloud. Once you&apos;re online and
          students have joined with your class code, their progress — and what to reteach next — appears here.
          Nothing to see yet is not an error.
        </p>
      </div>
    </div>
  );
}

export function EmptyCard({ course }: { course: CourseSummary }) {
  return (
    <div className="analytics-card mt-4">
      <h2 className="font-bold">{course.title}</h2>
      <div className="analytics-joincode mt-3">
        <p className="text-xs text-app-muted">Class join code — learners enter this to enroll</p>
        <p className="analytics-joincode__code">{course.joinCode}</p>
      </div>
      <p className="mt-3 text-sm text-app-muted" role="status">
        No students have enrolled yet. Share your join code — once learners join and start practicing, their mastery
        and your reteach priorities show up here.
      </p>
    </div>
  );
}
