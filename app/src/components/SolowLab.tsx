"use client";

/**
 * Solow Lab (spec §13.1, IDEA-073/074/083/193).
 *
 * Truth-critical rules honoured here:
 * - All geometry is computed by src/lib/engine/solow.ts — code-controlled,
 *   never AI- or image-generated (GATE-002).
 * - Every state has a deterministic expected interpretation (interpretState).
 * - Keyboard operable: sliders are native range inputs with announced values;
 *   curves are additionally distinguished by dash pattern + labels, never
 *   colour alone (IDEA-173/174).
 * - No animation is required to read the graph; transition dynamics are a
 *   static path readout (reduced-motion safe, IDEA-175).
 *
 * Visual styling: D-020 dark game surface (lab/lab.css) — presentational only;
 * the geometry pipeline above is untouched.
 */

import { useMemo, useState } from "react";
import {
  SOLOW_BOUNDS,
  SOLOW_DEFAULTS,
  actualInvestment,
  breakEvenInvestment,
  capitalChange,
  interpretState,
  outputPerWorker,
  steadyStateConsumption,
  steadyStateK,
  type SolowParams,
} from "@/lib/engine/solow";
import { MathTex } from "./MathTex";
import "./lab/lab.css";

const W = 560;
const H = 360;
const PAD = { l: 48, r: 16, t: 16, b: 40 };

const PARAM_LABELS: Record<keyof SolowParams, { label: string; latex: string; describe: string }> = {
  s: { label: "Saving rate", latex: "s", describe: "share of output invested — scales s·f(k) only" },
  n: { label: "Population growth", latex: "n", describe: "new workers to equip — steepens (n+δ)k" },
  delta: { label: "Depreciation", latex: "\\delta", describe: "capital wearing out — steepens (n+δ)k" },
  alpha: { label: "Capital share", latex: "\\alpha", describe: "curvature of f(k)" },
  A: { label: "Productivity", latex: "A", describe: "total factor productivity — scales f(k)" },
};

