"use client";

/**
 * The roadmap / sections view (D-022, from the product owner's Duolingo
 * screenshot): stacked section cards — art band, "SECTION N" eyebrow, title,
 * a fat progress bar with real numbers, CONTINUE into the path — and locked
 * sections shown honestly as locked, never as fake content.
 *
 * Sources: the enrolled compiled course (cloud) or the demo worlds
 * (cloudless). Same degrade rules as the skill path.
 */

import Image from "next/image";
import Link from "next/link";
import { course, concepts as demoConcepts } from "@/content/econ13210";
import { worlds } from "@/content/econ13210/worlds";
import { useEnrolledCourse } from "@/lib/enrolled-course";
import { useLearnerState } from "@/lib/learner-store";
import { JoinCourseGate } from "../path/JoinCourseGate";

interface SectionCard {
  key: string;
  eyebrow: string;
  title: string;
  tagline: string;
  art: string | null;
  done: number;
  total: number;
  locked: boolean;
}

function ProgressBar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={`${label} progress`}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${done} of ${total} lessons complete`}
      className="mt-3 h-4 w-full overflow-hidden rounded-full bg-[color:var(--app-surface-2)]"
    >
      <div className="h-full rounded-full bg-[var(--duo-gold)] transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SectionsClient() {
  const state = useLearnerState();
  const enrolled = useEnrolledCourse();
  if (!state || enrolled === "loading")
    return <p className="p-4 text-sm text-app-muted">Loading your sections…</p>;
  if (enrolled === "none") return <JoinCourseGate onJoined={() => window.location.reload()} />;

  const doneIds = new Set(state.completedLessonIds);
  const cards: SectionCard[] =
    enrolled === "cloudless"
      ? worlds.map((w) => {
          const lessons = course.lessons.filter((l) =>
            demoConcepts.some((c) => c.slug === l.conceptSlug && c.world === w.number)
          );
          return {
            key: w.slug,
            eyebrow: `Section ${w.number}`,
            title: w.title,
            tagline: w.tagline,
            art: w.art,
            done: lessons.filter((l) => doneIds.has(l.id)).length,
            total: lessons.length,
            locked: !w.available,
          };
        })
      : [
          {
            key: enrolled.courseId,
            eyebrow: "Section 1",
            title: enrolled.courseTitle,
            tagline: `${enrolled.lessons.length} lessons, compiled from your teacher's materials and ratified by them.`,
            art: "/art-v2/world-solow-header.webp",
            done: enrolled.lessons.filter((l) => doneIds.has(l.id)).length,
            total: enrolled.lessons.length,
            locked: false,
          },
          {
            key: "coming",
            eyebrow: "Next",
            title: "More sections on the way",
            tagline: "Your teacher can compile and publish more units — they appear here the moment they're ratified.",
            art: "/art-v2/world-locked-teaser.webp",
            done: 0,
            total: 0,
            locked: true,
          },
        ];

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-extrabold">Sections</h1>
      <p className="mt-1 text-sm text-app-muted">Your whole journey, one card per section.</p>

      <ul className="mt-5 space-y-5">
        {cards.map((card) => (
          <li
            key={card.key}
            className={`overflow-hidden rounded-3xl border-2 ${
              card.locked ? "border-[color:var(--app-border)]" : "border-[var(--growth-green)]"
            } bg-[color:var(--app-surface)]`}
          >
            {card.art && (
              <div className="relative h-28 w-full">
                <Image
                  src={card.art}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 576px, 100vw"
                  className={`object-cover ${card.locked ? "opacity-40 saturate-50" : ""}`}
                />
              </div>
            )}
            <div className="p-5">
              <p className="text-xs font-extrabold uppercase tracking-widest text-app-muted">
                {card.locked ? `🔒 ${card.eyebrow}` : card.eyebrow}
              </p>
              <h2 className="mt-1 text-lg font-extrabold">{card.title}</h2>
              <p className="mt-1 text-sm text-app-muted">{card.tagline}</p>

              {card.locked ? (
                <p className="mt-3 text-sm font-bold text-app-muted">
                  {card.total > 0 ? "Locked — finish the section above first." : "Not available yet."}
                </p>
              ) : (
                <>
                  <ProgressBar label={card.title} done={card.done} total={card.total} />
                  <p className="mt-1 text-xs text-app-muted">
                    {card.done} / {card.total} lessons complete
                  </p>
                  <Link href="/learn" className="btn-primary mt-4 inline-block min-h-12 px-6 text-white">
                    CONTINUE
                  </Link>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
