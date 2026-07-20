"use client";

/**
 * Universal Explain button + panel (spec §10, IDEA-061..065/069/071).
 * Provider is the live OpenRouter tutor (D-010) with a deterministic grounded
 * fallback (D-004): equations/graphs stay code-rendered (GATE-002) and
 * citations stay deterministic (GATE-001) whichever path answers.
 */

import Link from "next/link";
import { useState } from "react";
import { explainProvider, type ExplainMode, type ExplainOutput } from "@/lib/ai/explain";
import type { Concept, Equation, Misconception } from "@/lib/engine/types";
import type { TeachingStyle } from "@/lib/engine/teaching-style";
import { course } from "@/content/active-course";
import { MathTex } from "./MathTex";
import { GroundedCitationChips } from "./CitationChips";

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
  teachingStyle = null,
}: {
  concept: Concept;
  equation: Equation | null;
  misconception?: Misconception | null;
  simplerVariant?: string | null;
  /** e.g. surface "why is my answer wrong" from feedback (IDEA-071/108) */
  extraMode?: "why_wrong";
  /** D-029: the enrolled course's teaching style, so the tutor uses the
   *  teacher's voice for this learner. */
  teachingStyle?: TeachingStyle | null;
}) {
  const [output, setOutput] = useState<ExplainOutput | null>(null);
  const [activeMode, setActiveMode] = useState<ExplainMode | null>(null);
  const [loadingMode, setLoadingMode] = useState<ExplainMode | null>(null);
  const [reported, setReported] = useState(false);

  const run = async (mode: ExplainMode) => {
    const citations = course.citations.filter((c) => concept.citationIds.includes(c.id));
    setActiveMode(mode);
    setLoadingMode(mode);
    setOutput(null);
    setReported(false);
    try {
      const result = await explainProvider.explain({ mode, concept, equation, citations, misconception, simplerVariant, teachingStyle });
      // ignore a stale response if the learner clicked another mode meanwhile
      setLoadingMode((cur) => {
        if (cur === mode) setOutput(result);
        return cur === mode ? null : cur;
      });
    } catch {
      setLoadingMode((cur) => (cur === mode ? null : cur));
    }
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
            className={`min-h-12 px-3 text-sm ${
              activeMode === mode ? "choice-selected" : "choice-idle"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loadingMode && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[color:var(--app-border)] p-4 text-sm text-app-muted" role="status">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--app-border)] border-t-[var(--growth-green)]" aria-hidden />
          Thinking through it for you…
        </div>
      )}

      {output && !loadingMode && (
        <div className="mt-3 rounded-2xl border border-[color:var(--app-border)] p-4">
          <div className="mb-2 flex items-center gap-2">
            <span
              className="rounded-full bg-[var(--growth-green-tint)] px-2 py-0.5 text-[11px] font-semibold text-[var(--growth-green-text)]"
              title={
                output.generatedBy === "ai"
                  ? "Written just now by the live tutor, grounded in the course facts"
                  : "Offline explanation from the built-in deterministic tutor"
              }
            >
              {output.generatedBy === "ai" ? "✦ AI tutor" : "Offline tutor"}
            </span>
          </div>
          {output.uncertainty !== "grounded" && (
            <p className="mb-2 text-xs text-[color:#ffcf4d]">
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
          <GroundedCitationChips conceptSlug={concept.slug} fallback={output.citations} />
          <div className="mt-3">
            {reported ? (
              <span className="text-xs text-app-muted" role="status">
                Thanks — this explanation was flagged for review.
              </span>
            ) : (
              <button
                type="button"
                className="btn-secondary min-h-12 px-3 text-xs text-app"
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
