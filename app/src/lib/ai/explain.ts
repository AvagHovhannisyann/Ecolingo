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
}

export type Segment = { kind: "text"; text: string } | { kind: "math"; latex: string } | { kind: "graph_ref"; lab: "solow" };

export interface ExplainOutput {
  segments: Segment[];
  citations: Citation[];
  /** honesty about grounding — surfaced as a banner (IDEA-182) */
  uncertainty: "grounded" | "partially_grounded" | "not_in_sources";
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
    return { segments, citations: input.citations, uncertainty };
  }
}

export const explainProvider: ExplainProvider = new DeterministicExplainProvider();
