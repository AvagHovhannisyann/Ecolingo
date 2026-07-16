"use client";

/**
 * Client store for learner state built on useSyncExternalStore:
 * - server snapshot is null (components render a loading state, no hydration
 *   mismatch with localStorage-backed data);
 * - all mutations funnel through mutateLearnerState, keeping GATE-006's
 *   "evidence-only mastery changes" invariant enforceable in one place.
 */

import { useSyncExternalStore } from "react";
import { loadLearnerState, type LearnerState } from "./learner-state";

let cache: LearnerState | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): LearnerState | null {
  if (cache === null) cache = loadLearnerState();
  return cache;
}

function getServerSnapshot(): LearnerState | null {
  return null;
}

export function mutateLearnerState(fn: (s: LearnerState) => LearnerState): void {
  cache = fn(getSnapshot() ?? loadLearnerState());
  for (const l of listeners) l();
}

export function useLearnerState(): LearnerState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
