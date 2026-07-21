"use client";

/**
 * Deterministic SVG renderer for a computed function plot (D-030). Draws the
 * axes, gridlines, ticks and the curve produced by engine/graph.ts#buildPlot —
 * no data is invented here, it only paints what the pure engine computed. Given
 * an accessible title/description so the graph isn't opaque to screen readers.
 */

import type { FunctionFamily, PlotView } from "@/lib/engine/graph";
import { buildPlot, DEFAULT_PLOT_VIEW } from "@/lib/engine/graph";

function fmt(n: number): string {
  return Math.abs(n) >= 100 || (n !== 0 && Math.abs(n) < 0.01) ? n.toExponential(1) : n.toFixed(2).replace(/\.00$/, "");
}

export function FunctionPlot({
  family,
  params,
  title,
  xLabel,
  yLabel,
  view = DEFAULT_PLOT_VIEW,
}: {
  family: FunctionFamily;
  params: Record<string, number>;
  title: string;
  /** axis labels (D-048) — shown on the figure so it's never unlabelled */
  xLabel?: string;
  yLabel?: string;
  view?: PlotView;
}) {
  const plot = buildPlot(family, params, view);
  const { width, height, padding } = view;
  const axisDesc =
    xLabel || yLabel ? ` Axes: x = ${xLabel || "x"}, y = ${yLabel || "y"}.` : "";
  const desc = `${family.label} curve, ${family.formula}, over x from ${fmt(plot.xRange[0])} to ${fmt(
    plot.xRange[1],
  )}.${axisDesc}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full rounded-xl border border-[color:var(--app-border)] bg-white"
      role="img"
      aria-label={`${title}. ${desc}`}
    >
      <title>{title}</title>
      <desc>{desc}</desc>

      {/* gridlines + tick labels */}
      {plot.xTicks.map((t, i) => (
        <g key={`x${i}`}>
          <line x1={t.pos} y1={padding} x2={t.pos} y2={height - padding} stroke="#e5e7eb" strokeWidth={1} />
          <text x={t.pos} y={height - padding + 16} textAnchor="middle" fontSize={11} fill="#374151">
            {fmt(t.value)}
          </text>
        </g>
      ))}
      {plot.yTicks.map((t, i) => (
        <g key={`y${i}`}>
          <line x1={padding} y1={t.pos} x2={width - padding} y2={t.pos} stroke="#e5e7eb" strokeWidth={1} />
          <text x={padding - 8} y={t.pos + 4} textAnchor="end" fontSize={11} fill="#374151">
            {fmt(t.value)}
          </text>
        </g>
      ))}

      {/* axes */}
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#111827" strokeWidth={2} />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#111827" strokeWidth={2} />

      {/* the computed curve */}
      <path d={plot.path} fill="none" stroke="#7c3aed" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* axis labels (D-048) */}
      {xLabel && (
        <text x={(padding + (width - padding)) / 2} y={height - 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="#111827">
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={12}
          y={(padding + (height - padding)) / 2}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="#111827"
          transform={`rotate(-90 12 ${(padding + (height - padding)) / 2})`}
        >
          {yLabel}
        </text>
      )}
    </svg>
  );
}
