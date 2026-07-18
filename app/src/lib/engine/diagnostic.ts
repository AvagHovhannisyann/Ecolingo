/**
 * Onboarding diagnostic (spec §7.5, IDEA-005/006/007, MVP §27.2).
 * Deterministic items and scoring — AI plays no role here (§4).
 * Results become explicit profile evidence (mathReadiness, graphReading in
 * [0,1]) that personalization may consume; they never touch course mastery.
 */

import { checkNumericAnswer } from "./equivalence";

export type DiagnosticSkill = "math" | "graph";

export interface DiagnosticItem {
  id: string;
  skill: DiagnosticSkill;
  prompt: string;
  kind: "numeric" | "choice";
  /** numeric items */
  numericKey?: { value: number; relTolerance: number };
  unitHint?: string;
  /** choice items */
  options?: { id: string; text: string }[];
  correctOptionId?: string;
  /** choice items may reference the mini Solow diagram */
  showDiagram?: boolean;
}

export const DIAGNOSTIC_ITEMS: DiagnosticItem[] = [
  {
    id: "d-math-1",
    skill: "math",
    prompt: "Solve for x:  2x + 4 = 10",
    kind: "numeric",
    numericKey: { value: 3, relTolerance: 0.001 },
  },
  {
    id: "d-math-2",
    skill: "math",
    prompt: "GDP grows from 200 to 210 in a year. What is the growth rate, in percent?",
    kind: "numeric",
    numericKey: { value: 0.05, relTolerance: 0.005 },
    unitHint: "% or decimal — both fine",
  },
  {
    id: "d-graph-1",
    skill: "graph",
    prompt: "In the diagram, to the LEFT of the crossing point, which curve is higher?",
    kind: "choice",
    showDiagram: true,
    options: [
      { id: "a", text: "The curved solid line" },
      { id: "b", text: "The straight dashed line" },
      { id: "c", text: "They are equal everywhere" },
    ],
    correctOptionId: "a",
  },
  {
    id: "d-graph-2",
    skill: "graph",
    prompt: "If the curved solid line shifts up while the dashed line stays put, the crossing point moves…",
    kind: "choice",
    showDiagram: true,
    options: [
      { id: "a", text: "Right (to a higher k)" },
      { id: "b", text: "Left (to a lower k)" },
      { id: "c", text: "It does not move" },
    ],
    correctOptionId: "a",
  },
];

export interface DiagnosticAnswer {
  itemId: string;
  /** raw text for numeric, optionId for choice */
  response: string;
  confidence: 1 | 2 | 3 | 4 | null;
}

export interface DiagnosticResult {
  mathReadiness: number; // 0..1
  graphReading: number; // 0..1
  /** confidence-vs-performance note, rendered to the learner */
  calibrationNote: string | null;
  answered: number;
}

export function scoreDiagnosticItem(item: DiagnosticItem, response: string): boolean {
  if (item.kind === "numeric" && item.numericKey) {
    return checkNumericAnswer(response, item.numericKey).correct;
  }
  return response === item.correctOptionId;
}

export function scoreDiagnostic(answers: DiagnosticAnswer[]): DiagnosticResult {
  const bySkill: Record<DiagnosticSkill, { correct: number; total: number }> = {
    math: { correct: 0, total: 0 },
    graph: { correct: 0, total: 0 },
  };
  let overConfidentMisses = 0;
  let underConfidentHits = 0;

  for (const a of answers) {
    const item = DIAGNOSTIC_ITEMS.find((i) => i.id === a.itemId);
    if (!item) continue;
    const correct = scoreDiagnosticItem(item, a.response);
    bySkill[item.skill].total += 1;
    if (correct) bySkill[item.skill].correct += 1;
    if (!correct && a.confidence === 4) overConfidentMisses += 1;
    if (correct && a.confidence !== null && a.confidence <= 2) underConfidentHits += 1;
  }

  const ratio = (s: { correct: number; total: number }) => (s.total === 0 ? 0.5 : s.correct / s.total);

  let calibrationNote: string | null = null;
  if (overConfidentMisses > 0) {
    calibrationNote =
      "You were certain on something that didn't land — that's normal, and it's exactly the gap the review schedule will target.";
  } else if (underConfidentHits > 0) {
    calibrationNote = "You got things right while feeling unsure — your understanding is ahead of your confidence.";
  }

  return {
    mathReadiness: ratio(bySkill.math),
    graphReading: ratio(bySkill.graph),
    calibrationNote,
    answered: answers.length,
  };
}

/**
 * Declared adaptation (per-item personalization requirement): a struggling
 * diagnostic suggests gentler defaults. Suggestion only — the learner
 * confirms in the preferences step and can change it anytime (IDEA-024).
 */
export function suggestedDefaults(result: DiagnosticResult): {
  readingLevel: "standard" | "simpler";
  explanationOrder: "visual_first" | "math_first" | "text_first";
} {
  return {
    readingLevel: result.mathReadiness < 0.5 ? "simpler" : "standard",
    explanationOrder: result.mathReadiness >= 0.75 && result.graphReading >= 0.75 ? "math_first" : "visual_first",
  };
}
