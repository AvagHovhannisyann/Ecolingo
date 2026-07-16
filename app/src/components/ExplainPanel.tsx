"use client";

/**
 * Universal Explain button + panel (spec §10, IDEA-061..065/069/071).
 * Provider is the deterministic grounded fallback in the slice (D-004);
 * a live tutor agent implements the same interface in Phase 3.
 */

import Link from "next/link";
import { useState } from "react";
import { explainProvider, type ExplainMode, type ExplainOutput } from "@/lib/ai/explain";
import type { Concept, Equation, Misconception } from "@/lib/engine/types";
import { course } from "@/content/econ13210";
import { MathTex } from "./MathTex";
import { CitationChips } from "./CitationChips";

const MODES: { mode: ExplainMode; label: string }[] = [
  { mode: "simpler", label: "Explain more simply" },
  { mode: "three_sentences", label: "In three sentences" },
  { mode: "step_by_step", label: "Step by step" },
  { mode: "intuition", label: "Show the intuition" },
  { mode: "mathematics", label: "Show the mathematics" },
  { mode: "example", label: "Give me an example" },
  { mode: "graph", label: "Explain with the graph" },
];

export function ExplainPanel({
  concept,
  equation,
  misconception = null,
  simplerVariant = null,
  extraMode,
}: {
  concept: Concept;
  equation: Equation | null;
  misconception?: Misconception | null;
  simplerVariant?: string | null;
  /** e.g. surface "why is my answer wrong" from feedback (IDEA-071/108) */
  extraMode?: "why_wrong";
}) {
  const [output, setOutput] = useState<ExplainOutput | null>(null);
  const [activeMode, setActiveMode] = useState<ExplainMode | null>(null);
  const [reported, setReported] = useState(false);

  const run = async (mode: ExplainMode) => {
    const citations = course.citations.filter((c) => concept.citationIds.includes(c.id));
    const result = await explainProvider.explain({ mode, concept, equation, citations, misconception, simplerVariant });
    setOutput(result);
    setActiveMode(mode);
    setReported(false);
  };

  const modes: { mode: ExplainMode; label: string }[] =
    extraMode === "why_wrong" ? [{ mode: "why_wrong", label: "Explain why my answer is wrong" }, ...MODES] : MODES;

  return (
    <section aria-label={`Explain ${concept.name}`} className="mt-3">
      <div className="flex flex-wrap gap-2">
        {modes.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => run(mode)}
            aria-pressed={activeMode === mode}
            className={`min-h-12 rounded-xl border px-3 text-sm ${
              activeMode === mode ? "border-gray-900 bg-gray-900 text-white" : "border-gray-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {output && (
        <div className="mt-3 rounded-2xl border border-gray-300 p-4">
          {output.uncertainty !== "grounded" && (
            <p className="mb-2 text-xs text-amber-800">
              {output.uncertainty === "partially_grounded"
                ? "Grounding note: this explanation uses course structure that hasn't been verified against uploaded lectures yet."
                : "This isn't covered by the course materials — no answer invented."}
            </p>
          )}
          <div className="space-y-1 text-sm leading-relaxed">
            {output.segments.map((seg, i) =>
              seg.kind === "text" ? (
                <p key={i}>{seg.text}</p>
              ) : seg.kind === "math" ? (
                <MathTex key={i} latex={seg.latex} block />
              ) : (
                <p key={i}>
                  <Link className="underline" href="/lab/solow">
                    Open the Solow Lab →
                  </Link>
                </p>
              )
            )}
          </div>
          <CitationChips citations={output.citations} />
          <div className="mt-3">
            {reported ? (
              <span className="text-xs text-gray-600" role="status">
                Thanks — this explanation was flagged for review.
              </span>
            ) : (
              <button
                type="button"
                className="min-h-12 rounded-xl border border-gray-300 px-3 text-xs text-gray-700"
                onClick={() => setReported(true)}
              >
                Report as confusing or incorrect
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
