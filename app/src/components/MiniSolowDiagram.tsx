"use client";

/**
 * Small static Solow-style diagram, computed from the engine (GATE-002).
 * Used by the onboarding diagnostic (unlabelled curves) and the
 * diagram-labelling question format (numbered slot markers).
 * Curves are distinguished by solid vs dashed — never colour alone.
 */

import { useMemo } from "react";
import { SOLOW_DEFAULTS, actualInvestment, breakEvenInvestment, steadyStateK } from "@/lib/engine/solow";

const W = 420;
const H = 260;
const PAD = { l: 36, r: 12, t: 12, b: 30 };

export function MiniSolowDiagram({
  slotMarkers = false,
  ariaLabel,
}: {
  /** show numbered markers ①②③ on curve A, line B, crossing point */
  slotMarkers?: boolean;
  ariaLabel: string;
}) {
  const p = SOLOW_DEFAULTS;
  const kStar = useMemo(() => steadyStateK(p), [p]);
  const kMax = kStar * 1.8;
  const yMax = Math.max(actualInvestment(kMax, p), breakEvenInvestment(kMax, p)) * 1.15;
  const x = (k: number) => PAD.l + (k / kMax) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b);

  const path = (fn: (k: number) => number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 80; i++) {
      const k = (i / 80) * kMax + 1e-9;
      pts.push(`${i === 0 ? "M" : "L"}${x(k).toFixed(1)},${y(fn(k)).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  const marker = (n: string, cx: number, cy: number) => (
    <g>
      <circle cx={cx} cy={cy} r="11" fill="white" stroke="currentColor" strokeWidth="1.5" />
      {/* explicit dark fill: SVG text defaults to black, but be deliberate on the white chip */}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#131f24">
        {n}
      </text>
    </g>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="w-full max-w-md">
      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="currentColor" strokeWidth="1" />
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="currentColor" strokeWidth="1" />
      {/* fill=currentColor: default SVG text fill is black — invisible on the dark game surface */}
      <text x={W - PAD.r} y={H - PAD.b + 20} textAnchor="end" fontSize="11" fill="currentColor">
        k
      </text>

      {/* curve A: curved solid; line B: straight dashed */}
      <path d={path((k) => actualInvestment(k, p))} fill="none" stroke="#0072B2" strokeWidth="2.5" />
      <path d={path((k) => breakEvenInvestment(k, p))} fill="none" stroke="#D55E00" strokeWidth="2.5" strokeDasharray="7 5" />
      <circle cx={x(kStar)} cy={y(actualInvestment(kStar, p))} r="4" fill="currentColor" />

      {slotMarkers && (
        <>
          {marker("1", x(kMax * 0.55), y(actualInvestment(kMax * 0.55, p)) - 18)}
          {marker("2", x(kMax * 0.82), y(breakEvenInvestment(kMax * 0.82, p)) + 20)}
          {marker("3", x(kStar) + 18, y(actualInvestment(kStar, p)) - 14)}
        </>
      )}
    </svg>
  );
}
