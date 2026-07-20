"use client";

/**
 * Graph studio (D-030). The teacher picks a well-known function family, sets its
 * parameters with sliders, and sees a mathematically exact, code-rendered curve
 * (engine/graph.ts) — never an AI sketch (GATE-002). The result prints clean via
 * the shared @media print rules (controls are data-print-hide).
 *
 * Implementation only; existing design tokens (project rule: Fabel owns aesthetic).
 */

import Link from "next/link";
import { useState } from "react";
import {
  FUNCTION_FAMILIES,
  defaultParams,
  getFamily,
} from "@/lib/engine/graph";
import { FunctionPlot } from "./FunctionPlot";

export function GraphStudioClient() {
  const [familyId, setFamilyId] = useState(FUNCTION_FAMILIES[0].id);
  const family = getFamily(familyId) ?? FUNCTION_FAMILIES[0];
  const [params, setParams] = useState<Record<string, number>>(() => defaultParams(FUNCTION_FAMILIES[0]));
  const [title, setTitle] = useState("Figure 1");

  const selectFamily = (id: string) => {
    const f = getFamily(id);
    if (!f) return;
    setFamilyId(id);
    setParams(defaultParams(f)); // reset to that family's sensible defaults
  };

  return (
    <div className="print-page">
      <div className="flex flex-wrap items-center justify-between gap-2" data-print-hide>
        <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
          ← Back to teacher workspace
        </Link>
        <button type="button" onClick={() => window.print()} className="btn-primary min-h-12 px-5 py-3 text-white">
          Print / Save as PDF
        </button>
      </div>

      <h1 className="mt-2 text-2xl font-bold">Graph studio</h1>
      <p className="mt-1 text-sm text-app" data-print-hide>
        Pick a function and set its parameters — the curve is computed exactly from the maths, so it&apos;s always
        accurate (never an AI drawing). Print it straight into a worksheet.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
        <figure className="order-2 md:order-1">
          <FunctionPlot family={family} params={params} title={title} />
          <figcaption className="mt-2 text-center text-sm text-app-muted">
            <strong>{title}</strong> — {family.label}: <code>{family.formula}</code>
          </figcaption>
        </figure>

        <div className="order-1 space-y-4 md:order-2" data-print-hide>
          <div>
            <label htmlFor="graph-title" className="block text-sm font-bold">
              Figure title
            </label>
            <input
              id="graph-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="graph-family" className="block text-sm font-bold">
              Function
            </label>
            <select
              id="graph-family"
              value={familyId}
              onChange={(e) => selectFamily(e.target.value)}
              className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-app p-2 text-sm text-app"
            >
              {FUNCTION_FAMILIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-bold">Parameters</legend>
            {family.params.map((p) => (
              <div key={p.key}>
                <label htmlFor={`param-${p.key}`} className="flex items-center justify-between text-xs font-medium">
                  <span>{p.label}</span>
                  <span className="font-mono text-app-muted">{params[p.key]?.toFixed(2)}</span>
                </label>
                <input
                  id={`param-${p.key}`}
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={params[p.key] ?? p.default}
                  onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: Number(e.target.value) }))}
                  className="mt-1 w-full"
                />
              </div>
            ))}
          </fieldset>
        </div>
      </div>
    </div>
  );
}
