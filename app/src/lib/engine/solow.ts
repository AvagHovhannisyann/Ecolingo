/**
 * Solow growth model — deterministic, code-controlled math (GATE-002).
 * Production: Cobb–Douglas per worker, f(k) = A · k^α  (assumption A-4).
 * Fundamental equation: Δk = s·f(k) − (n+δ)·k
 * Steady state: s·A·k*^α = (n+δ)·k*  ⇒  k* = (s·A/(n+δ))^(1/(1−α))
 * Golden Rule (Cobb–Douglas): s_GR = α  (maximizes steady-state consumption).
 */

export interface SolowParams {
  s: number; // saving rate (0,1)
  n: number; // population growth ≥ 0
  delta: number; // depreciation > 0
  alpha: number; // capital share (0,1)
  A: number; // TFP > 0
}

export const SOLOW_DEFAULTS: SolowParams = { s: 0.3, n: 0.02, delta: 0.08, alpha: 1 / 3, A: 1 };

export const SOLOW_BOUNDS: Record<keyof SolowParams, { min: number; max: number; step: number }> = {
  s: { min: 0.05, max: 0.8, step: 0.01 },
  n: { min: 0, max: 0.06, step: 0.005 },
  delta: { min: 0.02, max: 0.15, step: 0.005 },
  alpha: { min: 0.2, max: 0.6, step: 0.05 },
  A: { min: 0.5, max: 2, step: 0.1 },
};

function assertParams(p: SolowParams): void {
  if (!(p.s > 0 && p.s < 1)) throw new RangeError(`s must be in (0,1), got ${p.s}`);
  if (!(p.alpha > 0 && p.alpha < 1)) throw new RangeError(`alpha must be in (0,1), got ${p.alpha}`);
  if (!(p.n >= 0)) throw new RangeError(`n must be >= 0, got ${p.n}`);
  if (!(p.delta > 0)) throw new RangeError(`delta must be > 0, got ${p.delta}`);
  if (!(p.n + p.delta > 0)) throw new RangeError("n + delta must be > 0");
  if (!(p.A > 0)) throw new RangeError(`A must be > 0, got ${p.A}`);
}

/** output per worker f(k) */
export function outputPerWorker(k: number, p: SolowParams): number {
  assertParams(p);
  return p.A * Math.pow(k, p.alpha);
}

/** actual investment s·f(k) */
export function actualInvestment(k: number, p: SolowParams): number {
  return p.s * outputPerWorker(k, p);
}

/** break-even investment (n+δ)·k — a straight line through the origin with slope n+δ */
export function breakEvenInvestment(k: number, p: SolowParams): number {
  assertParams(p);
  return (p.n + p.delta) * k;
}

export function breakEvenSlope(p: SolowParams): number {
  assertParams(p);
  return p.n + p.delta;
}

/** Δk = s·f(k) − (n+δ)·k */
export function capitalChange(k: number, p: SolowParams): number {
  return actualInvestment(k, p) - breakEvenInvestment(k, p);
}

/** k* = (s·A/(n+δ))^(1/(1−α)) */
export function steadyStateK(p: SolowParams): number {
  assertParams(p);
  return Math.pow((p.s * p.A) / (p.n + p.delta), 1 / (1 - p.alpha));
}

export function steadyStateOutput(p: SolowParams): number {
  return outputPerWorker(steadyStateK(p), p);
}

/** c* = (1−s)·f(k*) */
export function steadyStateConsumption(p: SolowParams): number {
  return (1 - p.s) * steadyStateOutput(p);
}

/** Golden Rule saving rate for Cobb–Douglas is exactly α (TEST-ECON-005) */
export function goldenRuleSavingRate(p: SolowParams): number {
  assertParams(p);
  return p.alpha;
}

/**
 * Transition dynamics: iterate k_{t+1} = k_t + s·f(k_t) − (n+δ)·k_t from k0.
 * Deterministic; used by the lab's dynamics readout.
 */
export function transitionPath(k0: number, p: SolowParams, periods: number): number[] {
  assertParams(p);
  if (!(k0 > 0)) throw new RangeError("k0 must be > 0");
  const path = [k0];
  let k = k0;
  for (let t = 0; t < periods; t++) {
    k = k + capitalChange(k, p);
    path.push(k);
  }
  return path;
}

/**
 * Deterministic expected interpretation for every lab state (spec §13.1).
 * The UI renders this text; tests assert on it.
 */
export function interpretState(k: number, p: SolowParams): {
  regime: "below_steady_state" | "at_steady_state" | "above_steady_state";
  text: string;
} {
  const kStar = steadyStateK(p);
  const rel = Math.abs(k - kStar) / kStar;
  if (rel < 0.01) {
    return {
      regime: "at_steady_state",
      text: "Actual investment exactly replaces depreciated capital and equips new workers: capital per worker is constant (steady state).",
    };
  }
  if (k < kStar) {
    return {
      regime: "below_steady_state",
      text: "Actual investment exceeds break-even investment, so capital per worker is rising toward the steady state.",
    };
  }
  return {
    regime: "above_steady_state",
    text: "Break-even investment exceeds actual investment, so capital per worker is falling toward the steady state.",
  };
}
