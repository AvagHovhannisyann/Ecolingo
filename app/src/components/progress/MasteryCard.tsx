"use client";

/**
 * Per-concept mastery card (§22): the FIVE engine dimensions — conceptual,
 * procedural, graph reading, formula recall, transfer — each as its own
 * labeled bar. Retention and confidence appear as separate visible meta
 * values. Nothing here ever collapses mastery into one blended number.
 */

import { misconceptions } from "@/content/econ13210";
import { dominantMisconception, retentionAt } from "@/lib/engine/mastery";
import type { Concept, MasteryState } from "@/lib/engine/types";
import { DimensionBar } from "./DimensionBar";

/** the real MasteryState dimensions (src/lib/engine/types.ts) with learner-facing labels */
const DIMENSIONS = [
  ["conceptual", "Conceptual"],
  ["procedural", "Procedural"],
  ["graphInterpretation", "Graph reading"],
  ["formulaRecall", "Formula recall"],
  ["transfer", "Transfer"],
] as const;

export function MasteryCard({
  concept,
  mastery,
  nowISO,
}: {
  concept: Concept;
  mastery: MasteryState;
  nowISO: string;
}) {
  const retention = retentionAt(mastery, nowISO);
  const mc = dominantMisconception(mastery);
  const mcInfo = mc ? misconceptions.find((x) => x.slug === mc.slug) : null;

  return (
    <li className="card pg-card">
      <div className="pg-card-head">
        <h3 className="text-base font-bold">{concept.name}</h3>
        <span className="pg-evidence-chip">
          {mastery.evidenceCount} evidence event{mastery.evidenceCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="pg-dims">
        {DIMENSIONS.map(([key, label]) => (
          <DimensionBar key={key} label={label} value={mastery[key]} />
        ))}
      </div>
      <p className="pg-meta">
        <span>Retention now: {Math.round(retention * 100)}%</span>
        <span>Confidence: {Math.round(mastery.confidence * 100)}%</span>
      </p>
      {mcInfo && <p className="pg-mixup">Active mix-up to clear: {mcInfo.description}</p>}
    </li>
  );
}
