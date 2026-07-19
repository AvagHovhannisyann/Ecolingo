"use client";

/**
 * Intertemporal Budget Lab (spec §13.3, IDEA-075/076/200, MVP §27.8).
 *
 * Truth-critical rules:
 * - All geometry from src/lib/engine/budget.ts (code-controlled, GATE-002).
 * - TEST-ECON-006: changing r rotates the line around the endowment point.
 * - TEST-ECON-007: the compensated (Slutsky) line is parallel to the new
 *   budget line and passes through the original bundle.
 * - Deterministic interpretation for every state (lender/borrower/autarky).
 * - Keyboard-operable range inputs; curves distinguished by dash + label,
 *   never colour alone. Reduced-motion safe (no animation carries meaning).
 *
 * Visual styling: D-020 dark game surface (lab/lab.css) — presentational only;
 * the geometry pipeline above is untouched.
 */

import { useMemo, useState } from "react";
import {
  budgetLineC2,
  budgetSlope,
  c1Intercept,
  c2Intercept,
  classifyChoice,
  compensatedLineC2,
  lifetimeWealthPV,
  type BudgetParams,
} from "@/lib/engine/budget";
import { MathTex } from "./MathTex";
import "./lab/lab.css";

const W = 560;
const H = 420;
const PAD = { l: 52, r: 16, t: 16, b: 44 };

const R0 = 0.05; // reference rate for the compensated-line comparison

