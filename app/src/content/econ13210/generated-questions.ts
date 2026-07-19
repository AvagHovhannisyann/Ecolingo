import { toAuthoredQuestion, toAuthoredQuestionMulti } from "@/lib/engine/authored";
import type { Question } from "@/lib/engine/types";

/**
 * AI-generated, TEACHER-RATIFIED question bank seed (D-020 question factory).
 *
 * Provenance: 24 drafts generated live by the tiered question factory
 * (model google/gemma-4-26b-a4b-it:free) against the course source sections, then
 * individually reviewed for economic correctness by the acting teacher
 * (GATE-002: the model suggests, a human confirms every answer key).
 * 17 accepted; 7 rejected:
 *   - q-gen-production-function-4: duplicate of q-gen-fundamental-equation-4 (cross-call dedupe miss)
 *   - q-gen-golden-rule-4: duplicate of q-gen-fundamental-equation-4 (cross-call dedupe miss)
 *   - q-gen-fundamental-equation-6: two defensible options: with α=0.3, c*(s=0.4) marginally exceeds c*(s=0.2), so 'higher consumption' is also true; duplicate template of q-gen-golden-rule-5
 *   - q-gen-steady-state-2: two true options: moving s from 0.2 to 0.3 = α raises consumption toward the Golden Rule maximum, so option c is also correct; duplicate template
 *   - q-gen-fundamental-equation-8: wrong key: above the Golden Rule, steady-state consumption is LOWER, not higher (the model's own rationale says so)
 *   - q-gen-golden-rule-6: underdetermined premise: 'consuming less than max' fixes |s−α| ≠ 0 but not its sign, so the direction of the required change is ambiguous
 *   - q-gen-golden-rule-8: key includes 'investing more than required to maintain k', which is false if the economy is at its own steady state — premise ambiguity
 *
 * Some accepted drafts are re-filed under the concept they actually test
 * (the factory occasionally drifted, e.g. steady-state content tagged under
 * production-function). Every question below carries provenance
 * "ai_approved" and scores through the deterministic engine unchanged.
 */
