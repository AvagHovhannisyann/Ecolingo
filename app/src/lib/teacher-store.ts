"use client";

/**
 * Client store for teacher ingestion state — same useSyncExternalStore shape
 * as learner-store (null server snapshot, single mutation funnel). Local-only
 * for now; the sync layer joins in the production ingestion phase.
 */

import { useSyncExternalStore } from "react";
import { loadTeacherState, saveTeacherState, type TeacherState } from "./teacher-state";

let cache: TeacherState | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): TeacherState | null {
  if (cache === null) cache = loadTeacherState();
  return cache;
}

function getServerSnapshot(): TeacherState | null {
  return null;
}

export function mutateTeacherState(fn: (s: TeacherState) => TeacherState): void {
  cache = fn(getSnapshot() ?? loadTeacherState());
  saveTeacherState(cache);
  notify();
}

export function useTeacherState(): TeacherState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
