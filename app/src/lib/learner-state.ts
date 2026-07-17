"use client";

/**
 * Client-side learner state for the vertical slice, persisted in
 * localStorage behind the same shape the Phase 1 service layer will expose
 * (D-003). Every mastery mutation goes through recordEvidence, which appends
 * an audit entry — GATE-006 holds even in the demo.
 */

import { applyEvidence, initialMastery } from "./engine/mastery";
import type { EvidenceEvent, MasteryState, StudyPlanInput } from "./engine/types";

export interface AuditEntry {
  at: string;
  conceptSlug: string;
  dimensionDeltas: Record<string, number>;
  signalQuality: number;
  guessLikelihood: number;
  correct: boolean;
}

/**
 * Personalization profile (§7 onboarding + §22). Explicit, learner-editable,
 * and consumed only through declared adaptation points (e.g. lesson step
 * order). Never rewrites teacher-approved content (GATE-004).
 */
export interface LearnerProfile {
  role: "student" | "teacher" | "independent" | null;
  objective: "understand" | "exam" | "catch_up" | "weak_area" | "assignment" | null;
  explanationOrder: "visual_first" | "math_first" | "text_first";
  readingLevel: "standard" | "simpler";
  onboarded: boolean;
  /** diagnostic results in [0,1]; null until taken (IDEA-005/006) */
  mathReadiness: number | null;
  graphReading: number | null;
}

export function defaultProfile(): LearnerProfile {
  return {
    role: null,
    objective: null,
    explanationOrder: "visual_first",
    readingLevel: "standard",
    onboarded: false,
    mathReadiness: null,
    graphReading: null,
  };
}

export interface LearnerState {
  profile: LearnerProfile;
  masteryBySlug: Record<string, MasteryState>;
  prevIntervals: Record<string, number>;
  plan: StudyPlanInput;
  completedLessonIds: string[];
  auditLog: AuditEntry[];
  /** total evidence events ever recorded (monotonic; auditLog keeps the tail) */
  auditSeq: number;
  xp: number;
}

const KEY = "ecolingo.learner.v1";

export function defaultLearnerState(): LearnerState {
  return {
    profile: defaultProfile(),
    masteryBySlug: {},
    prevIntervals: {},
    plan: { examDateISO: null, minutesPerDay: 20, noStudyDays: [] },
    completedLessonIds: [],
    auditLog: [],
    auditSeq: 0,
    xp: 0,
  };
}

export function loadLearnerState(): LearnerState {
  if (typeof window === "undefined") return defaultLearnerState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultLearnerState();
    const parsed = JSON.parse(raw) as Partial<LearnerState>;
    // migrate older stored shapes: missing fields fall back to defaults
    return {
      ...defaultLearnerState(),
      ...parsed,
      profile: { ...defaultProfile(), ...(parsed.profile ?? {}) },
    };
  } catch {
    return defaultLearnerState();
  }
}

export function saveLearnerState(state: LearnerState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(state));
}

/** the only path that mutates mastery (GATE-006) */
export function recordEvidence(state: LearnerState, e: EvidenceEvent): LearnerState {
  const prev = state.masteryBySlug[e.conceptSlug] ?? initialMastery(e.conceptSlug);
  const { state: nextMastery, audit } = applyEvidence(prev, e);
  const next: LearnerState = {
    ...state,
    masteryBySlug: { ...state.masteryBySlug, [e.conceptSlug]: nextMastery },
    auditLog: [
      ...state.auditLog,
      {
        at: e.at,
        conceptSlug: e.conceptSlug,
        dimensionDeltas: audit.dimensionDeltas,
        signalQuality: audit.signalQuality,
        guessLikelihood: audit.guessLikelihood,
        correct: e.correct,
      },
    ].slice(-200),
    auditSeq: state.auditSeq + 1,
    // XP for meaningful completion only: correct, unguessed evidence (IDEA-121)
    xp: state.xp + (e.correct ? Math.round(10 * (1 - audit.guessLikelihood) * audit.signalQuality) : 2),
  };
  saveLearnerState(next);
  return next;
}

export function markReviewed(state: LearnerState, conceptSlug: string, intervalDays: number): LearnerState {
  const next = { ...state, prevIntervals: { ...state.prevIntervals, [conceptSlug]: intervalDays } };
  saveLearnerState(next);
  return next;
}

export function completeLesson(state: LearnerState, lessonId: string): LearnerState {
  if (state.completedLessonIds.includes(lessonId)) return state;
  const next = { ...state, completedLessonIds: [...state.completedLessonIds, lessonId] };
  saveLearnerState(next);
  return next;
}

export function updatePlan(state: LearnerState, plan: StudyPlanInput): LearnerState {
  const next = { ...state, plan };
  saveLearnerState(next);
  return next;
}

export function updateProfile(state: LearnerState, profile: Partial<LearnerProfile>): LearnerState {
  const next = { ...state, profile: { ...state.profile, ...profile } };
  saveLearnerState(next);
  return next;
}

/** student control to reset personalization (IDEA-024) */
export function resetLearnerState(): LearnerState {
  const fresh = defaultLearnerState();
  saveLearnerState(fresh);
  return fresh;
}
