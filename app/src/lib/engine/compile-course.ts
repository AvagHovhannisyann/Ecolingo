/**
 * AI course compiler — the pure engine half (decision D-020, extends the
 * D-011/D-014 draft→sanitize→ratify pattern from single questions to WHOLE
 * COURSES).
 *
 * An instructional-design model proposes a course PLAN: units → lessons, each
 * lesson naming a concept with a definition, a core idea, an intuition, and the
 * teacher's source sections it is grounded in, plus prerequisite edges between
 * concepts. NOTHING here is authoritative. `sanitizeCoursePlan` drops malformed
 * output, derives every slug deterministically, validates every source-section
 * reference against the teacher's real sections, and enforces that the
 * prerequisite edges form a DAG (cycle-closing edges are dropped, not silently
 * accepted). `planToCourseDraft` converts the sanitized plan into the REAL
 * engine types (Concept/ConceptEdge/Lesson) with honest placeholder steps —
 * marked `planned_unverified`, locked=false — that the teacher then ratifies.
 *
 * Truth invariants preserved:
 *   - GATE-001: concepts are `planned_unverified` until a teacher approves a
 *     real citation; this module never mints a `verified` source.
 *   - GATE-002: no answer keys or equations are invented here. Math steps are
 *     never auto-emitted (see NOTE below); guided/mastery_check steps only
 *     reference question ids that actually exist in the generated-question list
 *     passed to the converter, so every completion criterion resolves.
 *
 * NOTE (math steps, future work): a lesson's `math` step needs a real, approved
 * Equation with LaTeX the teacher's source actually contained. We refuse to
 * fabricate equations, so the compiler emits NO `math` steps for now. Wiring a
 * math step requires the equation-extraction pass (echo teacher LaTeX → teacher
 * approves) that is deferred; until then a compiled lesson is
 * core_idea → intuition → [visual?] → guided? → mastery_check?.
 */

import type { Concept, ConceptEdge, Lesson, LessonStep, Question } from "./types";

// ---------------------------------------------------------------------------
// Draft plan shape (what the model proposes; all fields advisory)
// ---------------------------------------------------------------------------

export interface DraftLesson {
  title: string;
  conceptName: string;
  /** derived deterministically by sanitizeCoursePlan — never trusted from the model */
  conceptSlug: string;
  definition: string;
  coreIdea: string;
  intuition: string;
  estimatedMinutes: number;
  /** teacher section ids this lesson is grounded in (validated against the allowlist) */
  sourceSectionIds: string[];
}

export interface DraftUnit {
  title: string;
  lessons: DraftLesson[];
}

export interface DraftCoursePlan {
  units: DraftUnit[];
  /** [fromSlug, toSlug] — "learn `from` before `to`"; validated to a DAG */
  prereqPairs: [string, string][];
}

export type DroppedPrereqReason = "unknown_slug" | "self_loop" | "duplicate" | "cycle";

export interface CoursePlanSanitizeResult {
  plan: DraftCoursePlan;
  droppedUnits: number;
  droppedLessons: number;
  /** every prereq edge that was rejected, with the deterministic reason */
  droppedPrereqPairs: { pair: [string, string]; reason: DroppedPrereqReason }[];
}

// ---------------------------------------------------------------------------
// Deterministic slugify (kebab-case) — the single source of truth for slugs
// ---------------------------------------------------------------------------

/**
 * Pure, deterministic kebab-case slug. Lowercases, strips accents, replaces any
 * run of non-alphanumerics with a single hyphen, trims leading/trailing
 * hyphens. Empty / punctuation-only input yields "".
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** stable id for a generated question of a concept: `q-gen-<slug>-<n>` (1-based) */
export function generatedQuestionId(conceptSlug: string, n: number): string {
  return `q-gen-${conceptSlug}-${n}`;
}

// ---------------------------------------------------------------------------
// Caps (bound the compiled course so a runaway model can't explode it)
// ---------------------------------------------------------------------------

