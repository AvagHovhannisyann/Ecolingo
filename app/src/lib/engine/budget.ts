/**
 * Two-period intertemporal budget constraint — deterministic math for the
 * Intertemporal Budget Lab (spec §13.3) and TEST-ECON-006/007.
 *
 * Endowment (y1, y2); gross interest 1+r.
 * Budget line: c2 = y2 + (1+r)(y1 − c1); slope = −(1+r); passes through the
 * endowment for every r (rotation pivot).
 * Present value of lifetime resources: W = y1 + y2/(1+r).
 */

export interface BudgetParams {
  y1: number;
  y2: number;
  r: number; // real interest rate > -1
}

function assertParams(p: BudgetParams): void {
  if (!(p.r > -1)) throw new RangeError(`r must be > -1, got ${p.r}`);
  if (!(p.y1 >= 0 && p.y2 >= 0)) throw new RangeError("endowments must be >= 0");
  if (p.y1 + p.y2 <= 0) throw new RangeError("endowment must be positive somewhere");
}

export function budgetLineC2(c1: number, p: BudgetParams): number {
  assertParams(p);
  return p.y2 + (1 + p.r) * (p.y1 - c1);
}

export function budgetSlope(p: BudgetParams): number {
  assertParams(p);
  return -(1 + p.r);
}

export function lifetimeWealthPV(p: BudgetParams): number {
  assertParams(p);
  return p.y1 + p.y2 / (1 + p.r);
}

/** c1-intercept (max period-1 consumption) */
export function c1Intercept(p: BudgetParams): number {
  return lifetimeWealthPV(p);
}

/** c2-intercept (max period-2 consumption) */
export function c2Intercept(p: BudgetParams): number {
  assertParams(p);
  return p.y2 + (1 + p.r) * p.y1;
}

/** lender if c1 < y1 at the chosen bundle; borrower if c1 > y1 */
export function classifyChoice(c1: number, p: BudgetParams): "lender" | "borrower" | "autarky" {
  assertParams(p);
  const eps = 1e-9;
  if (c1 < p.y1 - eps) return "lender";
  if (c1 > p.y1 + eps) return "borrower";
  return "autarky";
}

/**
 * Compensated (Slutsky) budget line after a rate change r0 → r1:
 * slope of the NEW line, income adjusted so the ORIGINAL bundle (c1*, c2*)
 * is exactly affordable. Line: c2 = c2* + (1+r1)(c1* − c1).
 * It is parallel to the new budget line by construction (TEST-ECON-007).
 */
export function compensatedLineC2(
  c1: number,
  originalBundle: { c1: number; c2: number },
  r1: number
): number {
  if (!(r1 > -1)) throw new RangeError(`r1 must be > -1, got ${r1}`);
  return originalBundle.c2 + (1 + r1) * (originalBundle.c1 - c1);
}

export function compensatedSlope(r1: number): number {
  if (!(r1 > -1)) throw new RangeError(`r1 must be > -1, got ${r1}`);
  return -(1 + r1);
}
