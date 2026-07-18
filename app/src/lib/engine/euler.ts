/**
 * Euler equation balance — deterministic math for the Euler Balance Game
 * (spec §13.4) and TEST-ECON-008.
 *
 * CRRA utility u(c) = c^(1−σ)/(1−σ)  (σ ≠ 1), u′(c) = c^(−σ); log when σ = 1.
 * Euler: u′(c1) = β(1+r)·u′(c2).
 */

export interface EulerParams {
  beta: number; // discount factor (0,1]
  r: number; // interest rate > -1
  sigma: number; // relative risk aversion > 0
}

function assertParams(p: EulerParams): void {
  if (!(p.beta > 0 && p.beta <= 1)) throw new RangeError(`beta must be in (0,1], got ${p.beta}`);
  if (!(p.r > -1)) throw new RangeError(`r must be > -1, got ${p.r}`);
  if (!(p.sigma > 0)) throw new RangeError(`sigma must be > 0, got ${p.sigma}`);
}

export function marginalUtility(c: number, sigma: number): number {
  if (!(c > 0)) throw new RangeError(`c must be > 0, got ${c}`);
  return Math.pow(c, -sigma);
}

/** left side u′(c1) */
export function eulerLeft(c1: number, p: EulerParams): number {
  assertParams(p);
  return marginalUtility(c1, p.sigma);
}

/** right side β(1+r)u′(c2) */
export function eulerRight(c2: number, p: EulerParams): number {
  assertParams(p);
  return p.beta * (1 + p.r) * marginalUtility(c2, p.sigma);
}

/** gap > 0 ⇒ c1 marginal utility too high ⇒ consuming too little today */
export function eulerGap(c1: number, c2: number, p: EulerParams): number {
  return eulerLeft(c1, p) - eulerRight(c2, p);
}

/** optimal growth ratio c2/c1 = (β(1+r))^(1/σ) */
export function optimalConsumptionRatio(p: EulerParams): number {
  assertParams(p);
  return Math.pow(p.beta * (1 + p.r), 1 / p.sigma);
}

/** deterministic explanation of a deviation, rendered by the game */
export function interpretDeviation(c1: number, c2: number, p: EulerParams): string {
  const gap = eulerGap(c1, c2, p);
  const eps = 1e-9;
  if (Math.abs(gap) < eps) return "Balanced: the marginal utility of consuming today equals the discounted return to saving.";
  if (gap > 0)
    return "u′(c1) exceeds β(1+r)u′(c2): today's consumption is too low relative to the plan — shifting a unit of consumption from tomorrow to today raises lifetime utility.";
  return "β(1+r)u′(c2) exceeds u′(c1): today's consumption is too high — saving one more unit and consuming it tomorrow raises lifetime utility.";
}
