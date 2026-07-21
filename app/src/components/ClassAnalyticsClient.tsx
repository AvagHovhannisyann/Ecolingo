"use client";

/**
 * Class analytics (Phase 5 — "what do I reteach Thursday?").
 *
 * Reads the owner-only enrollment + mastery substrate (D-015) and turns it into
 * a teacher-actionable view: summary stat tiles, a ranked "reteach next" list,
 * a per-concept student-spread breakdown, and per-dimension averages that
 * preserve §22. Rendered on the dark game surface (D-020 parity) via the
 * scoped components in `@/components/analytics`.
 *
 * Every number shown comes from the pure engine (src/lib/engine/class-analytics)
 * — this component only arranges and labels. Students are anonymous UUIDs; no
 * PII exists and none is invented. Degrades calmly to an honest offline/empty
 * state (GATE-009): the sandbox browser cannot reach supabase.co, so that is
 * the state it shows — no infinite spinner.
 */

import "./analytics/analytics.css";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { concepts } from "@/content/active-course";
import {
  ensureMyCourse,
  fetchClassMastery,
  fetchRoster,
  listMyCourses,
  type ClassMastery,
  type CourseSummary,
  type OwnedCourse,
  type RosterEntry,
} from "@/lib/course";
import {
  classConceptSummary,
  classOverview,
  overconfidenceRanking,
  reteachRanking,
  retentionRiskRanking,
  studentRoster,
} from "@/lib/engine/class-analytics";
import { AttentionFlags } from "./analytics/AttentionFlags";
import { ClassOverview } from "./analytics/ClassOverview";
import { CourseSwitcher } from "./analytics/CourseSwitcher";
import { DimensionBars } from "./analytics/DimensionBars";
import { ReteachRanking } from "./analytics/ReteachRanking";
import { EmptyCard, LoadingCard, OfflineCard } from "./analytics/StatusCards";
import { StatTiles } from "./analytics/StatTiles";
import { StudentRosterTable } from "./analytics/StudentRosterTable";
import { StudentSpread } from "./analytics/StudentSpread";

type Phase = "loading" | "offline" | "empty" | "data";

const DEFAULT_COURSE_TITLE = "ECON 13210 — Intro to Macroeconomic Models";

/** the `course` query param, read client-side (post-mount) to avoid coupling
 *  this statically-rendered route to a Suspense boundary for useSearchParams. */
function readCourseParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("course");
}

/** reflect the selected course in the URL (shareable/bookmarkable) without a
 *  navigation — replaceState keeps the back button and page state intact. */
function syncCourseParam(courseId: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("course", courseId);
  window.history.replaceState(null, "", url);
}

export function ClassAnalyticsClient() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [courses, setCourses] = useState<OwnedCourse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [mastery, setMastery] = useState<ClassMastery>({});

  // 1. load the teacher's courses once; pick the initial selection from the
  //    ?course= param (existing links/bookmarks keep working) or fall back to
  //    the first/most-recent course (previous single-course behavior).
  useEffect(() => {
    let alive = true;
    void (async () => {
      let list = await listMyCourses();
      if (!alive) return;
      if (list.length === 0) {
        // Disambiguate zero-state from offline: ensureMyCourse returns null only
        // when Supabase is unconfigured/unreachable (GATE-009). A teacher with
        // no course yet gets one lazily — the previous behavior on this route.
        const first = await ensureMyCourse(DEFAULT_COURSE_TITLE);
        if (!alive) return;
        if (!first) {
          setPhase("offline");
          return;
        }
        list = [{ ...first, studentCount: 0 }];
      }
      setCourses(list);
      const param = readCourseParam();
      const initial = list.find((c) => c.id === param) ?? list[0];
      setSelectedId(initial.id);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 2. (re)load roster + mastery whenever the selected section changes. (The
  //    "loading" phase for a *switch* is set in onSwitch; initial phase is
  //    already "loading", so no synchronous setState is needed in this effect.)
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    void (async () => {
      const [r, m] = await Promise.all([fetchRoster(selectedId), fetchClassMastery(selectedId)]);
      if (!alive) return;
      setRoster(r);
      setMastery(m);
      setPhase(r.length === 0 ? "empty" : "data");
    })();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const selected: CourseSummary | null = courses.find((c) => c.id === selectedId) ?? null;

  const onSwitch = (id: string) => {
    if (id === selectedId) return;
    setPhase("loading");
    setSelectedId(id);
    syncCourseParam(id);
  };

  return (
    <div className="analytics">
      <div className="mb-4">
        <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
          <span aria-hidden>←</span> Back to teacher workspace
        </Link>
      </div>
      <h1 className="text-2xl font-bold">Class analytics</h1>
      <p className="mt-1 text-sm text-app">
        What your class has mastered, and what to reteach next — from live enrollment and mastery data. No student
        names, no single grade.
      </p>

      {courses.length > 1 && selectedId && (
        <CourseSwitcher courses={courses} selectedId={selectedId} onSwitch={onSwitch} />
      )}

      {phase === "loading" && <LoadingCard />}

      {phase === "offline" && <OfflineCard />}

      {phase === "empty" && selected && <EmptyCard course={selected} />}

      {phase === "data" && selected && <DataView course={selected} roster={roster} mastery={mastery} />}
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
  const summaries = useMemo(() => classConceptSummary(mastery, concepts), [mastery]);
  const ranking = useMemo(() => reteachRanking(summaries, concepts), [summaries]);
  const overview = useMemo(() => classOverview(mastery, concepts), [mastery]);
  const overconfident = useMemo(() => overconfidenceRanking(mastery, concepts), [mastery]);
  const retentionRisk = useMemo(() => retentionRiskRanking(mastery, concepts), [mastery]);
  const students = useMemo(() => studentRoster(mastery, roster, concepts), [mastery, roster]);
  const summaryBySlug = useMemo(
    () => new Map(summaries.map((s) => [s.conceptSlug, s])),
    [summaries],
  );

  const strugglingCount = useMemo(
    () => ranking.filter((r) => r.priority === "struggling").length,
    [ranking],
  );
  const healthyCount = useMemo(
    () => ranking.filter((r) => r.priority === "healthy").length,
    [ranking],
  );

  return (
    <div className="space-y-6">
      {/* a. header */}
      <div className="analytics-card mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">{course.title}</h2>
            <p className="text-sm text-app">
              {roster.length} student{roster.length === 1 ? "" : "s"} enrolled
            </p>
          </div>
          <div className="analytics-joincode">
            <p className="text-xs text-app-muted">Join code</p>
            <p className="analytics-joincode__code analytics-joincode__code--sm">{course.joinCode}</p>
          </div>
        </div>
      </div>

      {/* b. summary stat tiles */}
      <StatTiles studentCount={roster.length} strugglingCount={strugglingCount} healthyCount={healthyCount} />

      {/* c. whole-class overview (coverage, engagement, weakest area) */}
      <ClassOverview overview={overview} />

      {/* d. reteach next — the star */}
      <ReteachRanking items={ranking} />

      {/* e. attention flags — overconfidence + fading retention (renders only if any) */}
      <AttentionFlags overconfident={overconfident} retentionRisk={retentionRisk} />

      {/* f. per-student roster — the student-centric view */}
      <StudentRosterTable rows={students} />

      {/* g. student spread — labeled horizontal bars, per concept */}
      <StudentSpread concepts={concepts} mastery={mastery} summaryBySlug={summaryBySlug} />

      {/* h. per-concept dimension bars (§22) */}
      <DimensionBars concepts={concepts} summaryBySlug={summaryBySlug} />
    </div>
  );
}
