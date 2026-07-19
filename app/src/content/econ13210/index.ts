/**
 * ECON 13210 seed content — World 2 (Solow growth).
 *
 * PROVENANCE (D-005): no lecture files have been ingested yet. Everything
 * here derives from the canonical equations in the product spec and standard
 * course structure, and is marked `planned_unverified`. Citations render as
 * "pending teacher upload" until ingestion (Phase 2) attaches real
 * page-level sources. GATE-001 forbids presenting these as verified.
 */

import type {
  Citation,
  Concept,
  ConceptEdge,
  Equation,
  Lesson,
  Misconception,
  Question,
} from "../../lib/engine/types";
import { buildGeneratedQuestions } from "./generated-questions";
import { buildMatchPairsSeed } from "./match-pairs-seed";
import { buildClozeSeedQuestions } from "./cloze-seed";

export const PENDING_CITATION: Citation = {
  id: "cit-pending-solow",
  label: "Source pending — teacher lecture upload required for verification",
  sourceFileId: null,
  pageStart: null,
  pageEnd: null,
  status: "planned_unverified",
};

export const citations: Citation[] = [PENDING_CITATION];

export const concepts: Concept[] = [
  {
    id: "c-prod",
    slug: "production-function",
    name: "Production function (per worker)",
    world: 2,
    definition:
      "Output per worker depends on capital per worker: y = f(k), with more capital raising output at a diminishing rate.",
    locked: false,
    importance: 4,
    examinable: true,
    sourceStatus: "planned_unverified",
    citationIds: [PENDING_CITATION.id],
  },
  {
    id: "c-fund",
    slug: "fundamental-equation",
    name: "Fundamental equation of the Solow model",
    world: 2,
    definition:
      "Capital per worker rises when actual investment exceeds the amount required to replace depreciated capital and equip new workers.",
    locked: false,
    importance: 5,
    examinable: true,
    sourceStatus: "planned_unverified",
    citationIds: [PENDING_CITATION.id],
  },
  {
    id: "c-steady",
    slug: "steady-state",
    name: "Steady state",
    world: 2,
    definition:
      "The steady state is the level of capital per worker k* at which actual investment exactly equals break-even investment, so capital per worker stops changing.",
    locked: false,
    importance: 5,
    examinable: true,
    sourceStatus: "planned_unverified",
    citationIds: [PENDING_CITATION.id],
  },
  {
    id: "c-golden",
    slug: "golden-rule",
    name: "Golden Rule of saving",
    world: 2,
    definition:
      "The Golden Rule saving rate maximizes steady-state consumption; for a Cobb–Douglas production function it equals the capital share α.",
    locked: false,
    importance: 4,
    examinable: true,
    sourceStatus: "planned_unverified",
    citationIds: [PENDING_CITATION.id],
  },
];

export const conceptEdges: ConceptEdge[] = [
  { prereqSlug: "production-function", conceptSlug: "fundamental-equation", kind: "requires" },
  { prereqSlug: "fundamental-equation", conceptSlug: "steady-state", kind: "requires" },
  // The production function (diminishing returns) is the engine behind the
  // steady state; with a production-function lesson now teachable, this direct
  // "requires" edge makes the intended path production-function → steady-state
  // → golden-rule enforceable by the gating rule. (The fundamental-equation
  // link above still holds but has no lesson, so it cannot gate on its own.)
  { prereqSlug: "production-function", conceptSlug: "steady-state", kind: "requires" },
  { prereqSlug: "steady-state", conceptSlug: "golden-rule", kind: "requires" },
];

