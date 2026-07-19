"use client";

/**
 * Achievements (IDEA-121/122/124/128 subset). Unlock rules are deterministic
 * and evidence-based — badges reward mastery evidence, not clicks. Artwork:
 * Higgsfield-generated (provenance in public/ASSETS.md), decorative only.
 */

import Image from "next/image";
import type { LearnerState } from "@/lib/learner-state";

interface Badge {
  id: string;
  title: string;
  description: string;
  art: string;
  unlocked: (s: LearnerState) => boolean;
  progress: (s: LearnerState) => string;
}

const distinctStudyDays = (s: LearnerState) => new Set(s.auditLog.map((a) => a.at.slice(0, 10))).size;

const BADGES: Badge[] = [
  {
    id: "first-lesson",
    title: "First steps",
    description: "Complete your first lesson end to end.",
    art: "/art/achievement-first-lesson.webp",
    unlocked: (s) => s.completedLessonIds.length >= 1,
    progress: (s) => `${Math.min(s.completedLessonIds.length, 1)}/1 lesson`,
  },
  {
    id: "streak",
    title: "On a roll",
    description: "Study on two different days.",
    art: "/art/achievement-streak.webp",
    unlocked: (s) => distinctStudyDays(s) >= 2,
    progress: (s) => `${Math.min(distinctStudyDays(s), 2)}/2 days`,
  },
  {
    id: "mastery",
    title: "Concept mastered",
    description: "Show strong understanding and transfer on one concept.",
    art: "/art/achievement-mastery.webp",
    unlocked: (s) =>
      Object.values(s.masteryBySlug).some((m) => m.conceptual >= 0.6 && m.transfer >= 0.4),
    progress: (s) => {
      const best = Object.values(s.masteryBySlug).reduce(
        (acc, m) => Math.max(acc, Math.min(m.conceptual / 0.6, m.transfer / 0.4)),
        0
      );
      return `${Math.min(100, Math.round(best * 100))}%`;
    },
  },
];

export function Achievements({ state }: { state: LearnerState }) {
  return (
    <section aria-label="Achievements" className="mt-8">
      <h2 className="text-lg font-semibold">Achievements</h2>
      <p className="mt-1 text-sm text-app-muted">Earned from real evidence — never from taps.</p>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {BADGES.map((b) => {
          const unlocked = b.unlocked(state);
          return (
            <li
              key={b.id}
              className={`rounded-2xl border p-4 text-center ${
                unlocked ? "border-[color:var(--app-border-strong)]" : "border-[color:var(--app-border)]"
              }`}
            >
              <Image
                src={b.art}
                alt=""
                role="presentation"
                width={1024}
                height={1024}
                className={`mx-auto h-24 w-24 rounded-full object-cover ${unlocked ? "" : "opacity-40 grayscale"}`}
              />
              <p className="mt-2 font-medium">
                {b.title} {unlocked && <span aria-hidden>✓</span>}
              </p>
              <p className="text-xs text-app-muted">{b.description}</p>
              <p className="mt-1 text-xs" aria-label={`Progress: ${b.progress(state)}`}>
                {unlocked ? "Unlocked" : b.progress(state)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