const MAX_UNITS = 6;
const MAX_LESSONS_PER_UNIT = 8;
const MAX_ESTIMATED_MINUTES = 60;

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** the terms that make a concept "Solow-adjacent" and thus eligible for a Solow lab visual step */
const SOLOW_TERMS = [
  "solow",
  "steady state",
  "steady-state",
  "capital per worker",
  "saving rate",
  "golden rule",
  "depreciation",
  "break-even",
  "production function",
  "diminishing returns",
];

/** true when the concept clearly belongs to the Solow model (visual-lab eligible) */
export function isSolowAdjacent(slug: string, name: string, definition: string): boolean {
  const hay = `${slug} ${name} ${definition}`.toLowerCase();
  return SOLOW_TERMS.some((t) => hay.includes(t));
}

// ---------------------------------------------------------------------------
// Sanitize a raw model plan
// ---------------------------------------------------------------------------

/**
 * Validate raw model output into a well-formed, deterministic course plan.
 *
 *  - malformed units/lessons (missing title/conceptName/definition/coreIdea/
 *    intuition) are dropped and counted;
 *  - every conceptSlug is DERIVED (slugify) — the model's slug, if any, is
 *    ignored; lessons whose name slugifies to "" are dropped;
 *  - duplicate slugs keep the first occurrence, later ones are dropped;
 *  - sourceSectionIds are filtered to `allowedSectionIds` (a fabricated section
 *    id can never survive → grounding stays honest);
 *  - estimatedMinutes is coerced to a sane integer;
 *  - prereqPairs must reference two DISTINCT existing slugs; edges are added in
 *    first-seen order and any edge that would CLOSE A CYCLE is dropped (with
 *    reason "cycle"), so the result is always a DAG;
 *  - sizes are capped (≤6 units, ≤8 lessons/unit).
 */
export function sanitizeCoursePlan(raw: unknown, allowedSectionIds: Set<string>): CoursePlanSanitizeResult {
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawUnits = Array.isArray(root.units) ? root.units : [];

  let droppedUnits = 0;
  let droppedLessons = 0;
  const seenSlugs = new Set<string>();
  const units: DraftUnit[] = [];

  for (const u of rawUnits) {
    if (units.length >= MAX_UNITS) {
      droppedUnits++;
      continue;
    }
    if (!u || typeof u !== "object") {
      droppedUnits++;
      continue;
    }
    const ur = u as Record<string, unknown>;
    const unitTitle = asString(ur.title);
    const rawLessons = Array.isArray(ur.lessons) ? ur.lessons : [];
    const lessons: DraftLesson[] = [];

    for (const l of rawLessons) {
      if (lessons.length >= MAX_LESSONS_PER_UNIT) {
        droppedLessons++;
        continue;
      }
      if (!l || typeof l !== "object") {
        droppedLessons++;
        continue;
      }
      const lr = l as Record<string, unknown>;
      const conceptName = asString(lr.conceptName);
      const definition = asString(lr.definition);
      const coreIdea = asString(lr.coreIdea);
      const intuition = asString(lr.intuition);
      const conceptSlug = slugify(conceptName);
      // A lesson needs a nameable concept and grounded prose to be usable.
      if (!conceptName || !conceptSlug || !definition || !coreIdea || !intuition) {
        droppedLessons++;
        continue;
      }
      if (seenSlugs.has(conceptSlug)) {
        droppedLessons++;
        continue;
      }
      seenSlugs.add(conceptSlug);

      const sourceSectionIds = (Array.isArray(lr.sourceSectionIds) ? lr.sourceSectionIds : [])
        .map(asString)
        .filter((id) => id && allowedSectionIds.has(id));

      let minutes = typeof lr.estimatedMinutes === "number" ? Math.round(lr.estimatedMinutes) : 8;
      if (!Number.isFinite(minutes) || minutes < 1) minutes = 8;
      if (minutes > MAX_ESTIMATED_MINUTES) minutes = MAX_ESTIMATED_MINUTES;

      lessons.push({
        title: asString(lr.title) || conceptName,
        conceptName,
        conceptSlug,
        definition,
        coreIdea,
        intuition,
        estimatedMinutes: minutes,
        sourceSectionIds,
      });
    }

    if (lessons.length === 0) {
      droppedUnits++;
      continue;
    }
    units.push({ title: unitTitle || `Unit ${units.length + 1}`, lessons });
  }

  // Prereq edges → validate to a DAG deterministically.
  const { prereqPairs, droppedPrereqPairs } = sanitizePrereqPairs(root.prereqPairs, seenSlugs);

  return {
    plan: { units, prereqPairs },
    droppedUnits,
    droppedLessons,
    droppedPrereqPairs,
  };
}

