"use client";

/**
 * Top-right stat strip (D-020): streak flame + count, gems + count, hearts +
 * count. Wired to the REAL learner economy (Wave 2 Stream K):
 *  - streak  → economy.streakCount (deterministic UTC study-day streak);
 *  - gems    → economy.gems (earned from lessons, quests, chests);
 *  - hearts  → heartsAvailable(economy, now), including timed regeneration.
 * All three update reactively through useLearnerState. The streak and gem
 * counters populate as the lesson/review flows call the economy helpers
 * (see learner-state.ts handoff notes).
 *
 * Layout: one fixed top bar. On mobile it spans the screen; on desktop it is
 * offset by the 240px sidebar. Content below is padded to clear it.
 */

import { heartsAvailable } from "@/lib/engine/economy";
import { useLearnerState } from "@/lib/learner-store";
import { SyncBadge } from "./SyncBadge";
import { FlameIcon, GemIcon, HeartIcon } from "./icons";

export function AppStatBar() {
  const state = useLearnerState();
  const streak = state?.economy.streakCount ?? 0;
  const gems = state?.economy.gems ?? 0;
  const hearts = state ? heartsAvailable(state.economy, new Date().toISOString()) : 0;

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
          <span className="stat-chip" title="Gems earned from lessons, quests, and chests">
            <GemIcon className="h-6 w-6" />
            <span className="text-[color:var(--duo-blue-text)]">{gems}</span>
            <span className="sr-only">gems</span>
          </span>
          <span className="stat-chip" title="Hearts">
            <HeartIcon className="h-6 w-6" />
            <span className="text-[color:var(--duo-red-text)]">{hearts}</span>
            <span className="sr-only">hearts</span>
          </span>
        </div>
      </div>
    </header>
  );
}
