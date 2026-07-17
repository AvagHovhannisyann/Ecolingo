"use client";

/**
 * Learner-state sync (Phase 1, D-008): localStorage stays the instant local
 * layer; Supabase is the durable one. Hydrate on load, write-through on
 * mutation (debounced). Every failure surfaces through syncStatus — the UI
 * shows it, nothing fails silently (GATE-009).
 *
 * Evidence events are append-only rows keyed by (user_id, client_seq) so
 * retries never duplicate the audit trail (GATE-006).
 */

import type { LearnerState } from "./learner-state";
import { ensureSession, getSupabase } from "./supabase";

export type SyncStatus = "local_only" | "syncing" | "synced" | "error";

let status: SyncStatus = "local_only";
const statusListeners = new Set<(s: SyncStatus) => void>();

function setStatus(s: SyncStatus) {
  status = s;
  for (const l of statusListeners) l(s);
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function onSyncStatus(listener: (s: SyncStatus) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

const SYNCED_SEQ_KEY = "ecolingo.syncedAuditSeq.v1";

function syncedSeq(): number {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(SYNCED_SEQ_KEY) ?? "0");
}

function setSyncedSeq(n: number) {
  window.localStorage.setItem(SYNCED_SEQ_KEY, String(n));
}

/** pull remote state; returns null when unavailable (local mode) */
export async function hydrateRemoteState(): Promise<Partial<LearnerState> | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    setStatus("syncing");
    const userId = await ensureSession();
    if (!userId) {
      setStatus("error");
      return null;
    }
    const [profileRes, planRes, masteryRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("study_plans").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("mastery_states").select("*").eq("user_id", userId),
    ]);
    if (profileRes.error || planRes.error || masteryRes.error) {
      setStatus("error");
      return null;
    }
    setStatus("synced");
    const partial: Partial<LearnerState> = {};
    if (profileRes.data) {
      partial.profile = {
        role: profileRes.data.role,
        objective: profileRes.data.objective,
        explanationOrder: profileRes.data.explanation_order,
        readingLevel: profileRes.data.reading_level,
        onboarded: profileRes.data.onboarded,
        mathReadiness: profileRes.data.math_readiness,
        graphReading: profileRes.data.graph_reading,
      };
      partial.xp = profileRes.data.xp;
      partial.completedLessonIds = profileRes.data.completed_lesson_ids ?? [];
    }
    if (planRes.data) {
      partial.plan = {
        minutesPerDay: planRes.data.minutes_per_day,
        examDateISO: planRes.data.exam_date ? new Date(planRes.data.exam_date).toISOString() : null,
        noStudyDays: planRes.data.no_study_days ?? [],
      };
    }
    if (masteryRes.data && masteryRes.data.length > 0) {
      partial.masteryBySlug = {};
      partial.prevIntervals = {};
      for (const row of masteryRes.data) {
        partial.masteryBySlug[row.concept_slug] = row.state;
        partial.prevIntervals[row.concept_slug] = row.prev_interval_days;
      }
    }
    return partial;
  } catch {
    setStatus("error");
    return null;
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: LearnerState | null = null;

/** debounced write-through; fire-and-forget from the store */
export function schedulePush(state: LearnerState): void {
  if (!getSupabase()) return; // local-only mode
  pendingState = state;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const s = pendingState;
    pendingState = null;
    if (s) void pushState(s);
  }, 800);
}

async function pushState(state: LearnerState): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    setStatus("syncing");
    const userId = await ensureSession();
    if (!userId) {
      setStatus("error");
      return;
    }

    const profileUp = supabase.from("profiles").upsert({
      user_id: userId,
      role: state.profile.role,
      objective: state.profile.objective,
      explanation_order: state.profile.explanationOrder,
      reading_level: state.profile.readingLevel,
      onboarded: state.profile.onboarded,
      math_readiness: state.profile.mathReadiness,
      graph_reading: state.profile.graphReading,
      xp: state.xp,
      completed_lesson_ids: state.completedLessonIds,
    });
    const planUp = supabase.from("study_plans").upsert({
      user_id: userId,
      minutes_per_day: state.plan.minutesPerDay,
      exam_date: state.plan.examDateISO ? state.plan.examDateISO.slice(0, 10) : null,
      no_study_days: state.plan.noStudyDays,
    });
    const masteryRows = Object.entries(state.masteryBySlug).map(([slug, m]) => ({
      user_id: userId,
      concept_slug: slug,
      state: m,
      prev_interval_days: state.prevIntervals[slug] ?? 1,
    }));
    const masteryUp = masteryRows.length
      ? supabase.from("mastery_states").upsert(masteryRows)
      : Promise.resolve({ error: null });

    // append-only evidence: only entries beyond the last synced sequence.
    // auditLog keeps the tail; each entry's sequence is derivable from auditSeq.
    const from = syncedSeq();
    const logStartSeq = state.auditSeq - state.auditLog.length;
    const newAudit = state.auditLog
      .map((a, i) => ({ a, seq: logStartSeq + i + 1 }))
      .filter((x) => x.seq > from)
      .map(({ a, seq }) => ({
        user_id: userId,
        concept_slug: a.conceptSlug,
        event: { at: a.at },
        dimension_deltas: a.dimensionDeltas,
        signal_quality: a.signalQuality,
        guess_likelihood: a.guessLikelihood,
        correct: a.correct,
        client_seq: seq,
      }));
    const evidenceIns = newAudit.length
      ? supabase.from("evidence_events").upsert(newAudit, { onConflict: "user_id,client_seq", ignoreDuplicates: true })
      : Promise.resolve({ error: null });

    const results = await Promise.all([profileUp, planUp, masteryUp, evidenceIns]);
    if (results.some((r) => r.error)) {
      setStatus("error");
      return;
    }
    if (newAudit.length) setSyncedSeq(state.auditSeq);
    setStatus("synced");
  } catch {
    setStatus("error");
  }
}