export const equations: Equation[] = [
  {
    id: "eq-production",
    conceptSlug: "production-function",
    latex: "y = f(k) = A\\,k^{\\alpha}",
    components: [
      { latex: "y", meaning: "output per worker" },
      { latex: "A", meaning: "total factor productivity (TFP): how efficiently the economy turns inputs into output — a higher A scales the whole curve up at every level of capital" },
      { latex: "k^{\\alpha}", meaning: "capital per worker raised to the capital share α, with 0 < α < 1 — the exponent being below 1 is exactly what makes capital's marginal product diminish" },
      { latex: "\\alpha", meaning: "capital share of income (0 < α < 1): the curvature of f(k), and the elasticity of output with respect to capital" },
    ],
    approved: true,
    sourceStatus: "planned_unverified",
  },
  {
    id: "eq-fundamental",
    conceptSlug: "fundamental-equation",
    latex: "\\Delta k = s\\,f(k) - (n+\\delta)\\,k",
    components: [
      { latex: "\\Delta k", meaning: "change in capital per worker" },
      { latex: "s\\,f(k)", meaning: "actual investment: the saved share of output per worker" },
      { latex: "(n+\\delta)\\,k", meaning: "break-even investment: replacing depreciated capital (δk) and equipping new workers (nk)" },
    ],
    approved: false,
    sourceStatus: "planned_unverified",
  },
  {
    id: "eq-steady",
    conceptSlug: "steady-state",
    latex: "s\\,f(k^{*}) = (n+\\delta)\\,k^{*}",
    components: [
      { latex: "s\\,f(k^{*})", meaning: "actual investment at the steady state" },
      { latex: "(n+\\delta)\\,k^{*}", meaning: "break-even investment at the steady state" },
    ],
    approved: false,
    sourceStatus: "planned_unverified",
  },
  {
    id: "eq-golden",
    conceptSlug: "golden-rule",
    latex: "f'(k_{GR}) = n + \\delta \\;\\;\\Longleftrightarrow\\;\\; s_{GR} = \\alpha \\text{ (Cobb–Douglas)}",
    components: [
      { latex: "f'(k_{GR})", meaning: "marginal product of capital at the Golden Rule capital stock" },
      { latex: "n + \\delta", meaning: "break-even requirement per extra unit of capital" },
      { latex: "s_{GR} = \\alpha", meaning: "with Cobb–Douglas production, the consumption-maximizing saving rate equals the capital share" },
    ],
    approved: false,
    sourceStatus: "planned_unverified",
  },
];

export const misconceptions: Misconception[] = [
  {
    slug: "linear-production",
    conceptSlug: "production-function",
    description: "Believing output grows in direct proportion to capital — that doubling capital per worker doubles output per worker.",
    remediationHint:
      "Because 0 < α < 1, the curve y = A·k^α bends over: each extra unit of capital adds less output than the one before (diminishing marginal product). Doubling k multiplies output by 2^α < 2, not by 2 — the graph is a curve, not a straight line.",
  },
  {
    slug: "s-rotates-breakeven",
    conceptSlug: "fundamental-equation",
    description: "Believing a change in the saving rate s rotates the break-even line.",
    remediationHint:
      "s only scales actual investment s·f(k). The break-even line (n+δ)k depends on n and δ alone — try moving each slider in the lab and watch which curve responds.",
  },
  {
    slug: "steady-state-max-output",
    conceptSlug: "steady-state",
    description: "Believing the steady state is where output is maximized.",
    remediationHint:
      "The steady state is where capital per worker stops changing — where the two investment curves cross — not where output peaks. Output would keep rising with more capital; it's Δk that hits zero.",
  },
  {
    slug: "higher-s-higher-growth-forever",
    conceptSlug: "steady-state",
    description: "Believing a higher saving rate raises the growth rate permanently.",
    remediationHint:
      "A higher s raises the level of the steady state, producing temporarily faster growth during the transition — but at the new steady state, growth of capital per worker returns to zero.",
  },
  {
    slug: "saving-more-always-better",
    conceptSlug: "golden-rule",
    description: "Believing a higher saving rate always raises steady-state consumption.",
    remediationHint:
      "Past the Golden Rule, extra saving builds capital whose output can't even cover its own replacement — steady-state consumption falls. In the lab, push s above α and watch c* decline.",
  },
  {
    slug: "delta-is-investment",
    conceptSlug: "fundamental-equation",
    description: "Treating depreciation (δk) as a form of investment rather than a requirement to offset.",
    remediationHint:
      "δk is capital wearing out. It sits inside break-even investment — the hurdle that actual investment must clear before capital per worker can grow.",
  },
];

