"use client";

/**
 * Guidebook (from the Duolingo reference: the section header's book icon opens
 * a unit reference page). Lists the enrolled course's key ideas — concept
 * names, definitions, and which lesson teaches each — straight from the
 * teacher-ratified plan (or the demo course when cloudless). Nothing here is
 * generated at render time; it is a read-only view of ratified content
 * (GATE-001).
 */

import Link from "next/link";
import { concepts as demoConcepts, course as demoCourse } from "@/content/active-course";
import { useEnrolledCourse } from "@/lib/enrolled-course";
import { useLearnerState } from "@/lib/learner-store";
import { AmbientArt } from "../AmbientHero";
import { LoadingScreen } from "../LoadingScreen";
import { JoinCourseGate } from "../path/JoinCourseGate";

export function GuidebookClient() {
  const state = useLearnerState();
  const enrolled = useEnrolledCourse();
  if (!state || enrolled === "loading") return <LoadingScreen label="Opening your guidebook…" />;
  if (enrolled === "none") return <JoinCourseGate onJoined={() => window.location.reload()} />;

  const view =
    enrolled === "cloudless"
      ? { title: "Demo course", concepts: demoConcepts, lessons: demoCourse.lessons }
      : { title: enrolled.courseTitle, concepts: enrolled.concepts, lessons: enrolled.lessons };

  const doneIds = new Set(state.completedLessonIds);
  const entries = view.concepts.map((c) => {
    const lesson = view.lessons.find((l) => l.conceptSlug === c.slug) ?? null;
    return { concept: c, lesson, done: lesson ? doneIds.has(lesson.id) : false };
  });

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-4">
        {/* Lumi the owl reading — Higgsfield loop (still on reduced motion) */}
        <AmbientArt
          videoSrc="/art-cast/lumi-reading-loop.mp4"
          imageSrc="/art-cast/lumi-reading.webp"
          width={480}
          height={480}
          className="h-20 w-20 shrink-0 rounded-2xl border-2 border-[color:var(--app-border)] object-cover"
        />
        <div>
          <p className="text-xs font-extrabold uppercase tracking-widest text-app-muted">Guidebook</p>
          <h1 className="mt-1 text-2xl font-extrabold">{view.title}</h1>
          <p className="mt-1 text-sm text-app-muted">
            The key ideas in this section, in the order the path teaches them.
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-[color:var(--app-border)] p-4 text-sm text-app-muted">
          No concepts yet — this course&apos;s plan is still being compiled.
        </p>
      ) : (
        <ol className="mt-5 space-y-3">
          {entries.map(({ concept, lesson, done }) => (
            <li key={concept.slug} className="rounded-2xl border-2 border-[color:var(--app-border)] p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-extrabold">{concept.name}</h2>
                {done && (
                  <span className="shrink-0 rounded-full bg-[color:rgba(88,204,2,0.16)] px-2 py-0.5 text-xs font-bold text-[color:var(--duo-green-text,#58cc02)]">
                    Learned
                  </span>
                )}
              </div>
              {concept.definition && <p className="mt-1 text-sm text-app-muted">{concept.definition}</p>}
              {lesson && (
                <Link
                  href={`/lesson/${lesson.id}`}
                  className="mt-2 inline-block text-xs font-extrabold uppercase tracking-wide text-[color:var(--duo-blue,#1cb0f6)]"
                >
                  {done ? "Replay lesson" : "Go to lesson"} →
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}

      <Link href="/learn" className="btn-primary mt-6 inline-block min-h-12 px-6 text-white">
        BACK TO YOUR PATH
      </Link>
    </div>
  );
}