/**
 * Keep first-seen prerequisite edges that reference two distinct known slugs and
 * do not close a cycle. Deterministic: input order decides which edge of a would-
 * be cycle survives (the earlier one) and which is dropped (the closer).
 */
function sanitizePrereqPairs(
  raw: unknown,
  knownSlugs: Set<string>
): { prereqPairs: [string, string][]; droppedPrereqPairs: { pair: [string, string]; reason: DroppedPrereqReason }[] } {
  const prereqPairs: [string, string][] = [];
  const dropped: { pair: [string, string]; reason: DroppedPrereqReason }[] = [];
  const seen = new Set<string>();
  // adjacency for cycle detection among accepted edges
  const adj = new Map<string, Set<string>>();

  const canReach = (from: string, to: string): boolean => {
    // is `to` already reachable from `from` via accepted edges? (would-be cycle)
    const stack = [from];
    const visited = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === to) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const nxt of adj.get(cur) ?? []) stack.push(nxt);
    }
    return false;
  };

  const list = Array.isArray(raw) ? raw : [];
  for (const p of list) {
    if (!Array.isArray(p) || p.length < 2) continue;
    // endpoints may arrive as concept NAMES or already-derived slugs; slugify is
    // idempotent on a slug, so this validates both forms against known slugs.
    const from = slugify(asString(p[0]));
    const to = slugify(asString(p[1]));
    if (!from || !to) continue;
    if (!knownSlugs.has(from) || !knownSlugs.has(to)) {
      dropped.push({ pair: [from, to], reason: "unknown_slug" });
      continue;
    }
    if (from === to) {
      dropped.push({ pair: [from, to], reason: "self_loop" });
      continue;
    }
    const key = `${from} ${to}`;
    if (seen.has(key)) {
      dropped.push({ pair: [from, to], reason: "duplicate" });
      continue;
    }
    // adding edge from→to; a cycle forms iff `from` is already reachable from `to`.
    if (canReach(to, from)) {
      dropped.push({ pair: [from, to], reason: "cycle" });
      continue;
    }
    seen.add(key);
    prereqPairs.push([from, to]);
    if (!adj.has(from)) adj.set(from, new Set());
    adj.get(from)!.add(to);
  }

  return { prereqPairs, droppedPrereqPairs: dropped };
}

// ---------------------------------------------------------------------------
// Convert a sanitized plan into REAL engine types
// ---------------------------------------------------------------------------

export interface CourseDraft {
  concepts: Concept[];
  edges: ConceptEdge[];
  lessons: Lesson[];
}

/**
 * Convert a sanitized DraftCoursePlan into real Concept/ConceptEdge/Lesson
 * values. Concepts are `planned_unverified`, locked=false (GATE-001). Each
 * lesson gets an honest step skeleton:
 *
 *   core_idea (from draft.coreIdea) → intuition (from draft.intuition)
 *     → [visual — ONLY if the concept is Solow-adjacent, referencing the Solow lab]
 *     → guided        (only if a q-gen-<slug>-1 question exists)
 *     → mastery_check (only if a q-gen-<slug>-2 question exists, else the sole one)
 *
 * No `math` steps are ever emitted (see the file NOTE). Guided/mastery_check
 * steps reference questions taken from `generatedQuestions`, so every
 * completion criterion resolves to a real question id.
 */
