/**
 * Accurate function graphs (D-030). Pure and deterministic.
 *
 * "Accurate" means the curve is COMPUTED from a real, named function family and
 * the teacher's chosen parameters — never sketched by an AI (GATE-002: truth-
 * critical artifacts are code-rendered, not model-authored). There is no
 * arbitrary string evaluation: only a fixed set of safe, well-known families,
 * each with a typed evaluator. `buildPlot` samples a family over its domain and
 * projects the finite points into pixel space with axes/ticks, so a renderer
 * just draws the result. Everything here is unit-testable without a DOM.
 */

export interface ParamSpec {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface FunctionFamily {
  id: string;
  label: string;
  /** short human formula for the caption (not evaluated) */
  formula: string;
  params: ParamSpec[];
  domain: { min: number; max: number };
  /** returns NaN where the function is undefined (e.g. log at x ≤ 0) */
  evaluate: (x: number, p: Record<string, number>) => number;
}

export const FUNCTION_FAMILIES: FunctionFamily[] = [
  {
    id: "linear",
    label: "Linear",
    formula: "y = m·x + b",
    domain: { min: 0, max: 10 },
    params: [
      { key: "m", label: "slope (m)", default: 1, min: -5, max: 5, step: 0.1 },
      { key: "b", label: "intercept (b)", default: 0, min: -10, max: 10, step: 0.5 },
    ],
    evaluate: (x, p) => p.m * x + p.b,
  },
  {
    id: "quadratic",
    label: "Quadratic",
    formula: "y = a·x² + b·x + c",
    domain: { min: -5, max: 5 },
    params: [
      { key: "a", label: "a", default: 1, min: -3, max: 3, step: 0.1 },
      { key: "b", label: "b", default: 0, min: -5, max: 5, step: 0.5 },
      { key: "c", label: "c", default: 0, min: -10, max: 10, step: 0.5 },
    ],
    evaluate: (x, p) => p.a * x * x + p.b * x + p.c,
  },
  {
    id: "exponential",
    label: "Exponential",
    formula: "y = A·e^(k·x)",
    domain: { min: 0, max: 8 },
    params: [
      { key: "A", label: "A", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "k", label: "rate (k)", default: 0.4, min: -1, max: 1, step: 0.05 },
    ],
    evaluate: (x, p) => p.A * Math.exp(p.k * x),
  },
  {
    id: "logarithmic",
    label: "Logarithmic",
    formula: "y = a·ln(x) + b",
    domain: { min: 0.5, max: 12 },
    params: [
      { key: "a", label: "a", default: 1, min: -5, max: 5, step: 0.1 },
      { key: "b", label: "b", default: 0, min: -10, max: 10, step: 0.5 },
    ],
    evaluate: (x, p) => (x > 0 ? p.a * Math.log(x) + p.b : NaN),
  },
  {
    id: "power",
    label: "Power / diminishing returns",
    formula: "y = A·x^α",
    domain: { min: 0, max: 10 },
    params: [
      { key: "A", label: "A", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "alpha", label: "exponent (α)", default: 0.5, min: 0.1, max: 2, step: 0.05 },
    ],
    evaluate: (x, p) => (x >= 0 ? p.A * Math.pow(x, p.alpha) : NaN),
  },
  {
    id: "logistic",
    label: "Logistic (S-curve)",
    formula: "y = L / (1 + e^(−k·(x − x₀)))",
    domain: { min: 0, max: 10 },
    params: [
      { key: "L", label: "ceiling (L)", default: 1, min: 0.1, max: 5, step: 0.1 },
      { key: "k", label: "steepness (k)", default: 1, min: 0.1, max: 3, step: 0.1 },
      { key: "x0", label: "midpoint (x₀)", default: 5, min: 0, max: 10, step: 0.5 },
    ],
    evaluate: (x, p) => p.L / (1 + Math.exp(-p.k * (x - p.x0))),
  },
];

export function getFamily(id: string): FunctionFamily | undefined {
  return FUNCTION_FAMILIES.find((f) => f.id === id);
}

/** default parameter map for a family */
export function defaultParams(family: FunctionFamily): Record<string, number> {
  return Object.fromEntries(family.params.map((p) => [p.key, p.default]));
}

export interface PlotPoint {
  x: number;
  y: number;
}
export interface PixelPoint {
  px: number;
  py: number;
}
export interface Tick {
  value: number;
  pos: number;
}

export interface PlotView {
  width: number;
  height: number;
  padding: number;
  samples: number;
}

export const DEFAULT_PLOT_VIEW: PlotView = { width: 640, height: 400, padding: 44, samples: 160 };

export interface PlotResult {
  points: PlotPoint[]; // finite math points
  pixels: PixelPoint[];
  path: string; // SVG path in pixel space
  xRange: [number, number];
  yRange: [number, number];
  xTicks: Tick[];
  yTicks: Tick[];
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (!(max > min)) return [min];
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, i) => min + i * step);
}

/**
 * Sample a family over its domain with the given params and project to pixels.
 * Non-finite samples (undefined regions) are dropped from the path so a log or
 * power curve simply starts where it is defined. Deterministic for a given
 * family + params + view.
 */
export function buildPlot(
  family: FunctionFamily,
  params: Record<string, number>,
  view: PlotView = DEFAULT_PLOT_VIEW,
): PlotResult {
  const { width, height, padding, samples } = view;
  const { min: xMin, max: xMax } = family.domain;

  const points: PlotPoint[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = xMin + ((xMax - xMin) * i) / samples;
    const y = family.evaluate(x, params);
    if (Number.isFinite(y)) points.push({ x, y });
  }

  // y-range from the finite points, guarded against a flat line.
  let yMin = points.length ? Math.min(...points.map((p) => p.y)) : 0;
  let yMax = points.length ? Math.max(...points.map((p) => p.y)) : 1;
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.05;
  yMin -= pad;
  yMax += pad;

  const sx = (x: number) => padding + ((x - xMin) / (xMax - xMin)) * (width - 2 * padding);
  const sy = (y: number) => height - padding - ((y - yMin) / (yMax - yMin)) * (height - 2 * padding);

  const pixels: PixelPoint[] = points.map((p) => ({ px: sx(p.x), py: sy(p.y) }));
  const path = pixels
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.px.toFixed(2)},${p.py.toFixed(2)}`)
    .join(" ");

  const xTicks: Tick[] = niceTicks(xMin, xMax, 5).map((value) => ({ value, pos: sx(value) }));
  const yTicks: Tick[] = niceTicks(yMin, yMax, 5).map((value) => ({ value, pos: sy(value) }));

  return { points, pixels, path, xRange: [xMin, xMax], yRange: [yMin, yMax], xTicks, yTicks };
}
