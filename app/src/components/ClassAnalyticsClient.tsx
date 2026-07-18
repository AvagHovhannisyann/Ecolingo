"use client";

/**
 * Class analytics (Phase 5 — "what do I reteach Thursday?").
 *
 * Reads the owner-only enrollment + mastery substrate (D-015) and turns it into
 * a teacher-actionable view: a ranked "reteach next" list, a colorblind-safe
 * per-concept heatmap, and per-dimension averages that preserve §22.
 *
 * Every number shown comes from the pure engine (src/lib/engine/class-analytics)
 * — this component only arranges and labels. Students are anonymous UUIDs shown
 * as "Student 1..N" in stable enrolledAt order; no PII exists and none is
 * invented. Degrades calmly to an honest offline/empty state (GATE-009): the
 * sandbox browser cannot reach supabase.co, so that is the state it shows — no
 * infinite spinner.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { concepts } from "@/content/econ13210";
import {
  ensureMyCourse,
  fetchClassMastery,
  fetchRoster,
  type ClassMastery,
  type CourseSummary,
  type RosterEntry,
} from "@/lib/course";
import {
  classConceptSummary,
  DIMENSION_LABELS,
  MASTERY_DIMENSIONS,
  pct,
  reteachRanking,
  studentSpread,
  type ReteachPriority,
  type SpreadBucket,
} from "@/lib/engine/class-analytics";

type Phase = "loading" | "offline" | "empty" | "data";

interface LoadState {
  phase: Phase;
  course: CourseSummary | null;
  roster: RosterEntry[];
  mastery: ClassMastery;
}

/** heatmap cell state: a spread bucket, or "none" when the student has no evidence */
type CellState = SpreadBucket | "none";

const CELL_STYLE: Record<CellState, { symbol: string; label: string; className: string }> = {
  strong: {
    symbol: "✓",
    label: "strong",
    className: "bg-[var(--growth-green-tint)] text-[var(--growth-green-text)]",
  },
  developing: {
    symbol: "~",
    label: "developing",
    className: "bg-[var(--model-blue-tint)] text-[var(--model-blue-text)]",
  },
  struggling: {
    symbol: "!",
    label: "struggling",
    className: "bg-[var(--coral-tint)] text-[#cf3d3d]",
  },
  none: {
    symbol: "·",
    label: "no evidence yet",
    className: "bg-[var(--mist-gray)] text-gray-600",
  },
};

const PRIORITY_BADGE: Record<ReteachPriority, { label: string; className: string }> = {
  struggling: {
    label: "Reteach",
    className: "bg-[var(--coral-tint)] text-[#cf3d3d]",
  },
  not_started: {
    label: "Not started",
    className: "bg-[var(--model-blue-tint)] text-[var(--model-blue-text)]",
  },
  healthy: {
    label: "On track",
    className: "bg-[var(--growth-green-tint)] text-[var(--growth-green-text)]",
  },
};

export function ClassAnalyticsClient() {
  const [state, setState] = useState<LoadState>({
    phase: "loading",
    course: null,
    roster: [],
    mastery: {},
  });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const course = await ensureMyCourse("ECON 13210 — Intro to Macroeconomic Models");
      if (!alive) return;
      if (!course) {
        setState({ phase: "offline", course: null, roster: [], mastery: {} });
        return;
      }
      const [roster, mastery] = await Promise.all([fetchRoster(course.id), fetchClassMastery(course.id)]);
      if (!alive) return;
      setState({
        phase: roster.length === 0 ? "empty" : "data",
        course,
        roster,
        mastery,
      });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <div className="mb-4">
        <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
          <span aria-hidden>←</span> Back to teacher workspace
        </Link>
      </div>
      <h1 className="text-2xl font-bold">Class analytics</h1>
      <p className="mt-1 text-sm text-gray-700">
        What your class has mastered, and what to reteach next — from live enrollment and mastery data. No student
        names, no single grade.
      </p>

      {state.phase === "loading" && (
        <div className="card mt-4 p-4">
          <p className="text-sm text-gray-500" role="status">
            Loading class data…
          </p>
        </div>
      )}

      {state.phase === "offline" && <OfflineCard />}

      {state.phase === "empty" && state.course && <EmptyCard course={state.course} />}

      {state.phase === "data" && state.course && (
        <DataView course={state.course} roster={state.roster} mastery={state.mastery} />
      )}
    </div>
  );
}

