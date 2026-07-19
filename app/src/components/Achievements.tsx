"use client";

/**
 * Achievements (IDEA-121/122/124/128 subset). Unlock rules are deterministic
 * and evidence-based — badges reward mastery evidence, not clicks. The rules
 * are unchanged from the flat UI; only the rendering moved to the trophy-room
 * medal grid (D-020): gold medal artwork (/art-v2/medal-gold.webp, provenance
 * in public/ASSETS.md, decorative only) for earned, dimmed artwork + a lock
 * glyph and a full-contrast "Locked" label for unearned — state is carried by
 * icon + text, never by faded text.
 */

import Image from "next/image";
import type { LearnerState } from "@/lib/learner-state";

interface Badge {
  id: string;
  title: string;
  description: string;
  unlocked: (s: LearnerState) => boolean;
  progress: (s: LearnerState) => string;
}

const distinctStudyDays = (s: LearnerState) => new Set(s.auditLog.map((a) => a.at.slice(0, 10))).size;

const BADGES: Badge[] = [
  {
    id: "first-lesson",
    title: "First steps",
    description: "Complete your first lesson end to end.",
    unlocked: (s) => s.completedLessonIds.length >= 1,
    progress: (s) => `${Math.min(s.completedLessonIds.length, 1)}/1 lesson`,
  },
  {
    id: "streak",
    title: "On a roll",
    description: "Study on two different days.",
    unlocked: (s) => distinctStudyDays(s) >= 2,
    progress: (s) => `${Math.min(distinctStudyDays(s), 2)}/2 days`,
  },
  {
    id: "mastery",
    title: "Concept mastered",
    description: "Show strong understanding and transfer on one concept.",
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
  const earned = BADGES.filter((b) => b.unlocked(state)).length;
  return (
    <section aria-label="Achievements" className="mt-8">
      <h2 className="text-lg font-bold">Achievements</h2>
      <p className="mt-1 text-sm text-app-muted">
        {earned}/{BADGES.length} medals earned — from real evidence, never from taps.
      </p>
      <ul className="pg-medals">
        {BADGES.map((b) => {
          const unlocked = b.unlocked(state);
          return (
            <li key={b.id} className={`pg-medal ${unlocked ? "pg-medal-earned" : "pg-medal-locked"}`}>
              <div className="pg-medal-art">
                <Image
                  src="/art-v2/medal-gold.webp"
                  alt=""
                  role="presentation"
                  width={512}
                  height={512}
                  className="pg-medal-img"
                />
                {!unlocked && (
                  <span className="pg-medal-lock" aria-hidden>
                    🔒
                  </span>
                )}
              </div>
              <p className="pg-medal-title">{b.title}</p>
              <p className="pg-medal-desc">{b.description}</p>
              <p className="pg-medal-state">{unlocked ? "✓ Unlocked" : `Locked · ${b.progress(state)}`}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
