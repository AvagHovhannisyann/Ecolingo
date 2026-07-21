"use client";

/**
 * Graph studio (D-030 / D-048). The teacher either DESCRIBES the graph they want
 * (the AI maps it to an exact family + parameters + labels — never a drawing,
 * GATE-002) or picks a family and sets parameters with sliders. Either way the
 * curve is computed exactly from the maths (engine/graph.ts). Axis labels and a
 * title travel with the figure so it's never unlabelled. Prints clean via the
 * shared @media print rules.
 *
 * Implementation only; existing design tokens (project rule: Fabel owns aesthetic).
 */

import Link from "next/link";
import { useState } from "react";
import { FUNCTION_FAMILIES, defaultParams, getFamily, type GraphSpec } from "@/lib/engine/graph";
import { useTeachingStyle } from "@/lib/teaching-style-store";
import { FunctionPlot } from "./FunctionPlot";

export function GraphStudioClient() {
  const style = useTeachingStyle();
  const [familyId, setFamilyId] = useState(FUNCTION_FAMILIES[0].id);
  const family = getFamily(familyId) ?? FUNCTION_FAMILIES[0];
  const [params, setParams] = useState<Record<string, number>>(() => defaultParams(FUNCTION_FAMILIES[0]));
  const [title, setTitle] = useState("Figure 1");
  const [xLabel, setXLabel] = useState("x");
  const [yLabel, setYLabel] = useState("y");

  // AI "describe your graph" state
  const [request, setRequest] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genNote, setGenNote] = useState<string | null>(null);

  const selectFamily = (id: string) => {
    const f = getFamily(id);
    if (!f) return;
    setFamilyId(id);
    setParams(defaultParams(f)); // reset to that family's sensible defaults
  };

  const applySpec = (spec: GraphSpec) => {
    if (!getFamily(spec.familyId)) return;
    setFamilyId(spec.familyId);
    setParams(spec.params);
    setTitle(spec.title);
    setXLabel(spec.xLabel);
    setYLabel(spec.yLabel);
  };

  const describe = async () => {
    if (request.trim().length < 3) return;
    setGenBusy(true);
    setGenNote(null);
    try {
      const res = await fetch("/api/graph-spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: request.trim(), style }),
      });
      if (res.status === 503) {
        setGenNote("Live AI isn't configured on the server, so auto-graph is off — the manual controls still work.");
      } else if (!res.ok) {
        setGenNote("Couldn't turn that into a graph just now — try rephrasing, or build it with the controls.");
      } else {
        const data = (await res.json()) as { spec?: GraphSpec | null };
        if (data.spec) applySpec(data.spec);
        else
          setGenNote(
            "That didn't match a graph type I can render exactly. Try describing a linear, quadratic, exponential, logarithmic, power (diminishing-returns) or logistic (S-curve) relationship.",
          );
      }
    } catch {
      setGenNote("Couldn't reach the graph assistant — check your connection.");
    }
    setGenBusy(false);
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
        Describe the graph you want, or set it up by hand. Either way the curve is computed exactly from the maths —
        it&apos;s always accurate and correctly labelled, never an AI drawing.
      </p>

      {/* describe-your-graph */}
      <div className="card mt-4 p-4" data-print-hide>
        <label htmlFor="graph-request" className="block text-sm font-bold">
          Describe the graph you want
        </label>
        <textarea
          id="graph-request"
          rows={2}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="e.g. a diminishing-returns production function, output vs capital per worker"
          className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm"
        />
        <button
          type="button"
          onClick={() => void describe()}
          disabled={genBusy || request.trim().length < 3}
          className="btn-primary mt-2 min-h-11 px-4 text-sm text-white disabled:opacity-50"
        >
          {genBusy ? "Building…" : "✦ Make this graph"}
        </button>
        <span className="ml-2 text-xs text-app-muted">You can fine-tune it with the sliders after.</span>
        {genNote && (
          <p className="mt-2 rounded-xl bg-[var(--coral-tint)] p-3 text-sm text-[var(--deep-ink)]" role="status">
            {genNote}
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
        <figure className="order-2 md:order-1">
          <FunctionPlot family={family} params={params} title={title} xLabel={xLabel} yLabel={yLabel} />
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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="graph-xlabel" className="block text-sm font-bold">
                x-axis label
              </label>
              <input
                id="graph-xlabel"
                type="text"
                value={xLabel}
                onChange={(e) => setXLabel(e.target.value)}
                className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="graph-ylabel" className="block text-sm font-bold">
                y-axis label
              </label>
              <input
                id="graph-ylabel"
                type="text"
                value={yLabel}
                onChange={(e) => setYLabel(e.target.value)}
                className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-2 text-sm"
              />
            </div>
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
