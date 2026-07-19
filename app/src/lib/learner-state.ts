"use client";

/**
 * Client-side learner state for the vertical slice, persisted in
 * localStorage behind the same shape the Phase 1 service layer will expose
 * (D-003). Every mastery mutation goes through recordEvidence, which appends
 * an audit entry — GATE-006 holds even in the demo.
 */

import { applyEvidence, initialMastery } from "./engine/mastery";
import {
  claimQuest as claimQuestEconomy,
  defaultEconomy,
  loseHeart as loseHeartEconomy,
  recordCorrectAnswers as recordCorrectAnswersEconomy,
  recordLessonComplete as recordLessonCompleteEconomy,
  recordReview as recordReviewEconomy,
  refillWithGems as refillWithGemsEconomy,
  type EconomyState,
} from "./engine/economy";
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
  /**
   * Game economy (D-020, Wave 2 Stream K): hearts, gems, streak, quest claims,
   * and period-scoped activity counters. All mutated through the pure
   * engine/economy.ts functions. Additive — older persisted states migrate via
   * spread-with-defaults in loadLearnerState.
   */
  economy: EconomyState;
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
    economy: defaultEconomy(),
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
      // economy is additive (D-020): spread defaults so states persisted before
      // the economy landed — or with a partial economy — hydrate safely.
      economy: {
        ...defaultEconomy(),
        ...(parsed.economy ?? {}),
        counters: { ...defaultEconomy().counters, ...(parsed.economy?.counters ?? {}) },
      },
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

/* ===========================================================================
   Economy wiring (D-020, Wave 2 Stream K). Thin LearnerState-level wrappers
   around the pure engine/economy.ts functions, saved through the same
   persistence path as every other mutation. Designed to be dropped into
   `mutateLearnerState((s) => ...)` at the relevant flow points.

   HANDOFF — the architect wires these into the flows owned by other streams:
     • recordLessonComplete(state, nowISO)  → call when a lesson is finished
       (advances streak, bumps lesson counters, awards lesson-complete gems).
     • recordCorrectAnswers(state, nowISO, n) → call per correct question
       (drives the "Get N questions right" daily quest).
     • recordConceptReviewed(state, nowISO)  → call when a review is completed
       (advances streak, bumps the review counter).
     • loseHeartEconomy(state, nowISO)        → call on a wrong answer in a
       hearts-gated lesson.
   The quests / shop pages already call claimQuestOnState + refillHeartsWithGems.
=========================================================================== */

/** Record a completed lesson in the economy (streak + counters + gems). */
export function recordLessonComplete(state: LearnerState, nowISO: string): LearnerState {
  const next = { ...state, economy: recordLessonCompleteEconomy(state.economy, nowISO) };
  saveLearnerState(next);
  return next;
}

/** Record `n` correct answers toward the daily quest. */
export function recordCorrectAnswers(state: LearnerState, nowISO: string, n = 1): LearnerState {
  const next = { ...state, economy: recordCorrectAnswersEconomy(state.economy, nowISO, n) };
  saveLearnerState(next);
  return next;
}

/** Record a reviewed concept (streak + review counter). */
export function recordConceptReviewed(state: LearnerState, nowISO: string): LearnerState {
  const next = { ...state, economy: recordReviewEconomy(state.economy, nowISO) };
  saveLearnerState(next);
  return next;
}

/** Spend one heart (wrong answer in a hearts-gated lesson). */
export function loseHeart(state: LearnerState, nowISO: string): LearnerState {
  const next = { ...state, economy: loseHeartEconomy(state.economy, nowISO) };
  saveLearnerState(next);
  return next;
}

/** Claim a completed quest's reward (guards double-claim per period). */
export function claimQuestOnState(state: LearnerState, questId: string, nowISO: string): LearnerState {
  const next = { ...state, economy: claimQuestEconomy(state.economy, questId, nowISO) };
  saveLearnerState(next);
  return next;
}

/** Refill hearts to full by spending gems (no-op if full or too few gems). */
export function refillHeartsWithGems(state: LearnerState): LearnerState {
  const next = { ...state, economy: refillWithGemsEconomy(state.economy) };
  saveLearnerState(next);
  return next;
}