export const questions: Question[] = [
  {
    id: "q-prod-mc-1",
    conceptSlug: "production-function",
    type: "mc_single",
    stem: "In the production function y = A·k^α with 0 < α < 1, what happens to the extra output from each additional unit of capital per worker as k rises?",
    difficulty: 2,
    expectedSeconds: 30,
    transferDistance: 0,
    provenance: "ai_draft",
    hint: "Think about the exponent α. Is it above or below 1, and what does that do to the slope of the curve as k grows?",
    citationIds: [PENDING_CITATION.id],
    options: [
      { id: "a", text: "Each additional unit of capital adds less output than the one before — the marginal product of capital diminishes." },
      { id: "b", text: "Each additional unit adds the same output — output is proportional to capital.", misconceptionSlug: "linear-production" },
      { id: "c", text: "Output per worker doubles whenever capital per worker doubles.", misconceptionSlug: "linear-production" },
      { id: "d", text: "Output per worker falls outright as capital per worker rises." },
    ],
    answerKey: { correctOptionId: "a" },
  },
  {
    id: "q-prod-numeric-1",
    conceptSlug: "production-function",
    type: "numeric",
    stem: "A country has total factor productivity A = 2, capital per worker k = 64, and capital share α = 0.5. Using y = A·k^α, compute output per worker y.",
    difficulty: 2,
    expectedSeconds: 60,
    transferDistance: 0,
    provenance: "ai_draft",
    hint: "k^α = 64^0.5 = √64 = 8; then multiply by A = 2.",
    citationIds: [PENDING_CITATION.id],
    unitLabel: "units of output per worker",
    answerKey: { value: 16, relTolerance: 0.01 },
  },
  {
    id: "q-prod-causal-1",
    conceptSlug: "production-function",
    type: "causal_order",
    stem: "Order the reasoning for why diminishing returns to capital make a steady state possible.",
    difficulty: 3,
    expectedSeconds: 75,
    transferDistance: 0,
    provenance: "ai_draft",
    hint: "Start from the shape of f(k), then compare how the two investment curves grow as k rises.",
    citationIds: [PENDING_CITATION.id],
    items: [
      { id: "p1", text: "Output per worker follows y = A·k^α with 0 < α < 1" },
      { id: "p2", text: "Each extra unit of capital adds less output than the last (marginal product of capital falls as k rises)" },
      { id: "p3", text: "So actual investment s·f(k) keeps rising, but by ever-smaller amounts — the curve flattens" },
      { id: "p4", text: "Break-even investment (n+δ)k meanwhile keeps rising in a straight line" },
      { id: "p5", text: "The flattening investment curve is caught by the straight break-even line; they cross at a finite k*, the steady state" },
    ],
    answerKey: { orderedItemIds: ["p1", "p2", "p3", "p4", "p5"] },
  },
  {
    id: "q-prod-transfer-1",
    conceptSlug: "production-function",
    type: "mc_single",
    stem: "A data team keeps adding servers to speed up one fixed nightly job. The first few servers cut the run time a lot; the tenth server barely helps. Which production-function idea does this illustrate?",
    difficulty: 3,
    expectedSeconds: 60,
    transferDistance: 1,
    provenance: "ai_draft",
    hint: "The workload (like the worker) is fixed while capital (servers) piles up. What does f(k) predict about each new unit's contribution?",
    citationIds: [PENDING_CITATION.id],
    options: [
      { id: "a", text: "Diminishing marginal product of capital: each added server contributes less than the one before." },
      { id: "b", text: "Constant returns: every server cuts the run time by the same amount.", misconceptionSlug: "linear-production" },
      { id: "c", text: "A rise in total factor productivity A." },
      { id: "d", text: "The economy is saving above its Golden Rule rate." },
    ],
    answerKey: { correctOptionId: "a" },
  },
  {
    id: "q-solow-mc-1",
    conceptSlug: "fundamental-equation",
    type: "mc_single",
    stem: "In the Solow model, what happens to the break-even investment line when the saving rate s increases?",
    difficulty: 2,
    expectedSeconds: 30,
    transferDistance: 0,
    provenance: "ai_draft",
    hint: "Which parameters appear in (n+δ)k?",
    citationIds: [PENDING_CITATION.id],
    options: [
      { id: "a", text: "Nothing — the break-even line depends only on n and δ." },
      { id: "b", text: "It rotates upward.", misconceptionSlug: "s-rotates-breakeven" },
      { id: "c", text: "It shifts down because more is saved.", misconceptionSlug: "s-rotates-breakeven" },
      { id: "d", text: "It becomes flatter as depreciation is offset.", misconceptionSlug: "delta-is-investment" },
    ],
    answerKey: { correctOptionId: "a" },
  },
  {
    id: "q-solow-assembly-1",
    conceptSlug: "fundamental-equation",
    type: "equation_assembly",
    stem: "Assemble the fundamental equation of the Solow model.",
    difficulty: 3,
    expectedSeconds: 45,
    transferDistance: 0,
    provenance: "ai_draft",
    hint: "Change in capital = what comes in − what must be replaced.",
    citationIds: [PENDING_CITATION.id],
    tokens: [
      { id: "dk", latex: "\\Delta k" },
      { id: "eq", latex: "=" },
      { id: "sfk", latex: "s\\,f(k)" },
      { id: "minus", latex: "-" },
      { id: "ndk", latex: "(n+\\delta)k" },
    ],
    answerKey: { orderedTokenIds: ["dk", "eq", "sfk", "minus", "ndk"] },
    misconceptionOrders: [
      { orderedTokenIds: ["dk", "eq", "ndk", "minus", "sfk"], misconceptionSlug: "delta-is-investment" },
    ],
  },
  {
    id: "q-solow-numeric-1",
    conceptSlug: "steady-state",
    type: "numeric",
    stem: "With s = 0.4, A = 1, α = 0.5, n = 0.02 and δ = 0.08, compute the steady-state capital per worker k*. (k* = (sA/(n+δ))^{1/(1−α)})",
    difficulty: 3,
    expectedSeconds: 90,
    transferDistance: 0,
    provenance: "ai_draft",
    hint: "sA/(n+δ) = 0.4/0.10 = 4; now raise it to 1/(1−α) = 2.",
    citationIds: [PENDING_CITATION.id],
    unitLabel: "units of capital per worker",
    answerKey: { value: 16, relTolerance: 0.01 },
  },
  {
    id: "q-solow-transfer-1",
    conceptSlug: "steady-state",
    type: "mc_single",
    stem: "A country at its steady state suffers a one-time earthquake that destroys a quarter of its capital stock (parameters unchanged). What does the Solow model predict afterwards?",
    difficulty: 4,
    expectedSeconds: 60,
    transferDistance: 1,
    provenance: "ai_draft",
    hint: "Where is k now relative to k*? Which investment curve is on top there?",
    citationIds: [PENDING_CITATION.id],
    options: [
      { id: "a", text: "Temporarily faster growth as capital per worker returns to the old steady state." },
      { id: "b", text: "A permanently lower steady state.", misconceptionSlug: "steady-state-max-output" },
      { id: "c", text: "Permanently faster growth.", misconceptionSlug: "higher-s-higher-growth-forever" },
      { id: "d", text: "No change, because the steady state fixes the capital stock." },
    ],
    answerKey: { correctOptionId: "a" },
  },
  {
    id: "q-solow-diagram-1",
    conceptSlug: "steady-state",
    type: "diagram_label",
    stem: "Label the three marked elements of the Solow diagram.",
    difficulty: 2,
    expectedSeconds: 45,
    transferDistance: 0,
    provenance: "ai_draft",
    hint: "The curved line bends because of diminishing returns; the straight line's slope is (n+δ).",
    citationIds: [PENDING_CITATION.id],
    slots: [
      { id: "slot-curve", description: "marker 1: the curved solid line" },
      { id: "slot-line", description: "marker 2: the straight dashed line" },
      { id: "slot-cross", description: "marker 3: the crossing point" },
    ],
    labels: [
      { id: "lab-actual", text: "s\\,f(k) \\text{ — actual investment}" },
      { id: "lab-breakeven", text: "(n+\\delta)k \\text{ — break-even investment}" },
      { id: "lab-kstar", text: "k^{*} \\text{ — steady state}" },
    ],
    answerKey: {
      slotToLabel: {
        "slot-curve": "lab-actual",
        "slot-line": "lab-breakeven",
        "slot-cross": "lab-kstar",
      },
    },
  },
  {
    id: "q-golden-multi-1",
    conceptSlug: "golden-rule",
    type: "mc_multi",
    stem: "Select ALL statements that are true about the Golden Rule saving rate.",
    difficulty: 3,
    expectedSeconds: 60,
    transferDistance: 0,
    provenance: "ai_draft",
    hint: "The Golden Rule is about maximizing one specific thing at the steady state — which?",
    citationIds: [PENDING_CITATION.id],
    options: [
      { id: "a", text: "It maximizes steady-state consumption per worker." },
      { id: "b", text: "For a Cobb–Douglas production function it equals the capital share α." },
      { id: "c", text: "It maximizes steady-state output per worker.", misconceptionSlug: "steady-state-max-output" },
      { id: "d", text: "Saving even more than the Golden Rule rate raises consumption further.", misconceptionSlug: "saving-more-always-better" },
    ],
    answerKey: { correctOptionIds: ["a", "b"] },
  },
  {
    id: "q-golden-numeric-1",
    conceptSlug: "golden-rule",
    type: "numeric",
    stem: "Production is Cobb–Douglas with capital share α = 0.40. What saving rate maximizes steady-state consumption?",
    difficulty: 2,
    expectedSeconds: 30,
    transferDistance: 0,
    provenance: "ai_draft",
    hint: "For Cobb–Douglas, the Golden Rule saving rate equals one specific parameter.",
    citationIds: [PENDING_CITATION.id],
    answerKey: { value: 0.4, relTolerance: 0.005, equivalentForms: ["2/5"] },
  },
  {
    id: "q-golden-transfer-1",
    conceptSlug: "golden-rule",
    type: "mc_single",
    stem: "A country already saving above its Golden Rule rate launches a campaign to raise saving further 'for future generations'. What does the Solow model predict for steady-state consumption?",
    difficulty: 4,
    expectedSeconds: 60,
    transferDistance: 1,
    provenance: "ai_draft",
    hint: "Where is s relative to α? What happens to c* = (1−s)f(k*) as s rises past the Golden Rule?",
    citationIds: [PENDING_CITATION.id],
    options: [
      { id: "a", text: "Steady-state consumption falls — the extra capital cannot even cover its own replacement." },
      { id: "b", text: "Steady-state consumption rises, because more saving always means more capital and more consumption.", misconceptionSlug: "saving-more-always-better" },
      { id: "c", text: "Steady-state output falls.", misconceptionSlug: "steady-state-max-output" },
      { id: "d", text: "Nothing changes: the steady state is independent of s." },
    ],
    answerKey: { correctOptionId: "a" },
  },
  {
    id: "q-solow-causal-1",
    conceptSlug: "steady-state",
    type: "causal_order",
    stem: "Order the chain of events after a permanent increase in the saving rate s (starting from a steady state).",
    difficulty: 3,
    expectedSeconds: 60,
    transferDistance: 0,
    provenance: "ai_draft",
    hint: "Start from the curve that moves the moment s changes.",
    citationIds: [PENDING_CITATION.id],
    items: [
      { id: "i1", text: "Actual investment s·f(k) shifts up" },
      { id: "i2", text: "Actual investment exceeds break-even investment at the old k*" },
      { id: "i3", text: "Capital per worker starts rising (Δk > 0)" },
      { id: "i4", text: "Δk shrinks as k approaches the new, higher k*" },
      { id: "i5", text: "Growth of capital per worker returns to zero at the new steady state" },
    ],
    answerKey: { orderedItemIds: ["i1", "i2", "i3", "i4", "i5"] },
  },
  // Teacher-ratified output of the D-020 question factory (17 of 24 live
  // drafts accepted; see generated-questions.ts for the per-draft verdicts).
  ...buildGeneratedQuestions(PENDING_CITATION.id),
  // MATCH PAIRS format seed (Wave 2 Stream AC, D-020 engine work); untouched
  // by the teacher yet, so provenance stays ai_draft — see match-pairs-seed.ts.
  ...buildMatchPairsSeed(PENDING_CITATION.id),
  // CLOZE (fill-in-the-blank with a word bank) seed — ai_draft, not yet
  // teacher-ratified; see cloze-seed.ts for provenance and content sourcing.
  ...buildClozeSeedQuestions(PENDING_CITATION.id),
];

