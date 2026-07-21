import { describe, expect, it } from "vitest";
import {
  FUNCTION_FAMILIES,
  buildPlot,
  defaultParams,
  getFamily,
  sanitizeGraphSpec,
  graphCatalogText,
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

describe("sanitizeGraphSpec (D-048)", () => {
  it("accepts a known family, clamps params to range, fills labels", () => {
    const spec = sanitizeGraphSpec({
      familyId: "power",
      params: { A: 2, alpha: 99 }, // alpha out of range (max 2)
      title: "Diminishing returns",
      xLabel: "capital per worker",
      yLabel: "output",
    })!;
    expect(spec.familyId).toBe("power");
    expect(spec.params.A).toBe(2);
    expect(spec.params.alpha).toBe(2); // clamped to max
    expect(spec.title).toBe("Diminishing returns");
    expect(spec.xLabel).toBe("capital per worker");
  });

  it("rejects an unknown family", () => {
    expect(sanitizeGraphSpec({ familyId: "not-real", params: {} })).toBeNull();
    expect(sanitizeGraphSpec(null)).toBeNull();
    expect(sanitizeGraphSpec("nope")).toBeNull();
  });

  it("fills missing params with the family defaults and labels with x/y", () => {
    const spec = sanitizeGraphSpec({ familyId: "linear" })!;
    const def = defaultParams(getFamily("linear")!);
    expect(spec.params).toEqual(def);
    expect(spec.xLabel).toBe("x");
    expect(spec.yLabel).toBe("y");
    expect(spec.title).toBe("Figure 1");
  });

  it("ignores non-numeric param values, keeping the default", () => {
    const spec = sanitizeGraphSpec({ familyId: "linear", params: { m: "steep", b: 3 } })!;
    expect(spec.params.m).toBe(defaultParams(getFamily("linear")!).m); // default kept
    expect(spec.params.b).toBe(3);
  });
});

describe("graphCatalogText (D-048)", () => {
  it("lists every family with its id, formula and param ranges", () => {
    const text = graphCatalogText();
    for (const f of FUNCTION_FAMILIES) expect(text).toContain(`id "${f.id}"`);
    expect(text).toContain("0.1..2"); // power alpha range
  });
});
