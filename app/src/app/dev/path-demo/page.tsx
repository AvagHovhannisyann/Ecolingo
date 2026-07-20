"use client";

/**
 * DEV-ONLY visual harness for the Duolingo-parity roadmap (D-024). Renders
 * SkillPath with synthetic rows so the units / colors / scenes / jump nodes
 * can be inspected without an enrolled course. Never linked from the app;
 * lives under /dev like streak-demo. Content is placeholder-labeled — this
 * page teaches nothing (GATE-002 does not apply to a dev harness).
 */

import type { Lesson } from "@/lib/engine/types";
import { SkillPath, type LessonRow } from "@/components/path/SkillPath";
import { SectionHeader } from "@/components/path/SectionHeader";

const TITLES = [
  "Meet supply and demand",
  "Read a demand curve",
  "Shift vs movement",
  "Market equilibrium",
  "Price ceilings and floors",
  "Elasticity, intuitively",
  "Total revenue test",
  "Consumer surplus",
  "Producer surplus",
  "Deadweight loss",
  "Taxes and incidence",
  "Putting it all together",
];

function fakeLesson(i: number): Lesson {
  return {
    id: `demo-${i}`,
    conceptSlug: `demo-concept-${i}`,
    title: TITLES[i % TITLES.length],
    version: 1,
    status: "published",
    steps: [],
    estimatedMinutes: 6,
  };
}

const rows: LessonRow[] = TITLES.map((_, i) => ({
  lesson: fakeLesson(i),
  status: i < 3 ? "done" : i === 3 ? "current" : "locked",
  prereqNames: i > 3 ? [TITLES[i - 1]] : [],
}));

// AI-designed units as the compiler would emit them: goal titles + lesson ids.
const units = [
  { title: "See how markets set prices", lessonIds: rows.slice(0, 4).map((r) => r.lesson.id) },
  { title: "Master elasticity and surplus", lessonIds: rows.slice(4, 9).map((r) => r.lesson.id) },
  { title: "Judge policies like an economist", lessonIds: rows.slice(9).map((r) => r.lesson.id) },
];

export default function PathDemoPage() {
  return (
    <div className="sp mx-auto max-w-xl">
      <SectionHeader eyebrow="Dev harness · Section preview" title={TITLES[3]} href={null} />
      <SkillPath rows={rows} units={units} dueReviewReason={null} mascotSrc="/art-cast/eco-point-scene.webp" />
    </div>
  );
}
