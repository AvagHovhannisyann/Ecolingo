/**
 * Explain system (spec §10) — provider abstraction (D-004).
 *
 * The slice ships DeterministicExplainProvider: templated, fully grounded in
 * teacher-visible course objects (definition, equation, misconception
 * registry), never generative, never inventing citations (GATE-001).
 * A live LLM provider implements the same interface in Phase 3 behind the
 * tutor-agent contract in docs/04-ai-orchestration.md §20.5.
 */

import type { Citation, Concept, Equation, Misconception } from "../engine/types";
import type { TeachingStyle } from "../engine/teaching-style";

export type ExplainMode =
  | "simpler"
  | "three_sentences"
  | "step_by_step"
  | "intuition"
  | "mathematics"
  | "example"
  | "graph"
  | "why_wrong";

export interface ExplainInput {
  mode: ExplainMode;
  concept: Concept;
  equation: Equation | null;
  citations: Citation[];
  /** present for why_wrong */
  misconception: Misconception | null;
  simplerVariant: string | null;
  /** D-029: the enrolled course's teaching style, layered onto the tutor prompt
   *  server-side so the AI speaks in the teacher's voice. Only affects the live
   *  provider; the deterministic fallback ignores it. */
  teachingStyle?: TeachingStyle | null;
}

export type Segment = { kind: "text"; text: string } | { kind: "math"; latex: string } | { kind: "graph_ref"; lab: "solow" };

export interface ExplainOutput {
  segments: Segment[];
  citations: Citation[];
  /** honesty about grounding — surfaced as a banner (IDEA-182) */
  uncertainty: "grounded" | "partially_grounded" | "not_in_sources";
  /** whether the prose came from the live tutor or the deterministic fallback */
  generatedBy?: "ai" | "deterministic";
}

export interface ExplainProvider {
  explain(input: ExplainInput): ExplainOutput | Promise<ExplainOutput>;
}

const t = (text: string): Segment => ({ kind: "text", text });
const m = (latex: string): Segment => ({ kind: "math", latex });

export class DeterministicExplainProvider implements ExplainProvider {
  explain(input: ExplainInput): ExplainOutput {
    const { concept, equation, mode } = input;
    // Locked definitions are interpolated verbatim — never rewritten (GATE-004).
    const definition = concept.definition;
    const uncertainty: ExplainOutput["uncertainty"] =
      concept.sourceStatus === "verified" ? "grounded" : "partially_grounded";

    const segments: Segment[] = [];
    switch (mode) {
      case "simpler":
        segments.push(t(!concept.locked && input.simplerVariant ? input.simplerVariant : definition));
        break;
      case "three_sentences":
        segments.push(t(definition));
        if (equation) segments.push(t("In symbols:"), m(equation.latex));
        segments.push(t("If the two sides are not equal, the variable keeps moving until they are."));
        break;
      case "step_by_step":
        segments.push(t(definition));
        if (equation) {
          segments.push(m(equation.latex));
          equation.components.forEach((c, i) => segments.push(t(`Step ${i + 1}: `), m(c.latex), t(` — ${c.meaning}`)));
        }
        break;
      case "intuition":
        segments.push(t(definition), t("Think of it as a race between what is added and what must be replaced: the gap between the two decides which way the variable moves."));
        break;
      case "mathematics":
        if (equation) {
          segments.push(m(equation.latex));
          equation.components.forEach((c) => segments.push(m(c.latex), t(` — ${c.meaning}`)));
        } else {
          segments.push(t("No approved equation is attached to this concept yet."));
        }
        break;
      case "example":
        segments.push(
          t(definition),
          t("Worked example: with s = 0.3, A = 1, α = 1/3, n = 0.02, δ = 0.08, the steady state is k* = (0.3/0.1)^{3/2} ≈ 5.20 — check it in the lab.")
        );
        break;
      case "graph":
        segments.push(t("The graph makes this deterministic relationship visible — drag the parameters and watch the two curves:"), { kind: "graph_ref", lab: "solow" });
        break;
      case "why_wrong":
        if (input.misconception) {
          segments.push(t(`Likely mix-up: ${input.misconception.description}`), t(input.misconception.remediationHint));
        } else {
          segments.push(t("Your answer doesn't match the key. Re-check each term:"), ...(equation ? [m(equation.latex)] : []));
        }
        break;
    }

    // GATE-001: only pass through real, attached citations; never fabricate.
    return { segments, citations: input.citations, uncertainty, generatedBy: "deterministic" };
  }
}

/**
 * Live tutor provider (D-010). It calls the same-origin /api/explain route
 * (which holds the OpenRouter key server-side) for grounded explanatory PROSE,
 * then layers that prose over the deterministic output — keeping every
 * truth-critical segment code-rendered (equations, graph refs; GATE-002) and
 * every citation deterministic (GATE-001). Any failure returns the
 * deterministic result unchanged, so the Explain button never breaks (GATE-009).
 */
export class LLMExplainProvider implements ExplainProvider {
  private readonly det = new DeterministicExplainProvider();

  async explain(input: ExplainInput): Promise<ExplainOutput> {
    const base = this.det.explain(input);
    // never send truth-critical modes' correctness to the model — math/graph
    // segments below are always the code-rendered ones regardless.
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: input.mode,
          conceptName: input.concept.name,
          definition: input.concept.definition,
          equationLatex: input.equation?.latex ?? null,
          equationMeaning: input.equation?.components.map((c) => c.meaning).join("; ") ?? null,
          misconception: input.misconception?.description ?? null,
          sourceLabels: input.citations.map((c) => c.label),
          style: input.teachingStyle ?? undefined,
        }),
      });
      if (!res.ok) return { ...base, generatedBy: "deterministic" };
      const data = (await res.json()) as { text?: string };
      const text = typeof data.text === "string" ? data.text.trim() : "";
      if (!text) return { ...base, generatedBy: "deterministic" };
      // AI prose first; keep only the deterministic non-text (truth-critical)
      // segments — equations and graph references are never model-authored.
      const nonProse = base.segments.filter((s) => s.kind !== "text");
      return {
        segments: [t(text), ...nonProse],
        citations: base.citations,
        uncertainty: base.uncertainty,
        generatedBy: "ai",
      };
    } catch {
      return { ...base, generatedBy: "deterministic" };
    }
  }
}

export const explainProvider: ExplainProvider = new LLMExplainProvider();
