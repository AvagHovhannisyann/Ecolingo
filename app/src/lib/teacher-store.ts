"use client";

/**
 * Client store for teacher ingestion state — same useSyncExternalStore shape
 * as learner-store (null server snapshot, single mutation funnel). Local-only
 * for now; the sync layer joins in the production ingestion phase.
 */

import { useSyncExternalStore } from "react";
import { loadTeacherState, saveTeacherState, type TeacherState } from "./teacher-state";
import { hydrateTeacherRemote, scheduleTeacherPush } from "./teacher-sync";

let cache: TeacherState | null = null;
let remoteHydrationStarted = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): TeacherState | null {
  if (cache === null) {
    cache = loadTeacherState();
    if (!remoteHydrationStarted) {
      remoteHydrationStarted = true;
      void hydrateAndMerge();
    }
  }
  return cache;
}

function getServerSnapshot(): TeacherState | null {
  return null;
}

/**
 * Merge remote → local. Remote is the durable copy of the teacher's own
 * review work; local-only docs/links (offline uploads) are preserved by key
 * so nothing done offline is lost on hydrate.
 */
async function hydrateAndMerge(): Promise<void> {
  const remote = await hydrateTeacherRemote();
  if (!remote || cache === null) return;
  const docIds = new Set(remote.docs.map((d) => d.id));
  const linkKeys = new Set(remote.approvedLinks.map((l) => `${l.docId}:${l.sectionId}:${l.conceptSlug}`));
  cache = {
    version: 1,
    docs: [...remote.docs, ...cache.docs.filter((d) => !docIds.has(d.id))],
    approvedLinks: [
      ...remote.approvedLinks,
      ...cache.approvedLinks.filter((l) => !linkKeys.has(`${l.docId}:${l.sectionId}:${l.conceptSlug}`)),
    ],
    rejectedKeys: [...new Set([...remote.rejectedKeys, ...cache.rejectedKeys])],
    // authored questions are local-only for now; never dropped on remote hydrate
    authoredQuestions: cache.authoredQuestions,
  };
  saveTeacherState(cache);
  notify();
  scheduleTeacherPush(cache); // push back any local-only work kept in the merge
}

export function mutateTeacherState(fn: (s: TeacherState) => TeacherState): void {
  cache = fn(getSnapshot() ?? loadTeacherState());
  saveTeacherState(cache);
  notify();
  scheduleTeacherPush(cache);
}

export function useTeacherState(): TeacherState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
