import { describe, expect, it } from "vitest";
import {
  SOLOW_DEFAULTS,
  actualInvestment,
  breakEvenInvestment,
  breakEvenSlope,
  capitalChange,
  goldenRuleSavingRate,
  interpretState,
  outputPerWorker,
  steadyStateConsumption,
  steadyStateK,
  transitionPath,
} from "../solow";
import { getEquation } from "../../../content/econ13210";

const p = SOLOW_DEFAULTS;

describe("TEST-ECON-001: Solow equation components are labelled correctly", () => {
  it("fundamental equation carries the three canonical components with correct meanings", () => {
    const eq = getEquation("eq-fundamental");
    expect(eq.latex).toBe("\\Delta k = s\\,f(k) - (n+\\delta)\\,k");
    const meanings = Object.fromEntries(eq.components.map((c) => [c.latex, c.meaning]));
    expect(meanings["\\Delta k"]).toMatch(/change in capital per worker/i);
    expect(meanings["s\\,f(k)"]).toMatch(/actual investment/i);
    expect(meanings["(n+\\delta)\\,k"]).toMatch(/break-even investment/i);
  });
});

describe("TEST-ECON-002: changing s shifts sf(k) and does not rotate the break-even line", () => {
  it("s affects actual investment at every k", () => {
    const low = { ...p, s: 0.2 };
    const high = { ...p, s: 0.4 };
    for (const k of [0.5, 1, 2, 5, 10]) {
      expect(actualInvestment(k, high)).toBeGreaterThan(actualInvestment(k, low));
    }
  });
  it("s leaves break-even investment untouched", () => {
    const low = { ...p, s: 0.2 };
    const high = { ...p, s: 0.4 };
    for (const k of [0.5, 1, 2, 5, 10]) {
      expect(breakEvenInvestment(k, high)).toBe(breakEvenInvestment(k, low));
    }
    expect(breakEvenSlope(high)).toBe(breakEvenSlope(low));
  });
});

describe("TEST-ECON-003: changing n or δ changes the slope of break-even investment", () => {
  it("higher n steepens the line", () => {
    expect(breakEvenSlope({ ...p, n: 0.04 })).toBeGreaterThan(breakEvenSlope({ ...p, n: 0.01 }));
  });
  it("higher δ steepens the line", () => {
    expect(breakEvenSlope({ ...p, delta: 0.12 })).toBeGreaterThan(breakEvenSlope({ ...p, delta: 0.06 }));
  });
  it("slope equals exactly n+δ", () => {
    expect(breakEvenSlope(p)).toBeCloseTo(p.n + p.delta, 12);
  });
});

describe("TEST-ECON-004: the steady state satisfies sf(k*) = (n+δ)k*", () => {
  it("holds across a parameter grid", () => {
    for (const s of [0.1, 0.3, 0.5]) {
      for (const alpha of [0.25, 1 / 3, 0.5]) {
        for (const nd of [[0.01, 0.05], [0.03, 0.1]] as const) {
          const params = { s, alpha, n: nd[0], delta: nd[1], A: 1.2 };
          const kStar = steadyStateK(params);
          expect(actualInvestment(kStar, params)).toBeCloseTo(breakEvenInvestment(kStar, params), 8);
          expect(capitalChange(kStar, params)).toBeCloseTo(0, 8);
        }
      }
    }
  });
  it("worked example from q-solow-numeric-1: s=0.4, α=0.5, n+δ=0.1 ⇒ k*=16", () => {
    expect(steadyStateK({ s: 0.4, alpha: 0.5, n: 0.02, delta: 0.08, A: 1 })).toBeCloseTo(16, 6);
  });
});

describe("TEST-ECON-005: Golden Rule (s = α for Cobb–Douglas)", () => {
  it("returns α", () => {
    expect(goldenRuleSavingRate({ ...p, alpha: 0.35 })).toBe(0.35);
  });
  it("steady-state consumption at s=α beats nearby saving rates", () => {
    const base = { ...p, alpha: 0.4 };
    const cAt = (s: number) => steadyStateConsumption({ ...base, s });
    const cGR = cAt(0.4);
    expect(cGR).toBeGreaterThan(cAt(0.3));
    expect(cGR).toBeGreaterThan(cAt(0.5));
  });
});

describe("transition dynamics & deterministic interpretation (spec §13.1)", () => {
  it("converges monotonically to k* from below and above", () => {
    const kStar = steadyStateK(p);
    const fromBelow = transitionPath(kStar / 4, p, 200);
    const fromAbove = transitionPath(kStar * 3, p, 200);
    expect(fromBelow.at(-1)!).toBeCloseTo(kStar, 3);
    expect(fromAbove.at(-1)!).toBeCloseTo(kStar, 3);
    for (let i = 1; i < fromBelow.length; i++) expect(fromBelow[i]).toBeGreaterThanOrEqual(fromBelow[i - 1] - 1e-12);
    for (let i = 1; i < fromAbove.length; i++) expect(fromAbove[i]).toBeLessThanOrEqual(fromAbove[i - 1] + 1e-12);
  });
  it("every state maps to a deterministic expected interpretation", () => {
    const kStar = steadyStateK(p);
    expect(interpretState(kStar / 2, p).regime).toBe("below_steady_state");
    expect(interpretState(kStar, p).regime).toBe("at_steady_state");
    expect(interpretState(kStar * 2, p).regime).toBe("above_steady_state");
    expect(interpretState(kStar / 2, p).text).toMatch(/rising/);
    expect(interpretState(kStar * 2, p).text).toMatch(/falling/);
  });
});

describe("edge cases: invalid parameters are rejected, never silently mis-taught", () => {
  it("rejects out-of-range s, alpha, delta, A", () => {
    expect(() => outputPerWorker(1, { ...p, s: 0 })).toThrow(RangeError);
    expect(() => outputPerWorker(1, { ...p, alpha: 1 })).toThrow(RangeError);
    expect(() => outputPerWorker(1, { ...p, delta: 0 })).toThrow(RangeError);
    expect(() => outputPerWorker(1, { ...p, A: 0 })).toThrow(RangeError);
    expect(() => transitionPath(0, p, 5)).toThrow(RangeError);
  });
});