export const productionFunctionLesson: Lesson = {
  id: "lesson-production-function",
  conceptSlug: "production-function",
  title: "The production function and diminishing returns",
  version: 1,
  status: "published", // demo course; real courses require teacher approval (IDEA-185)
  estimatedMinutes: 10,
  steps: [
    {
      id: "p1",
      type: "core_idea",
      body: {
        standard:
          "Output per worker depends on capital per worker through the production function y = f(k) = A·k^α. Two forces set it: total factor productivity A scales output up or down, and the capital share α (with 0 < α < 1) bends the curve so each extra unit of capital adds less than the last.",
        simpler:
          "How much each worker makes depends on how much equipment they have: y = A·k^α. A is how good the economy is at turning equipment into output; the exponent α being below 1 means every extra machine helps a little less than the one before.",
      },
      citationIds: [PENDING_CITATION.id],
      completionCriterion: { kind: "continue" },
    },
    {
      id: "p2",
      type: "intuition",
      body: {
        standard:
          "Picture one cook in a kitchen. The first oven transforms what they can produce; a second oven still helps a lot; the tenth oven mostly sits idle because a single cook can only use so many at once. Capital per worker behaves the same way: output keeps rising as you add capital, but in smaller and smaller steps. That gradual slowing — not any hard ceiling — is what later lets investment and break-even requirements balance at a steady state.",
        simpler:
          "One cook, more and more ovens: the first ovens help a lot, later ones barely help. More equipment always adds something, just less each time.",
      },
      citationIds: [PENDING_CITATION.id],
      completionCriterion: { kind: "continue" },
    },
    {
      id: "p3",
      type: "visual",
      lab: "solow",
      prompt:
        "In the lab, raise productivity A to at least 1.5 and watch the output readout y* and the s·f(k) curve. More productivity lifts output at every level of capital — the whole curve shifts up.",
      target: { param: "A", comparator: "gte", value: 1.5 },
      targetDescription: "Target: raise A to at least 1.5 and watch output rise at every k.",
      successDescription:
        "✓ You raised productivity: with a higher A the economy gets more output from the same capital, so the entire f(k)-driven curve sits higher — its diminishing-returns shape is unchanged, just scaled up.",
      completionCriterion: { kind: "visual_target", description: "A ≥ 1.5 reached" },
    },
    {
      id: "p4",
      type: "math",
      equationId: "eq-production",
      citationIds: [PENDING_CITATION.id],
      completionCriterion: { kind: "continue" },
    },
    {
      id: "p5",
      type: "guided",
      questionId: "q-prod-mc-1",
      completionCriterion: { kind: "answer_correct", questionId: "q-prod-mc-1", hintsAllowed: true },
    },
    {
      id: "p6",
      type: "mastery_check",
      questionId: "q-prod-transfer-1",
      completionCriterion: { kind: "answer_correct", questionId: "q-prod-transfer-1", hintsAllowed: false },
    },
  ],
};

