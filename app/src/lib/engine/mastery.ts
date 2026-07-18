/**
 * Mastery model v1 (spec §22). Deterministic, auditable, explainable.
 *
 * Design: each dimension is an exponentially-weighted evidence average in
 * [0,1]. Every update consumes exactly one EvidenceEvent and returns both the
 * new state and a human-readable audit trail entry (GATE-006).
 * The learner is never reduced to one number: dimensions update selectively
 * based on what the evidence actually measures.
 */

import type { EvidenceEvent, MasteryState, QuestionType } from "./types";

export function initialMastery(conceptSlug: string): MasteryState {
  return {
    conceptSlug,
    conceptual: 0.1,
    procedural: 0.1,
    graphInterpretation: 0.1,
    formulaRecall: 0.1,
    transfer: 0.05,
    confidence: 0.5,
    retentionStrength: 0.3,
    misconceptionProbability: {},
    lastEvidenceAt: null,
    evidenceCount: 0,
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** which mastery dimensions a given evidence source informs */
export function dimensionsFor(qt: QuestionType | "visual" | "review"): (keyof Pick<
  MasteryState,
  "conceptual" | "procedural" | "graphInterpretation" | "formulaRecall" | "transfer"
>)[] {
  switch (qt) {
    case "mc_single":
    case "mc_multi":
      return ["conceptual"];
    case "numeric":
      return ["procedural"];
    case "equation_assembly":
      return ["formulaRecall"];
    case "diagram_label":
    case "visual":
      return ["graphInterpretation"];
    case "causal_order":
      return ["conceptual", "procedural"];
    case "review":
      return ["conceptual"];
  }
}

export interface MasteryUpdateResult {
  state: MasteryState;
  /** audit entry — a mastery update must reference evidence (GATE-006) */
  audit: {
    evidence: EvidenceEvent;
    dimensionDeltas: Record<string, number>;
    signalQuality: number;
    guessLikelihood: number;
  };
}

/**
 * Signal quality discounts evidence per §22: hints, slow/fast response,
 * repeated attempts, and possible guessing all reduce how much one event
 * can move the estimate.
 */
export function signalQuality(e: EvidenceEvent): number {
  let q = 1;
  q *= Math.pow(0.65, e.hintsUsed); // each hint discounts
  if (e.attemptNo > 1) q *= Math.pow(0.7, e.attemptNo - 1);
  const timeRatio = e.timeMs / 1000 / Math.max(e.expectedSeconds, 1);
  if (timeRatio > 3) q *= 0.8; // very slow: shaky
  return clamp01(q);
}

/** fast + correct + low-difficulty MC has real guess probability */
export function guessLikelihood(e: EvidenceEvent): number {
  if (!e.correct) return 0;
  const fast = e.timeMs / 1000 < Math.max(e.expectedSeconds, 1) * 0.25;
  const guessable = e.questionType === "mc_single" || e.questionType === "mc_multi";
  if (fast && guessable) return 0.35;
  if (fast) return 0.15;
  return 0;
}

export function applyEvidence(prev: MasteryState, e: EvidenceEvent): MasteryUpdateResult {
  if (e.conceptSlug !== prev.conceptSlug) {
    throw new Error(`evidence for ${e.conceptSlug} applied to state for ${prev.conceptSlug}`);
  }
  const q = signalQuality(e);
  const g = guessLikelihood(e);
  // difficulty raises the ceiling of what success proves and softens failure
  const difficultyWeight = 0.6 + 0.1 * e.difficulty; // 0.7 .. 1.1
  const target = e.correct ? clamp01(difficultyWeight * (1 - g)) : clamp01(0.15 - 0.02 * e.difficulty);
  // learning rate shrinks as evidence accumulates (stability), floored so change stays possible
  const lr = Math.max(0.12, 0.5 / Math.sqrt(prev.evidenceCount + 1)) * q;

  const state: MasteryState = {
    ...prev,
    misconceptionProbability: { ...prev.misconceptionProbability },
  };
  const deltas: Record<string, number> = {};

  for (const dim of dimensionsFor(e.questionType)) {
    const next = clamp01(prev[dim] + lr * (target - prev[dim]));
    deltas[dim] = next - prev[dim];
    state[dim] = next;
  }

  // transfer only moves on transfer-distance evidence
  if (e.transferDistance > 0) {
    const tTarget = e.correct ? clamp01(0.5 + 0.25 * e.transferDistance) : 0.1;
    const next = clamp01(prev.transfer + lr * (tTarget - prev.transfer));
    deltas.transfer = next - prev.transfer;
    state.transfer = next;
  }

  // confidence tracks self-report; calibration gap is derived, not stored
  if (e.confidence !== null) {
    const next = clamp01(prev.confidence + 0.3 * (e.confidence / 4 - prev.confidence));
    deltas.confidence = next - prev.confidence;
    state.confidence = next;
  }

  // retention strengthens with correct recall, weakens with failure
  const rTarget = e.correct ? 1 : 0.15;
  state.retentionStrength = clamp01(prev.retentionStrength + 0.25 * q * (rTarget - prev.retentionStrength));
  deltas.retentionStrength = state.retentionStrength - prev.retentionStrength;

  // misconception probabilities: observed → up; correct evidence decays all
  for (const slug of e.misconceptionSlugs) {
    const p = state.misconceptionProbability[slug] ?? 0.1;
    state.misconceptionProbability[slug] = clamp01(p + 0.35 * (1 - p));
  }
  if (e.correct) {
    for (const slug of Object.keys(state.misconceptionProbability)) {
      state.misconceptionProbability[slug] = clamp01(state.misconceptionProbability[slug] * 0.7);
    }
  }

  state.lastEvidenceAt = e.at;
  state.evidenceCount = prev.evidenceCount + 1;

  return { state, audit: { evidence: e, dimensionDeltas: deltas, signalQuality: q, guessLikelihood: g } };
}

/** derived, for display: worst active misconception if any */
export function dominantMisconception(m: MasteryState): { slug: string; p: number } | null {
  let best: { slug: string; p: number } | null = null;
  for (const [slug, p] of Object.entries(m.misconceptionProbability)) {
    if (p >= 0.3 && (!best || p > best.p)) best = { slug, p };
  }
  return best;
}

/** decayed retention estimate at a moment in time (drives scheduling) */
export function retentionAt(m: MasteryState, atISO: string, halfLifeDays = 6): number {
  if (!m.lastEvidenceAt) return m.retentionStrength;
  const days = (Date.parse(atISO) - Date.parse(m.lastEvidenceAt)) / 86_400_000;
  if (days <= 0) return m.retentionStrength;
  // half-life scales with strength: stronger memories decay slower
  const hl = halfLifeDays * (0.5 + m.retentionStrength);
  return m.retentionStrength * Math.pow(0.5, days / hl);
}