export function BudgetLab({
  onStateChange,
}: {
  onStateChange?: (s: { r: number; c1: number; role: "lender" | "borrower" | "autarky" }) => void;
}) {
  const [r, setR] = useState(R0);
  const [c1, setC1] = useState(90);
  const [showCompensated, setShowCompensated] = useState(false);
  const endow = useMemo(() => ({ y1: 100, y2: 110 }), []);

  const params: BudgetParams = { ...endow, r };
  const refParams: BudgetParams = { ...endow, r: R0 };

  // original bundle: the learner's chosen c1 evaluated on the REFERENCE line,
  // so the compensated construction matches the taught experiment
  const originalBundle = useMemo(
    () => ({ c1, c2: budgetLineC2(c1, refParams) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c1]
  );

  const xMax = Math.max(c1Intercept(refParams), c1Intercept(params)) * 1.1;
  const yMax = Math.max(c2Intercept(refParams), c2Intercept(params)) * 1.1;
  const x = (v: number) => PAD.l + (v / xMax) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);

  const linePath = (fn: (c: number) => number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 100; i++) {
      const cx = (i / 100) * xMax;
      const cy = fn(cx);
      if (cy < 0 || cy > yMax) continue;
      pts.push(`${pts.length === 0 ? "M" : "L"}${x(cx).toFixed(1)},${y(cy).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  const chosenC2 = Math.max(0, budgetLineC2(c1, params));
  const role = classifyChoice(c1, params);
  const roleText =
    role === "lender"
      ? `You consume less than your period-1 income (c₁ < y₁), so you save the difference and lend it at rate r — a lender.`
      : role === "borrower"
        ? `You consume more than your period-1 income (c₁ > y₁), so you borrow against future income at rate r — a borrower.`
        : `You consume exactly your endowment in each period — neither lending nor borrowing (autarky).`;

  const update = (nr: number, nc1: number) => {
    setR(nr);
    setC1(nc1);
    onStateChange?.({ r: nr, c1: nc1, role: classifyChoice(nc1, { ...endow, r: nr }) });
  };

  // Stroke colours are gate-locked (lab-keyboard e2e selects the solid budget
  // line by stroke="#0072B2"); the *Label variants are brighter same-hue tints
  // so 12px text clears AA on the dark chart canvas.
  const budgetColor = "#0072B2";
  const refColor = "#94a4af";
  const compColor = "#D55E00";
  const budgetLabelColor = "#4cc2ff";
  const compLabelColor = "#ff9d5c";

  return (
    <div className="lab-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          Intertemporal Budget Lab — <MathTex latex="c_2 = y_2 + (1+r)(y_1 - c_1)" />
        </h3>
        <button
          type="button"
          className="btn-secondary min-h-12 px-3 text-sm"
          onClick={() => setShowCompensated((v) => !v)}
          aria-pressed={showCompensated}
        >
          {showCompensated ? "Hide" : "Show"} compensated line
        </button>
      </div>

      <div className="lab-chart mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        className="w-full max-w-full"
        aria-label={`Two-period budget diagram. Interest rate ${(r * 100).toFixed(0)} percent. Endowment y1=${endow.y1}, y2=${endow.y2}. Chosen consumption today ${c1.toFixed(0)}, tomorrow ${chosenC2.toFixed(0)}. ${roleText}`}
      >
        {/* axes */}
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="currentColor" strokeWidth="1" />
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="currentColor" strokeWidth="1" />
        <text x={W - PAD.r} y={H - PAD.b + 26} textAnchor="end" fontSize="12">
          consumption today c₁
        </text>
        <text x={PAD.l - 40} y={PAD.t + 8} fontSize="12">
          c₂
        </text>

        {/* reference line at r0 (only when comparing) */}
        {showCompensated && r !== R0 && (
          <path d={linePath((c) => budgetLineC2(c, refParams))} fill="none" stroke={refColor} strokeWidth="1.5" strokeDasharray="2 4" />
        )}

        {/* current budget line: solid */}
        <path d={linePath((c) => budgetLineC2(c, params))} fill="none" stroke={budgetColor} strokeWidth="2.5" />

        {/* compensated line: dashed, parallel to current line through original bundle */}
        {showCompensated && r !== R0 && (
          <path
            d={linePath((c) => compensatedLineC2(c, originalBundle, r))}
            fill="none"
            stroke={compColor}
            strokeWidth="2.5"
            strokeDasharray="8 5"
          />
        )}

        {/* endowment point — the rotation pivot (TEST-ECON-006) */}
        <circle cx={x(endow.y1)} cy={y(endow.y2)} r="6" fill="currentColor" />
        <text x={x(endow.y1) + 8} y={y(endow.y2) - 8} fontSize="12">
          endowment (y₁, y₂)
        </text>

        {/* chosen bundle */}
        <circle cx={x(c1)} cy={y(chosenC2)} r="6" fill={budgetColor} stroke="white" strokeWidth="2" />
        <text x={x(c1) + 8} y={y(chosenC2) + 14} fontSize="12" fill={budgetLabelColor}>
          your choice
        </text>

        {/* labels (not colour-only) */}
        <text x={x(xMax * 0.55)} y={y(budgetLineC2(xMax * 0.55, params)) - 8} fontSize="12" fill={budgetLabelColor}>
          budget line (solid)
        </text>
        {showCompensated && r !== R0 && (
          <text x={x(xMax * 0.28)} y={y(compensatedLineC2(xMax * 0.28, originalBundle, r)) - 8} fontSize="12" fill={compLabelColor}>
            compensated (dashed)
          </text>
        )}
      </svg>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="lab-param block text-sm">
          <span className="lab-param-head">
            <span>Real interest rate r</span>
            <span className="lab-pill">{(r * 100).toFixed(0)}%</span>
          </span>
          <input
            type="range"
            className="lab-slider mt-1 block w-full"
            min={-0.2}
            max={0.5}
            step={0.01}
            value={r}
            onChange={(e) => update(Number(e.target.value), c1)}
            aria-valuetext={`interest rate ${(r * 100).toFixed(0)} percent; the line rotates around the endowment point`}
          />
          <span className="lab-param-why">rotates the line around the endowment — the endowment stays affordable at any r</span>
        </label>
        <label className="lab-param block text-sm">
          <span className="lab-param-head">
            <span>Consumption today c₁</span>
            <span className="lab-pill">{c1.toFixed(0)}</span>
          </span>
          <input
            type="range"
            className="lab-slider mt-1 block w-full"
            min={5}
            max={Math.floor(c1Intercept(params)) - 1}
            step={1}
            value={Math.min(c1, Math.floor(c1Intercept(params)) - 1)}
            onChange={(e) => update(r, Number(e.target.value))}
            aria-valuetext={`consumption today ${c1.toFixed(0)}; you are a ${role}`}
          />
          <span className="lab-param-why">move along the budget line to choose today vs tomorrow</span>
        </label>
      </div>

      <p className="lab-status mt-3 text-sm" role="status" aria-live="polite">
        {roleText}
      </p>
      {showCompensated && r !== R0 && (
        <p className="lab-note mt-3 text-sm text-[color:#ffb060]">
          The dashed compensated line has the <em>new</em> slope −(1+r) but passes through your original bundle:
          movement along it is the pure <strong>substitution effect</strong>; the remaining jump to the new line is the{" "}
          <strong>income effect</strong>.
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <ReadOut label="lifetime wealth (PV)" value={lifetimeWealthPV(params).toFixed(1)} />
        <ReadOut label="slope" value={budgetSlope(params).toFixed(2)} />
        <ReadOut label="c₂ if you choose this c₁" value={chosenC2.toFixed(1)} />
        <ReadOut label="saving today (y₁−c₁)" value={(endow.y1 - c1).toFixed(0)} />
      </dl>
    </div>
  );
}

function ReadOut({ label, value }: { label: string; value: string }) {
  return (
    <div className="lab-readout">
      <dt className="text-xs">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
