/**
 * Content + mastery model for the vertical slice.
 * Mirrors docs/03-data-model.md rows 11–23 and 26–29; the Postgres jsonb
 * payloads are the serialized forms of these types (D-003).
 */

export type SourceStatus = "verified" | "planned_unverified" | "teacher_authored";

export interface Citation {
  id: string;
  /** e.g. "Lecture 2, slides 5–7" — or a pending marker before ingestion */
  label: string;
  sourceFileId: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  /** GATE-001: a citation with no sourceFileId must be presented as pending, never as a real source */
  status: SourceStatus;
}

export interface Concept {
  id: string;
  slug: string;
  name: string;
  world: number;
  definition: string;
  /** teacher-locked definitions are never rewritten by personalization (GATE-004) */
  locked: boolean;
  importance: 1 | 2 | 3 | 4 | 5;
  examinable: boolean;
  sourceStatus: SourceStatus;
  citationIds: string[];
}

export interface ConceptEdge {
  prereqSlug: string;
  conceptSlug: string;
  kind: "requires" | "supports";
}

export interface Equation {
  id: string;
  conceptSlug: string;
  latex: string;
  /** term-by-term breakdown used by LESSON-04 and TEST-ECON-001 */
  components: { latex: string; meaning: string }[];
  approved: boolean;
  sourceStatus: SourceStatus;
}

export type LessonStepType =
  | "core_idea"
  | "intuition"
  | "visual"
  | "math"
  | "guided"
  | "mastery_check";

export interface LessonStepBase {
  id: string;
  type: LessonStepType;
  /** deterministic predicate id evaluated by the player */
  completionCriterion:
    | { kind: "continue" }
    | { kind: "visual_target"; description: string }
    | { kind: "answer_correct"; questionId: string; hintsAllowed: boolean };
}

export interface TextStep extends LessonStepBase {
  type: "core_idea" | "intuition";
  /** variants by reading level; personalization picks, never rewrites locked text */
  body: { standard: string; simpler?: string };
  citationIds: string[];
}

export interface VisualStep extends LessonStepBase {
  type: "visual";
  lab: "solow" | "budget";
  prompt: string;
  /** target the learner must reach, checked deterministically */
  target: { param: "s" | "n" | "delta" | "alpha" | "A"; comparator: "gte" | "lte"; value: number };
  /** shown while the target is not yet reached */
  targetDescription: string;
  /** shown once the deterministic target predicate is satisfied */
  successDescription: string;
}

export interface MathStep extends LessonStepBase {
  type: "math";
  equationId: string;
  citationIds: string[];
}

export interface QuestionStep extends LessonStepBase {
  type: "guided" | "mastery_check";
  questionId: string;
}

export type LessonStep = TextStep | VisualStep | MathStep | QuestionStep;

export interface Lesson {
  id: string;
  conceptSlug: string;
  title: string;
  version: number;
  status: "draft" | "approved" | "published";
  steps: LessonStep[]; // exactly the six-step anatomy, order adapted at render time
  estimatedMinutes: number;
}

export interface Misconception {
  slug: string;
  conceptSlug: string;
  description: string;
  remediationHint: string;
}

export type QuestionType =
  | "mc_single"
  | "mc_multi"
  | "numeric"
  | "equation_assembly"
  | "diagram_label"
  | "causal_order";

export interface ChoiceOption {
  id: string;
  text: string;
  /** wrong options map to the misconception they evidence (MOAT-03) */
  misconceptionSlug?: string;
}

export interface QuestionBase {
  id: string;
  conceptSlug: string;
  type: QuestionType;
  stem: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  expectedSeconds: number;
  /** 0 = same context as taught, 1 = near transfer, 2 = far transfer */
  transferDistance: 0 | 1 | 2;
  provenance: "teacher_authored" | "ai_draft" | "ai_approved";
  hint: string;
  citationIds: string[];
}

export interface McSingleQuestion extends QuestionBase {
  type: "mc_single";
  options: ChoiceOption[];
  answerKey: { correctOptionId: string };
}

export interface McMultiQuestion extends QuestionBase {
  type: "mc_multi";
  options: ChoiceOption[];
  answerKey: { correctOptionIds: string[] };
}

export interface NumericQuestion extends QuestionBase {
  type: "numeric";
  unitLabel?: string;
  answerKey: {
    value: number;
    /** relative tolerance for equivalence (TEST-ECON-015) */
    relTolerance: number;
    /** additional exactly-equivalent forms, e.g. fraction strings */
    equivalentForms?: string[];
  };
}

export interface EquationAssemblyQuestion extends QuestionBase {
  type: "equation_assembly";
  /** tokens shown shuffled; key is the correct sequence of token ids */
  tokens: { id: string; latex: string }[];
  answerKey: { orderedTokenIds: string[] };
  /** wrong orderings that indicate a known misconception */
  misconceptionOrders?: { orderedTokenIds: string[]; misconceptionSlug: string }[];
}

export interface DiagramLabelQuestion extends QuestionBase {
  type: "diagram_label";
  /** code-rendered diagram element ids → the label bank */
  slots: { id: string; description: string }[];
  labels: { id: string; text: string }[];
  answerKey: { slotToLabel: Record<string, string> };
}

export interface CausalOrderQuestion extends QuestionBase {
  type: "causal_order";
  items: { id: string; text: string }[];
  answerKey: { orderedItemIds: string[] };
}

export type Question =
  | McSingleQuestion
  | McMultiQuestion
  | NumericQuestion
  | EquationAssemblyQuestion
  | DiagramLabelQuestion
  | CausalOrderQuestion;

/** §22 — never one global percentage */
export interface MasteryState {
  conceptSlug: string;
  conceptual: number;
  procedural: number;
  graphInterpretation: number;
  formulaRecall: number;
  transfer: number;
  confidence: number;
  retentionStrength: number;
  /** probability per known misconception slug */
  misconceptionProbability: Record<string, number>;
  lastEvidenceAt: string | null;
  evidenceCount: number;
}

/** every mastery update consumes one of these; auditable (GATE-006) */
export interface EvidenceEvent {
  at: string;
  conceptSlug: string;
  questionType: QuestionType | "visual" | "review";
  correct: boolean;
  difficulty: 1 | 2 | 3 | 4 | 5;
  hintsUsed: number;
  timeMs: number;
  expectedSeconds: number;
  confidence: 1 | 2 | 3 | 4 | null;
  attemptNo: number;
  transferDistance: 0 | 1 | 2;
  misconceptionSlugs: string[];
}

export interface ReviewItem {
  conceptSlug: string;
  dueAt: string;
  intervalDays: number;
  reasonCode:
    | "new_concept"
    | "retention_falling"
    | "misconception_active"
    | "exam_priority"
    | "overdue_catchup";
  /** rendered verbatim to the learner (§22) */
  reasonText: string;
}

export interface StudyPlanInput {
  examDateISO: string | null;
  minutesPerDay: number;
  noStudyDays: string[]; // ISO dates
}
