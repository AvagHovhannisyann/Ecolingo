"use client";

/**
 * Client store for learner state built on useSyncExternalStore:
 * - server snapshot is null (components render a loading state, no hydration
 *   mismatch with localStorage-backed data);
 * - all mutations funnel through mutateLearnerState, keeping GATE-006's
 *   "evidence-only mastery changes" invariant enforceable in one place;
 * - Phase 1 (D-008): the store hydrates from Supabase on first load and
 *   write-through-syncs every mutation. localStorage remains the instant
 *   local layer; missing env vars mean clean local-only mode (GATE-009).
 */

import { useSyncExternalStore } from "react";
import { loadLearnerState, saveLearnerState, type LearnerState } from "./learner-state";
import { hydrateRemoteState, schedulePush } from "./sync";

let cache: LearnerState | null = null;
let remoteHydrationStarted = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): LearnerState | null {
  if (cache === null) {
    cache = loadLearnerState();
    if (!remoteHydrationStarted) {
      remoteHydrationStarted = true;
      void hydrateAndMerge();
    }
  }
  return cache;
}

function getServerSnapshot(): LearnerState | null {
  return null;
}

/**
 * Merge remote → local. Remote wins for profile/plan/xp/completions when it
 * has data (it's the durable copy); mastery merges per concept, keeping any
 * local concept the remote doesn't know yet (offline work is never lost).
 */
async function hydrateAndMerge(): Promise<void> {
  const remote = await hydrateRemoteState();
  if (!remote || cache === null) return;
  cache = {
    ...cache,
    ...remote,
    masteryBySlug: { ...cache.masteryBySlug, ...(remote.masteryBySlug ?? {}) },
    prevIntervals: { ...cache.prevIntervals, ...(remote.prevIntervals ?? {}) },
  };
  saveLearnerState(cache);
  notify();
  schedulePush(cache); // pushes back any local-only concepts kept in the merge
}

export function mutateLearnerState(fn: (s: LearnerState) => LearnerState): void {
  cache = fn(getSnapshot() ?? loadLearnerState());
  notify();
  schedulePush(cache);
}

export function useLearnerState(): LearnerState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