export function buildGeneratedQuestions(pendingCitationId: string): Question[] {
  return [
    toAuthoredQuestion(
      {
        stem: "In the per-worker production function y = f(k), what does 'k' represent?",
        options: [
          "Output per worker",
          "Capital per worker",
          "The saving rate",
          "The population growth rate",
        ],
        suggestedIndex: 1,
        difficulty: 2,
        transferDistance: 0,
      },
      "production-function",
      1,
      [pendingCitationId],
      { id: "q-gen-production-function-1", expectedSeconds: 40, hint: "y = f(k) maps capital per worker into output per worker — k is the input on the horizontal axis." }
    ),
    toAuthoredQuestion(
      {
        stem: "According to the production function, what happens as each extra unit of capital per worker is added?",
        options: [
          "Output per worker increases at a diminishing rate",
          "Output per worker increases at an increasing rate",
          "Output per worker remains constant",
          "Output per worker decreases",
        ],
        suggestedIndex: 0,
        difficulty: 2,
        transferDistance: 0,
      },
      "production-function",
      0,
      [pendingCitationId],
      { id: "q-gen-production-function-2", expectedSeconds: 40, hint: "The curve gets flatter as k rises: each extra machine helps, but less than the one before." }
    ),
    toAuthoredQuestion(
      {
        stem: "At the steady state, which of the following is true?",
        options: [
          "Actual investment is greater than break-even investment",
          "Actual investment is less than break-even investment",
          "Actual investment equals break-even investment",
          "Output per worker is zero",
        ],
        suggestedIndex: 2,
        difficulty: 2,
        transferDistance: 0,
      },
      "steady-state",
      2,
      [pendingCitationId],
      { id: "q-gen-production-function-3", expectedSeconds: 40, hint: "At k*, the two curves cross: what is saved exactly covers depreciation and new workers." }
    ),
    toAuthoredQuestion(
      {
        stem: "According to the fundamental equation of the Solow model, capital per worker increases when:",
        options: [
          "Actual investment is less than break-even investment",
          "Actual investment exceeds break-even investment",
          "The population growth rate equals the depreciation rate",
          "The saving rate is equal to the capital share",
        ],
        suggestedIndex: 1,
        difficulty: 2,
        transferDistance: 0,
      },
      "fundamental-equation",
      1,
      [pendingCitationId],
      { id: "q-gen-fundamental-equation-1", expectedSeconds: 40, hint: "Δk = s·f(k) − (n+δ)k. When is this expression positive?" }
    ),
    toAuthoredQuestion(
      {
        stem: "In the Solow model, what is the term for the investment required to replace depreciated capital and equip new workers?",
        options: [
          "Actual investment",
          "Golden Rule investment",
          "Break-even investment",
          "Steady-state investment",
        ],
        suggestedIndex: 2,
        difficulty: 2,
        transferDistance: 0,
      },
      "fundamental-equation",
      2,
      [pendingCitationId],
      { id: "q-gen-fundamental-equation-2", expectedSeconds: 40, hint: "It is the investment hurdle the economy must clear just to keep k constant." }
    ),
    toAuthoredQuestion(
      {
        stem: "What happens to capital per worker at the steady state?",
        options: [
          "It increases rapidly",
          "It decreases to zero",
          "It stops changing",
          "It grows at the rate of the population",
        ],
        suggestedIndex: 2,
        difficulty: 2,
        transferDistance: 0,
      },
      "steady-state",
      2,
      [pendingCitationId],
      { id: "q-gen-fundamental-equation-3", expectedSeconds: 40, hint: "Steady state means Δk = 0 — by definition, k holds still." }
    ),
    toAuthoredQuestionMulti(
      {
        stem: "Which of the following are components of break-even investment (n + delta)k?",
        options: [
          "The fraction of output that is saved",
          "The population growth rate",
          "The depreciation rate",
          "The capital share of output",
        ],
        suggestedIndices: [1, 2],
        difficulty: 2,
        transferDistance: 0,
      },
      "fundamental-equation",
      [1, 2],
      [pendingCitationId],
      { id: "q-gen-fundamental-equation-4", expectedSeconds: 55, hint: "Break-even investment is (n+δ)k. Which two rates appear inside the bracket?" }
    ),
    toAuthoredQuestion(
      {
        stem: "A developing economy is currently experiencing a period where the capital per worker is decreasing. Which of the following scenarios must be occurring according to the Solow model?",
        options: [
          "The saving rate has increased, causing break-even investment to rise.",
          "Actual investment is currently less than the sum of depreciation and population growth requirements.",
          "The economy has reached its steady state and is maintaining a constant level of capital.",
          "The marginal product of capital has become zero due to diminishing returns.",
        ],
        suggestedIndex: 1,
        difficulty: 4,
        transferDistance: 1,
      },
      "fundamental-equation",
      1,
      [pendingCitationId],
      { id: "q-gen-fundamental-equation-5", expectedSeconds: 75, hint: "Δk < 0 forces s·f(k) < (n+δ)k. Only one option restates exactly that." }
    ),
    toAuthoredQuestion(
      {
        stem: "In a Solow model, why is the assumption of diminishing returns to capital essential for the existence of a steady state?",
        options: [
          "It ensures that actual investment will eventually equal break-even investment as capital per worker increases.",
          "It guarantees that the population growth rate (n) will eventually decrease to zero.",
          "It prevents the saving rate from changing over time.",
          "It ensures that the capital share (alpha) remains constant regardless of capital accumulation.",
        ],
        suggestedIndex: 0,
        difficulty: 4,
        transferDistance: 1,
      },
      "fundamental-equation",
      0,
      [pendingCitationId],
      { id: "q-gen-fundamental-equation-7", expectedSeconds: 75, hint: "s·f(k) is concave while (n+δ)k is a straight line — concavity is what guarantees they cross." }
    ),
    toAuthoredQuestion(
      {
        stem: "A country is currently in a state where its actual investment per worker is 5% of output per worker, while its break-even investment requirement (accounting for depreciation and population growth) is 7% of output per worker. Which of the following describes the economy's trajectory?",
        options: [
          "The economy is at its steady state and capital per worker is constant.",
          "The economy is approaching its steady state, and output per worker is increasing at a decreasing rate.",
          "The economy is below its steady state, and capital per worker is decreasing.",
          "The economy is above its steady state, and capital per worker is decreasing.",
        ],
        suggestedIndex: 3,
        difficulty: 4,
        transferDistance: 1,
      },
      "steady-state",
      3,
      [pendingCitationId],
      { id: "q-gen-steady-state-1", expectedSeconds: 75, hint: "Saving covers only 5% of output but maintaining k needs 7% — which side of k* makes that gap appear?" }
    ),
    toAuthoredQuestion(
      {
        stem: "A country is currently saving at a rate higher than its Golden Rule saving rate. If the government implements a policy to decrease the saving rate to exactly match the capital share (alpha), what will happen to the steady-state outcome?",
        options: [
          "Steady-state output per worker will increase, but steady-state consumption per worker will decrease.",
          "Steady-state output per worker will decrease, but steady-state consumption per worker will increase.",
          "Both steady-state output and steady-state consumption per worker will increase.",
          "Both steady-state output and steady-state consumption per worker will decrease.",
        ],
        suggestedIndex: 1,
        difficulty: 4,
        transferDistance: 1,
      },
      "steady-state",
      1,
      [pendingCitationId],
      { id: "q-gen-steady-state-3", expectedSeconds: 75, hint: "Lowering s toward the Golden Rule shrinks k* and y*, yet consumption rises toward its maximum." }
    ),
    toAuthoredQuestionMulti(
      {
        stem: "An economist is analyzing a country that has reached its steady state. Which of the following statements must be true in this condition?",
        options: [
          "The change in capital per worker is zero.",
          "Actual investment is equal to break-even investment.",
          "Output per worker is growing at a constant positive rate.",
          "The capital per worker is increasing due to diminishing returns.",
        ],
        suggestedIndices: [0, 1],
        difficulty: 4,
        transferDistance: 1,
      },
      "steady-state",
      [0, 1],
      [pendingCitationId],
      { id: "q-gen-steady-state-4", expectedSeconds: 90, hint: "Without technological progress, per-worker variables stop growing at the steady state." }
    ),
    toAuthoredQuestion(
      {
        stem: "What does the Golden Rule saving rate aim to maximize?",
        options: [
          "Output per worker",
          "Steady-state consumption per worker",
          "Capital per worker",
          "The long-run growth rate",
        ],
        suggestedIndex: 1,
        difficulty: 2,
        transferDistance: 0,
      },
      "golden-rule",
      1,
      [pendingCitationId],
      { id: "q-gen-golden-rule-1", expectedSeconds: 40, hint: "The Golden Rule picks s to maximize what households actually get to consume, not what they produce." }
    ),
    toAuthoredQuestion(
      {
        stem: "In a Cobb–Douglas production function, what is the Golden Rule saving rate?",
        options: [
          "The population growth rate (n)",
          "The depreciation rate (delta)",
          "The capital share (alpha)",
          "The total output (y)",
        ],
        suggestedIndex: 2,
        difficulty: 2,
        transferDistance: 0,
      },
      "golden-rule",
      2,
      [pendingCitationId],
      { id: "q-gen-golden-rule-2", expectedSeconds: 40, hint: "For y = A·k^α, maximizing steady-state consumption gives s* = α exactly." }
    ),
    toAuthoredQuestion(
      {
        stem: "What happens to the long-run growth rate if a country increases its saving rate?",
        options: [
          "The long-run growth rate increases.",
          "The long-run growth rate decreases.",
          "The long-run growth rate remains unchanged.",
          "The long-run growth rate becomes zero.",
        ],
        suggestedIndex: 2,
        difficulty: 2,
        transferDistance: 0,
      },
      "golden-rule",
      2,
      [pendingCitationId],
      { id: "q-gen-golden-rule-3", expectedSeconds: 40, hint: "A higher s raises the LEVEL of y*, but long-run growth per worker returns to zero without technology growth." }
    ),
    toAuthoredQuestion(
      {
        stem: "An economy uses a Cobb-Douglas production function where the capital share (α) is 0.3. If the government implements a policy that increases the saving rate from 0.3 to 0.4, which of the following describes the long-run outcome?",
        options: [
          "The steady-state level of output per worker increases, and the long-run growth rate increases.",
          "The steady-state level of consumption per worker increases, and the long-run growth rate increases.",
          "The steady-state level of output per worker increases, but the long-run growth rate remains unchanged.",
          "The steady-state level of consumption per worker increases, but the long-run growth rate remains unchanged.",
        ],
        suggestedIndex: 2,
        difficulty: 4,
        transferDistance: 1,
      },
      "golden-rule",
      2,
      [pendingCitationId],
      { id: "q-gen-golden-rule-5", expectedSeconds: 75, hint: "Level effect, not growth effect — and starting at s = α, more saving means less steady-state consumption." }
    ),
    toAuthoredQuestion(
      {
        stem: "In a Solow model, why is it impossible for an economy to experience continuous growth in output per worker indefinitely if the production function exhibits diminishing returns to capital?",
        options: [
          "Because increasing capital per worker eventually leads to a point where break-even investment exceeds actual investment.",
          "Because the capital share of output decreases as capital per worker increases.",
          "Because the saving rate is constrained by the need to replace depreciated capital.",
          "Because the population growth rate eventually exceeds the rate of technological progress.",
        ],
        suggestedIndex: 0,
        difficulty: 4,
        transferDistance: 1,
      },
      "steady-state",
      0,
      [pendingCitationId],
      { id: "q-gen-golden-rule-7", expectedSeconds: 75, hint: "Follow the two curves: the straight line (n+δ)k must eventually overtake the flattening s·f(k)." }
    ),
  ];
}
