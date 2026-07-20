import { describe, expect, it } from "vitest";
import {
  FUNCTION_FAMILIES,
  buildPlot,
  defaultParams,
  getFamily,
  type PlotView,
} from "../graph";

const VIEW: PlotView = { width: 100, height: 100, padding: 10, samples: 10 };

describe("function families", () => {
  it("every family has params, a domain, and evaluates finitely at its defaults", () => {
    for (const f of FUNCTION_FAMILIES) {
      expect(f.params.length).toBeGreaterThan(0);
      expect(f.domain.max).toBeGreaterThan(f.domain.min);
      const p = defaultParams(f);
      const mid = (f.domain.min + f.domain.max) / 2;
      expect(Number.isFinite(f.evaluate(mid, p))).toBe(true);
    }
  });

  it("evaluators compute the real maths (not an approximation)", () => {
    const lin = getFamily("linear")!;
    expect(lin.evaluate(3, { m: 2, b: 1 })).toBe(7);
    const quad = getFamily("quadratic")!;
    expect(quad.evaluate(2, { a: 1, b: 0, c: 0 })).toBe(4);
    const power = getFamily("power")!;
    expect(power.evaluate(9, { A: 1, alpha: 0.5 })).toBe(3); // √9
  });

  it("guards undefined regions with NaN (log/power at x ≤ 0)", () => {
    expect(Number.isNaN(getFamily("logarithmic")!.evaluate(0, { a: 1, b: 0 }))).toBe(true);
    expect(Number.isNaN(getFamily("logarithmic")!.evaluate(-2, { a: 1, b: 0 }))).toBe(true);
  });
});

describe("buildPlot", () => {
  it("drops non-finite samples so a log curve only spans where it's defined", () => {
    const log = getFamily("logarithmic")!;
    const plot = buildPlot(log, defaultParams(log), { ...VIEW, samples: 20 });
    expect(plot.points.every((p) => Number.isFinite(p.y))).toBe(true);
    expect(plot.points.length).toBeGreaterThan(0);
  });

  it("projects a linear function to a straight pixel line spanning the plot area", () => {
    const lin = getFamily("linear")!;
    const plot = buildPlot(lin, { m: 1, b: 0 }, VIEW);
    // first pixel at left padding, last at right padding
    expect(plot.pixels[0].px).toBeCloseTo(VIEW.padding, 5);
    expect(plot.pixels[plot.pixels.length - 1].px).toBeCloseTo(VIEW.width - VIEW.padding, 5);
    // a straight line: collinear endpoints ↔ midpoint
    const a = plot.pixels[0];
    const b = plot.pixels[plot.pixels.length - 1];
    const mid = plot.pixels[Math.floor(plot.pixels.length / 2)];
    const expectedPy = a.py + ((b.py - a.py) * (mid.px - a.px)) / (b.px - a.px);
    expect(mid.py).toBeCloseTo(expectedPy, 4);
    expect(plot.path.startsWith("M")).toBe(true);
  });

  it("is deterministic for the same family + params + view", () => {
    const q = getFamily("quadratic")!;
    const p = { a: 1, b: -2, c: 1 };
    expect(buildPlot(q, p, VIEW).path).toBe(buildPlot(q, p, VIEW).path);
  });

  it("a flat line still produces a valid, non-degenerate y-range", () => {
    const lin = getFamily("linear")!;
    const plot = buildPlot(lin, { m: 0, b: 3 }, VIEW);
    expect(plot.yRange[1]).toBeGreaterThan(plot.yRange[0]);
    expect(plot.pixels.every((px) => Number.isFinite(px.py))).toBe(true);
  });
});
