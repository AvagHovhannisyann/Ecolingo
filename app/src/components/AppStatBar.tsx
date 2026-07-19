"use client";

/**
 * Top-right stat strip (D-020): streak flame + count, gems (= XP for now,
 * gem-styled) + count, hearts + count. Wired to the REAL learner state —
 * streak from the deterministic study-day computation, gems from earned XP
 * (mastery evidence only). Hearts are rendered as a component but fed a
 * constant 5 until the hearts economy lands in a later wave.
 *
 * Layout: one fixed top bar. On mobile it spans the screen; on desktop it is
 * offset by the 240px sidebar. Content below is padded to clear it.
 */

import { computeStreak } from "@/lib/stats";
import { useLearnerState } from "@/lib/learner-store";
import { SyncBadge } from "./SyncBadge";
import { FlameIcon, GemIcon, HeartIcon } from "./icons";

// TODO(hearts-economy): hearts are a fixed 5 until the lives/refill system
// ships in a later wave. Feed this from learner state when that lands.
const HEARTS = 5;

export function AppStatBar() {
  const state = useLearnerState();
  const streak = state
    ? computeStreak(state.auditLog.map((a) => a.at), new Date().toISOString())
    : 0;
  const gems = state?.xp ?? 0;

  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b-2 border-[color:var(--app-border)] bg-[color:rgba(19,31,36,0.92)] backdrop-blur min-[880px]:left-[240px]">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <SyncBadge />
        <div className="flex items-center gap-3" aria-label="Your stats">
          <span className="stat-chip" title="Study streak">
            <FlameIcon className="h-6 w-6" />
            <span className="text-[color:var(--duo-gold)]">{streak}</span>
            <span className="sr-only">day study streak</span>
          </span>
          <span className="stat-chip" title="Gems earned from real mastery evidence">
            <GemIcon className="h-6 w-6" />
            <span className="text-[color:var(--duo-blue-text)]">{gems}</span>
            <span className="sr-only">gems</span>
          </span>
          <span className="stat-chip" title="Hearts">
            <HeartIcon className="h-6 w-6" />
            <span className="text-[color:var(--duo-red-text)]">{HEARTS}</span>
            <span className="sr-only">hearts</span>
          </span>
        </div>
      </div>
    </header>
  );
}
