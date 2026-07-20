"use client";

/**
 * Persistence + reactive store for the teacher's teaching style (D-029).
 *
 * Kept in its OWN clearly-namespaced localStorage key, mirroring plan-store's
 * load/save/degrade discipline (a full/blocked quota never crashes the UI —
 * GATE-009). Deliberately separate from teacher-state.ts so it doesn't entangle
 * the ingestion sync/merge logic: the style is small, teacher-private, and
 * travels with a course by riding inside the ratified compiled plan (jsonb), so
 * students receive it without any schema change.
 *
 * Exposed through useSyncExternalStore so the editor and the compile client
 * stay in lock-step the instant the teacher saves.
 */

import { useSyncExternalStore } from "react";
import {
  defaultTeachingStyle,
  sanitizeTeachingStyle,
  type TeachingStyle,
} from "./engine/teaching-style";

export const TEACHING_STYLE_KEY = "ecolingo.teachingStyle.v1";

let cache: TeachingStyle | null = null;
const listeners = new Set<() => void>();

function read(): TeachingStyle {
  if (typeof window === "undefined") return defaultTeachingStyle();
  try {
    const raw = window.localStorage.getItem(TEACHING_STYLE_KEY);
    if (!raw) return defaultTeachingStyle();
    return sanitizeTeachingStyle(JSON.parse(raw));
  } catch {
    return defaultTeachingStyle();
  }
}

function getSnapshot(): TeachingStyle {
  if (cache === null) cache = read();
  return cache;
}

function getServerSnapshot(): TeachingStyle {
  return defaultTeachingStyle();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Persist a new style (already-sanitized or not) and notify subscribers. */
export function saveTeachingStyle(style: TeachingStyle): void {
  const clean = sanitizeTeachingStyle(style);
  cache = clean;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(TEACHING_STYLE_KEY, JSON.stringify(clean));
    } catch {
      // storage full/blocked — the value stays in memory for the session so the
      // UI still reflects the change; nothing silently pretends to have saved.
    }
  }
  for (const l of listeners) l();
}

/** Reactive read of the teacher's saved style. */
export function useTeachingStyle(): TeachingStyle {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** One-shot read for non-React callers (e.g. the compile client's ratify path). */
export function readTeachingStyle(): TeachingStyle {
  return getSnapshot();
}