export const solowLesson: Lesson = {
  id: "lesson-solow-steady-state",
  conceptSlug: "steady-state",
  title: "The Solow steady state",
  version: 1,
  status: "published", // demo course; real courses require teacher approval (IDEA-185)
  estimatedMinutes: 12,
  steps: [
    {
      id: "s1",
      type: "core_idea",
      body: {
        standard:
          "Capital per worker rises when actual investment exceeds the amount required to replace depreciated capital and equip new workers. Where the two exactly balance, the economy is at its steady state.",
        simpler:
          "An economy adds machines by investing, but machines wear out and new workers need equipping. When new investment exactly covers that, the amount of machinery per worker stops changing — that's the steady state.",
      },
      citationIds: [PENDING_CITATION.id],
      completionCriterion: { kind: "continue" },
    },
    {
      id: "s2",
      type: "intuition",
      body: {
        standard:
          "Picture filling a leaky bucket: investment pours water in, depreciation and population growth leak it out. The water level (capital per worker) settles exactly where inflow equals leak — pour faster (raise s) and the level settles higher, but it still settles.",
        simpler:
          "It's a leaky bucket: pouring in = investment, leaking out = wear and new workers. The level stops where pouring equals leaking.",
      },
      citationIds: [PENDING_CITATION.id],
      completionCriterion: { kind: "continue" },
    },
    {
      id: "s3",
      type: "visual",
      lab: "solow",
      prompt: "Use the lab: raise the saving rate s to at least 0.45 and watch the steady state k* move. Notice which curve responds — and which doesn't.",
      target: { param: "s", comparator: "gte", value: 0.45 },
      targetDescription: "Target: raise s to at least 0.45.",
      successDescription: "✓ Target reached — you moved s and only the s·f(k) curve responded.",
      completionCriterion: { kind: "visual_target", description: "s ≥ 0.45 reached" },
    },
    {
      id: "s4",
      type: "math",
      equationId: "eq-fundamental",
      citationIds: [PENDING_CITATION.id],
      completionCriterion: { kind: "continue" },
    },
    {
      id: "s5",
      type: "guided",
      questionId: "q-solow-mc-1",
      completionCriterion: { kind: "answer_correct", questionId: "q-solow-mc-1", hintsAllowed: true },
    },
    {
      id: "s6",
      type: "mastery_check",
      questionId: "q-solow-transfer-1",
      completionCriterion: { kind: "answer_correct", questionId: "q-solow-transfer-1", hintsAllowed: false },
    },
  ],
};