function OfflineCard() {
  return (
    <div className="card mt-4 p-5" role="status">
      <h2 className="font-bold">Cloud connection needed</h2>
      <p className="mt-1 text-sm text-gray-600">
        Class analytics reads your enrolled learners&apos; mastery from the cloud. Once you&apos;re online and students
        have joined with your class code, their progress — and what to reteach next — appears here. Nothing to see yet
        is not an error.
      </p>
    </div>
  );
}

function EmptyCard({ course }: { course: CourseSummary }) {
  return (
    <div className="card mt-4 p-5">
      <h2 className="font-bold">{course.title}</h2>
      <div className="mt-3 inline-block rounded-xl bg-[var(--growth-green-tint)] px-4 py-3">
        <p className="text-xs text-gray-600">Class join code — learners enter this to enroll</p>
        <p className="font-mono text-2xl font-bold tracking-[0.3em] text-[var(--growth-green-text)]">
          {course.joinCode}
        </p>
      </div>
      <p className="mt-3 text-sm text-gray-600" role="status">
        No students have enrolled yet. Share your join code — once learners join and start practicing, their mastery
        and your reteach priorities show up here.
      </p>
    </div>
  );
}

function DataView({
  course,
  roster,
  mastery,
}: {
  course: CourseSummary;
  roster: RosterEntry[];
  mastery: ClassMastery;
}) {
  // Stable "Student 1..N" labels in enrolledAt order (fetchRoster is ordered asc).
  const studentLabel = useMemo(() => {
    const m = new Map<string, string>();
    roster.forEach((r, i) => m.set(r.userId, `Student ${i + 1}`));
    return m;
  }, [roster]);

  const summaries = useMemo(() => classConceptSummary(mastery, concepts), [mastery]);
  const ranking = useMemo(() => reteachRanking(summaries, concepts), [summaries]);
  const summaryBySlug = useMemo(
    () => new Map(summaries.map((s) => [s.conceptSlug, s])),
    [summaries],
  );

  // per-concept, per-student cell state for the heatmap
  const cellFor = useMemo(() => {
    const byConcept = new Map<string, Map<string, SpreadBucket>>();
    for (const c of concepts) {
      const m = new Map<string, SpreadBucket>();
      for (const e of studentSpread(mastery, c.slug)) m.set(e.userId, e.bucket);
      byConcept.set(c.slug, m);
    }
    return (conceptSlug: string, userId: string): CellState =>
      byConcept.get(conceptSlug)?.get(userId) ?? "none";
  }, [mastery]);

  return (
    <div className="space-y-6">
      {/* a. header */}
      <div className="card mt-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">{course.title}</h2>
            <p className="text-sm text-gray-700">
              {roster.length} student{roster.length === 1 ? "" : "s"} enrolled
            </p>
          </div>
          <div className="rounded-xl bg-[var(--growth-green-tint)] px-4 py-2">
            <p className="text-xs text-gray-600">Join code</p>
            <p className="font-mono text-xl font-bold tracking-[0.25em] text-[var(--growth-green-text)]">
              {course.joinCode}
            </p>
          </div>
        </div>
      </div>

      {/* b. reteach next — the star */}
      <section aria-labelledby="reteach-heading">
        <h2 id="reteach-heading" className="font-bold">
          Reteach next
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Ranked by where the class is struggling most. Each card explains why.
        </p>
        <ol className="mt-3 space-y-3">
          {ranking.map((item, i) => {
            const badge = PRIORITY_BADGE[item.priority];
            return (
              <li key={item.conceptSlug} className="card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-bold">
                    <span
                      className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--mist-gray)] text-sm"
                      aria-label={`Priority ${i + 1}`}
                    >
                      {i + 1}
                    </span>
                    {item.conceptName}
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-700">{item.reason}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* c. per-concept heatmap */}
      <section aria-labelledby="heatmap-heading">
        <h2 id="heatmap-heading" className="font-bold">
          Concept × student heatmap
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Each cell is a learner&apos;s conceptual grasp of a concept. Color and symbol both encode the level, so it
          reads without relying on color.
        </p>
        <Legend />
        <div className="mt-3 overflow-x-auto">
          <table className="border-collapse text-sm">
            <caption className="sr-only">
              Concepts as rows, students as columns; each cell shows a student&apos;s conceptual level for that concept.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="p-2 text-left font-semibold">
                  Concept
                </th>
                {roster.map((r) => (
                  <th key={r.userId} scope="col" className="p-2 text-center text-xs font-semibold text-gray-600">
                    {studentLabel.get(r.userId)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {concepts.map((c) => (
                <tr key={c.slug}>
                  <th scope="row" className="max-w-[12rem] p-2 text-left font-medium">
                    {c.name}
                  </th>
                  {roster.map((r) => {
                    const cell = cellFor(c.slug, r.userId);
                    const style = CELL_STYLE[cell];
                    const who = studentLabel.get(r.userId);
                    return (
                      <td key={r.userId} className="p-1 text-center">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg font-bold ${style.className}`}
                          title={`${who}, ${c.name}: ${style.label}`}
                        >
                          <span aria-hidden>{style.symbol}</span>
                          <span className="sr-only">
                            {who}, {c.name}: {style.label}
                          </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* d. per-concept dimension bars (§22) */}
      <section aria-labelledby="dimensions-heading">
        <h2 id="dimensions-heading" className="font-bold">
          Mastery by dimension
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Class averages across the five learning dimensions — never collapsed into one grade. Averaged over students
          who have practiced each concept.
        </p>
        <div className="mt-3 space-y-3">
          {concepts.map((c) => {
            const s = summaryBySlug.get(c.slug);
            if (!s) return null;
            return (
              <div key={c.slug} className="card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-bold">{c.name}</p>
                  <span className="stat-chip text-xs">
                    {s.studentsWithEvidence} of {s.totalStudents} practiced
                  </span>
                </div>
                {s.studentsWithEvidence === 0 ? (
                  <p className="mt-2 text-sm text-gray-600">No evidence yet — nobody has practiced this concept.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {MASTERY_DIMENSIONS.map((dim) => {
                      const value = s.avgByDimension[dim];
                      const isWeakest = s.weakestDimension === dim;
                      return (
                        <li key={dim}>
                          <div className="flex items-center justify-between text-xs">
                            <span className={isWeakest ? "font-semibold text-[#cf3d3d]" : "text-gray-700"}>
                              {DIMENSION_LABELS[dim]}
                              {isWeakest ? " — weakest" : ""}
                            </span>
                            <span className="tabular-nums text-gray-700">{pct(value)}%</span>
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
    </div>
  );
}

function Legend() {
  const order: CellState[] = ["strong", "developing", "struggling", "none"];
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Heatmap legend">
      {order.map((k) => {
        const s = CELL_STYLE[k];
        return (
          <li key={k} className="flex items-center gap-1.5 text-xs text-gray-700">
            <span
              className={`inline-flex h-6 w-6 items-center justify-center rounded-md font-bold ${s.className}`}
              aria-hidden
            >
              {s.symbol}
            </span>
            {s.label}
            {k === "strong" ? ` (≥${pct(0.7)}%)` : k === "developing" ? ` (${pct(0.4)}–${pct(0.7)}%)` : k === "struggling" ? ` (<${pct(0.4)}%)` : ""}
          </li>
        );
      })}
    </ul>
  );
}