export function planToCourseDraft(plan: DraftCoursePlan, generatedQuestions: Question[] = []): CourseDraft {
  const byConcept = new Map<string, Question[]>();
  for (const q of generatedQuestions) {
    const arr = byConcept.get(q.conceptSlug) ?? [];
    arr.push(q);
    byConcept.set(q.conceptSlug, arr);
  }
  // deterministic ordering of a concept's questions by id
  for (const arr of byConcept.values()) arr.sort((a, b) => a.id.localeCompare(b.id));

  const concepts: Concept[] = [];
  const lessons: Lesson[] = [];

  plan.units.forEach((unit, unitIdx) => {
    const world = unitIdx + 1; // unit ordering, not a claim about a fixed curriculum
    unit.lessons.forEach((dl, lessonIdx) => {
      concepts.push({
        id: `c-gen-${dl.conceptSlug}`,
        slug: dl.conceptSlug,
        name: dl.conceptName,
        world,
        definition: dl.definition,
        locked: false,
        importance: 3,
        examinable: true,
        sourceStatus: "planned_unverified",
        citationIds: [],
      });

      lessons.push({
        id: `lesson-gen-${dl.conceptSlug}`,
        conceptSlug: dl.conceptSlug,
        title: dl.title,
        version: 1,
        status: "draft", // compiled drafts are never auto-published (teacher ratifies)
        estimatedMinutes: dl.estimatedMinutes,
        steps: buildLessonSteps(dl, byConcept.get(dl.conceptSlug) ?? [], unitIdx, lessonIdx),
      });
    });
  });

  const knownSlugs = new Set(concepts.map((c) => c.slug));
  const edges: ConceptEdge[] = plan.prereqPairs
    .filter(([from, to]) => knownSlugs.has(from) && knownSlugs.has(to))
    .map(([from, to]) => ({ prereqSlug: from, conceptSlug: to, kind: "requires" as const }));

  return { concepts, edges, lessons };
}

function buildLessonSteps(dl: DraftLesson, questions: Question[], unitIdx: number, lessonIdx: number): LessonStep[] {
  const base = `u${unitIdx + 1}l${lessonIdx + 1}`;
  const steps: LessonStep[] = [];

  steps.push({
    id: `${base}-core`,
    type: "core_idea",
    body: { standard: dl.coreIdea },
    citationIds: [],
    completionCriterion: { kind: "continue" },
  });

  steps.push({
    id: `${base}-intuition`,
    type: "intuition",
    body: { standard: dl.intuition },
    citationIds: [],
    completionCriterion: { kind: "continue" },
  });

  // Visual step ONLY when the concept is genuinely part of the Solow model —
  // otherwise we have no truthful interactive to point at, so we omit it.
  if (isSolowAdjacent(dl.conceptSlug, dl.conceptName, dl.definition)) {
    steps.push({
      id: `${base}-visual`,
      type: "visual",
      lab: "solow",
      prompt:
        "Open the Solow lab and move the saving-rate slider s. Watch how the actual-investment curve s·f(k) responds while the break-even line stays put, and where the two cross.",
      target: { param: "s", comparator: "gte", value: 0.4 },
      targetDescription: "Target: raise the saving rate s to at least 0.40 and observe the steady state move.",
      successDescription:
        "✓ You moved s and watched the steady state respond — the interactive proves the relationship the lesson describes.",
      completionCriterion: { kind: "visual_target", description: "s ≥ 0.40 reached" },
    });
  }

  // guided + mastery_check: only reference questions that actually exist.
  if (questions.length >= 1) {
    const guided = questions[0];
    if (questions.length >= 2) {
      steps.push({
        id: `${base}-guided`,
        type: "guided",
        questionId: guided.id,
        completionCriterion: { kind: "answer_correct", questionId: guided.id, hintsAllowed: true },
      });
      const mastery = questions[1];
      steps.push({
        id: `${base}-mastery`,
        type: "mastery_check",
        questionId: mastery.id,
        completionCriterion: { kind: "answer_correct", questionId: mastery.id, hintsAllowed: false },
      });
    } else {
      // exactly one question → make it the mastery check (the final gate)
      steps.push({
        id: `${base}-mastery`,
        type: "mastery_check",
        questionId: guided.id,
        completionCriterion: { kind: "answer_correct", questionId: guided.id, hintsAllowed: false },
      });
    }
  }

  return steps;
}