export const goldenRuleLesson: Lesson = {
  id: "lesson-golden-rule",
  conceptSlug: "golden-rule",
  title: "The Golden Rule of saving",
  version: 1,
  status: "published",
  estimatedMinutes: 10,
  steps: [
    {
      id: "g1",
      type: "core_idea",
      body: {
        standard:
          "The Golden Rule saving rate maximizes steady-state consumption; for a Cobb–Douglas production function it equals the capital share α. Saving more than that builds capital whose output cannot even cover its own upkeep.",
        simpler:
          "There's a best amount of saving: enough to build machines, but not so much that all the extra output goes to maintaining them. For Cobb–Douglas economies that sweet spot is s = α.",
      },
      citationIds: [PENDING_CITATION.id],
      completionCriterion: { kind: "continue" },
    },
    {
      id: "g2",
      type: "intuition",
      body: {
        standard:
          "Imagine an orchard: planting more trees raises the harvest, but every tree also needs watering and pruning. At some point a new tree's fruit barely pays for its own care — planting beyond that leaves less fruit to eat, not more. The Golden Rule stops exactly at that tree.",
        simpler:
          "More trees = more fruit, but every tree needs care. Stop planting when a new tree's fruit only just covers its care — after that, more trees mean less fruit for you.",
      },
      citationIds: [PENDING_CITATION.id],
      completionCriterion: { kind: "continue" },
    },
    {
      id: "g3",
      type: "visual",
      lab: "solow",
      prompt:
        "In the lab, watch the consumption readout c* while you move s. With α ≈ 0.33, push s up to at least 0.50 — past the Golden Rule — and see c* fall even though output rises.",
      target: { param: "s", comparator: "gte", value: 0.5 },
      targetDescription: "Target: push s to at least 0.50 and watch c* on the readout.",
      successDescription:
        "✓ You're past the Golden Rule: output y* keeps rising with s, but consumption c* is falling — the extra capital eats its own output.",
      completionCriterion: { kind: "visual_target", description: "s ≥ 0.50 reached" },
    },
    {
      id: "g4",
      type: "math",
      equationId: "eq-golden",
      citationIds: [PENDING_CITATION.id],
      completionCriterion: { kind: "continue" },
    },
    {
      id: "g5",
      type: "guided",
      questionId: "q-golden-numeric-1",
      completionCriterion: { kind: "answer_correct", questionId: "q-golden-numeric-1", hintsAllowed: true },
    },
    {
      id: "g6",
      type: "mastery_check",
      questionId: "q-golden-transfer-1",
      completionCriterion: { kind: "answer_correct", questionId: "q-golden-transfer-1", hintsAllowed: false },
    },
  ],
};

export const course = {
  id: "econ13210-demo",
  title: "ECON 13210 — Introduction to Macroeconomic Models (demo)",
  joinCode: "ECON22",
  sourceStatus: "planned_unverified" as const,
  concepts,
  conceptEdges,
  equations,
  misconceptions,
  questions,
  lessons: [productionFunctionLesson, solowLesson, goldenRuleLesson],
  citations,
};

export function getQuestion(id: string): Question {
  const q = questions.find((x) => x.id === id);
  if (!q) throw new Error(`unknown question ${id}`);
  return q;
}

export function getEquation(id: string): Equation {
  const e = equations.find((x) => x.id === id);
  if (!e) throw new Error(`unknown equation ${id}`);
  return e;
}

export function getConcept(slug: string): Concept {
  const c = concepts.find((x) => x.slug === slug);
  if (!c) throw new Error(`unknown concept ${slug}`);
  return c;
}
