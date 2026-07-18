import { describe, expect, it } from "vitest";
import {
  budgetLineC2,
  budgetSlope,
  c1Intercept,
  c2Intercept,
  classifyChoice,
  compensatedLineC2,
  compensatedSlope,
  lifetimeWealthPV,
} from "../budget";
import { eulerGap, eulerLeft, eulerRight, interpretDeviation, optimalConsumptionRatio } from "../euler";

const endow = { y1: 100, y2: 110 };

describe("TEST-ECON-006: the budget line rotates around the endowment when only r changes", () => {
  it("endowment stays affordable for every r", () => {
    for (const r of [-0.5, 0, 0.05, 0.2, 1]) {
      expect(budgetLineC2(endow.y1, { ...endow, r })).toBeCloseTo(endow.y2, 10);
    }
  });
  it("slope steepens with r; intercepts move in opposite directions", () => {
    const low = { ...endow, r: 0.02 };
    const high = { ...endow, r: 0.2 };
    expect(Math.abs(budgetSlope(high))).toBeGreaterThan(Math.abs(budgetSlope(low)));
    expect(c1Intercept(high)).toBeLessThan(c1Intercept(low)); // PV of future income falls
    expect(c2Intercept(high)).toBeGreaterThan(c2Intercept(low));
  });
});

describe("TEST-ECON-007: compensated line is parallel to the new budget line through the original bundle", () => {
  const r0 = 0.05;
  const r1 = 0.25;
  const original = { c1: 90, c2: budgetLineC2(90, { ...endow, r: r0 }) };

  it("is parallel to the new budget line", () => {
    expect(compensatedSlope(r1)).toBeCloseTo(budgetSlope({ ...endow, r: r1 }), 12);
  });
  it("passes exactly through the original bundle (Slutsky compensation)", () => {
    expect(compensatedLineC2(original.c1, original, r1)).toBeCloseTo(original.c2, 10);
  });
  it("is a different line from the new uncompensated budget line", () => {
    expect(compensatedLineC2(0, original, r1)).not.toBeCloseTo(budgetLineC2(0, { ...endow, r: r1 }), 4);
  });
});

describe("lender/borrower identification (spec §13.3)", () => {
  it("classifies against the endowment point", () => {
    const p = { ...endow, r: 0.1 };
    expect(classifyChoice(80, p)).toBe("lender");
    expect(classifyChoice(120, p)).toBe("borrower");
    expect(classifyChoice(100, p)).toBe("autarky");
  });
  it("lifetime wealth is the c1 intercept", () => {
    const p = { ...endow, r: 0.1 };
    expect(lifetimeWealthPV(p)).toBeCloseTo(100 + 110 / 1.1, 10);
    expect(c1Intercept(p)).toBeCloseTo(lifetimeWealthPV(p), 12);
  });
});

describe("TEST-ECON-008: Euler equation balances u′(c1) against β(1+r)u′(c2)", () => {
  const p = { beta: 0.96, r: 0.05, sigma: 1 };

  it("gap is zero exactly at the optimal consumption ratio", () => {
    const ratio = optimalConsumptionRatio(p); // c2/c1 = β(1+r) for σ=1
    expect(ratio).toBeCloseTo(0.96 * 1.05, 12);
    const c1 = 100;
    expect(eulerGap(c1, c1 * ratio, p)).toBeCloseTo(0, 10);
  });
  it("consuming too little today ⇒ left side exceeds right side, and the explanation says so", () => {
    const c1 = 50;
    const c2 = 150;
    expect(eulerLeft(c1, p)).toBeGreaterThan(eulerRight(c2, p));
    expect(interpretDeviation(c1, c2, p)).toMatch(/too low/);
  });
  it("consuming too much today ⇒ explanation flips", () => {
    expect(interpretDeviation(150, 50, p)).toMatch(/too high/);
  });
  it("rejects invalid parameters", () => {
    expect(() => eulerLeft(0, p)).toThrow(RangeError);
    expect(() => eulerLeft(100, { ...p, sigma: 0 })).toThrow(RangeError);
    expect(() => eulerLeft(100, { ...p, beta: 1.5 })).toThrow(RangeError);
  });
});