export function SolowLab({
  onParamsChange,
}: {
  onParamsChange?: (p: SolowParams) => void;
}) {
  const [params, setParams] = useState<SolowParams>(SOLOW_DEFAULTS);
  const [probeK, setProbeK] = useState<number | null>(null);
  const [view, setView] = useState<"numeric" | "symbolic">("numeric");

  const kStar = useMemo(() => steadyStateK(params), [params]);
  const kMax = useMemo(() => Math.max(kStar * 1.8, 2), [kStar]);
  const yMax = useMemo(() => Math.max(outputPerWorker(kMax, params) * params.s, breakEvenInvestment(kMax, params)) * 1.15, [kMax, params]);

  const x = (k: number) => PAD.l + (k / kMax) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);

  const curvePath = (fn: (k: number) => number) => {
    const pts: string[] = [];
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const k = (i / steps) * kMax + 1e-9;
      pts.push(`${i === 0 ? "M" : "L"}${x(k).toFixed(1)},${y(fn(k)).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  const setParam = (key: keyof SolowParams, value: number) => {
    const next = { ...params, [key]: value };
    setParams(next);
    onParamsChange?.(next);
  };

  const probe = probeK ?? kStar;
  const interpretation = interpretState(probe, params);

  // colour-blind-safe pair + dash distinction (never colour-only).
  // Stroke colours are gate-locked (lab-keyboard e2e selects by them); the
  // *Label variants are brighter same-hue tints so 12px text clears AA on the
  // dark chart canvas.
  const investColor = "#0072B2";
  const breakevenColor = "#D55E00";
  const investLabelColor = "#4cc2ff";
  const breakevenLabelColor = "#ff9d5c";

  return (
    <div className="lab-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          Solow Lab — <MathTex latex="\Delta k = s\,f(k) - (n+\delta)k" />
        </h3>
        <button
          type="button"
          className="btn-secondary min-h-12 px-3 text-sm"
          onClick={() => setView(view === "numeric" ? "symbolic" : "numeric")}
          aria-pressed={view === "symbolic"}
        >
          View: {view === "numeric" ? "numeric" : "symbolic"}
        </button>
      </div>

      <div className="lab-chart mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        className="w-full max-w-full"
        aria-label={`Solow diagram. Saving rate ${params.s.toFixed(2)}, population growth ${params.n.toFixed(3)}, depreciation ${params.delta.toFixed(3)}. Steady state capital per worker ${kStar.toFixed(2)}. ${interpretation.text}`}
      >
        {/* axes */}
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="currentColor" strokeWidth="1" />
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="currentColor" strokeWidth="1" />
        <text x={W - PAD.r} y={H - PAD.b + 24} textAnchor="end" fontSize="12">
          capital per worker k
        </text>
        <text x={PAD.l - 36} y={PAD.t + 8} fontSize="12">
          inv.
        </text>

        {/* curves: solid = actual investment, dashed = break-even */}
        {/* §16 staged graph entrance: solid curve draws, dashed fades, k* appears last */}
        <path d={curvePath((k) => actualInvestment(k, params))} fill="none" stroke={investColor} strokeWidth="2.5" className="curve-draw-1" />
        <path
          d={curvePath((k) => breakEvenInvestment(k, params))}
          fill="none"
          stroke={breakevenColor}
          strokeWidth="2.5"
          strokeDasharray="7 5"
          className="curve-fade-2"
        />

        {/* steady state marker */}
        <line x1={x(kStar)} y1={y(actualInvestment(kStar, params))} x2={x(kStar)} y2={H - PAD.b} stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />
        <circle cx={x(kStar)} cy={y(actualInvestment(kStar, params))} r="5" fill="currentColor" className="equilibrium-appear" />
        <text x={x(kStar)} y={H - PAD.b + 16} textAnchor="middle" fontSize="12">
          k*
        </text>

        {/* probe */}
        {probeK !== null && (
          <g>
            <line x1={x(probeK)} y1={PAD.t} x2={x(probeK)} y2={H - PAD.b} stroke="#7f939e" strokeWidth="1" strokeDasharray="1 3" />
            <circle cx={x(probeK)} cy={y(actualInvestment(probeK, params))} r="4" fill={investColor} />
            <circle cx={x(probeK)} cy={y(breakEvenInvestment(probeK, params))} r="4" fill={breakevenColor} />
          </g>
        )}

        {/* direction arrows along the k axis (mechanism made visible) */}
        {[0.35, 0.7].map((f) => {
          const k = kStar * f;
          return <text key={f} x={x(k)} y={H - PAD.b - 6} fontSize="14" textAnchor="middle" aria-hidden>→</text>;
        })}
        {[1.35].map((f) => {
          const k = Math.min(kStar * f, kMax * 0.95);
          return <text key={f} x={x(k)} y={H - PAD.b - 6} fontSize="14" textAnchor="middle" aria-hidden>←</text>;
        })}

        {/* curve labels (not colour-only) */}
        <text x={x(kMax * 0.8)} y={y(actualInvestment(kMax * 0.8, params)) - 8} fontSize="12" fill={investLabelColor}>
          s·f(k) (solid)
        </text>
        <text x={x(kMax * 0.62)} y={y(breakEvenInvestment(kMax * 0.62, params)) - 8} fontSize="12" fill={breakevenLabelColor}>
          (n+δ)k (dashed)
        </text>
      </svg>
      </div>

      {/* probe slider: keyboard-operable exploration of any k */}
      <label className="lab-param mt-3 block text-sm">
        <span className="lab-param-head">
          <span>Explore a capital level</span>
          <span className="lab-pill">k = {probe.toFixed(2)}</span>
        </span>
        <input
          type="range"
          className="lab-slider mt-1 block w-full"
          min={kMax * 0.02}
          max={kMax * 0.98}
          step={kMax / 200}
          value={probe}
          onChange={(e) => setProbeK(Number(e.target.value))}
          aria-valuetext={`k = ${probe.toFixed(2)}; ${interpretation.text}`}
        />
      </label>

      {/* deterministic interpretation of the current state */}
      <p className="lab-status mt-3 text-sm" role="status" aria-live="polite">
        {interpretation.text}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(Object.keys(PARAM_LABELS) as (keyof SolowParams)[]).map((key) => {
          const b = SOLOW_BOUNDS[key];
          const meta = PARAM_LABELS[key];
          return (
            <label key={key} className="lab-param block text-sm">
              <span className="lab-param-head">
                <span className="flex items-baseline gap-1">
                  {meta.label} <MathTex latex={meta.latex} />
                </span>
                <span className="lab-pill">{params[key].toFixed(3)}</span>
              </span>
              <input
                type="range"
                className="lab-slider mt-1 block w-full"
                min={b.min}
                max={b.max}
                step={b.step}
                value={params[key]}
                onChange={(e) => setParam(key, Number(e.target.value))}
                aria-label={`${meta.label}: ${meta.describe}`}
                aria-valuetext={`${meta.label} = ${params[key].toFixed(3)}`}
              />
              <span className="lab-param-why">{meta.describe}</span>
            </label>
          );
        })}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <ReadOut label={view === "symbolic" ? "k^{*}" : "steady state k*"} symbolic={view === "symbolic"} value={view === "symbolic" ? "\\left(\\tfrac{sA}{n+\\delta}\\right)^{\\frac{1}{1-\\alpha}}" : kStar.toFixed(2)} />
        <ReadOut label={view === "symbolic" ? "y^{*}" : "output y*"} symbolic={view === "symbolic"} value={view === "symbolic" ? "A(k^{*})^{\\alpha}" : outputPerWorker(kStar, params).toFixed(2)} />
        <ReadOut label={view === "symbolic" ? "c^{*}" : "consumption c*"} symbolic={view === "symbolic"} value={view === "symbolic" ? "(1-s)f(k^{*})" : steadyStateConsumption(params).toFixed(2)} />
        <ReadOut label={view === "symbolic" ? "\\Delta k" : `Δk at k=${probe.toFixed(1)}`} symbolic={view === "symbolic"} value={view === "symbolic" ? "s f(k)-(n+\\delta)k" : capitalChange(probe, params).toFixed(3)} />
      </dl>
    </div>
  );
}

function ReadOut({ label, value, symbolic }: { label: string; value: string; symbolic: boolean }) {
  return (
    <div className="lab-readout">
      <dt className="text-xs">{symbolic ? <MathTex latex={label} /> : label}</dt>
      <dd className="font-mono">{symbolic ? <MathTex latex={value} /> : value}</dd>
    </div>
  );
}
