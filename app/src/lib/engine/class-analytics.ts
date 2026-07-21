/**
 * Class analytics engine (Phase 5 — "what do I reteach Thursday?").
 *
 * Pure, deterministic functions over a course's ClassMastery (the owner-only
 * read of enrolled learners' mastery rows, D-015). Every number the dashboard
 * renders is produced here so it is unit-testable — the JSX does no arithmetic.
 *
 * §22 discipline is load-bearing: mastery is NEVER collapsed to one global
 * number. Summaries preserve the five learning dimensions, and the reteach
 * ranking explains itself in terms of them.
 */

import type { ClassMastery } from "../course";
import type { Concept, MasteryState } from "./types";

/**
 * The five learning dimensions we surface as bars (§22). confidence,
 * retentionStrength and misconceptionProbability are separate signals — the
 * first two are self-report/decay, the last is per-misconception — so they are
 * not averaged into this vector.
 */
export const MASTERY_DIMENSIONS = [
  "conceptual",
  "procedural",
  "graphInterpretation",
  "formulaRecall",
  "transfer",
] as const;

export type MasteryDimension = (typeof MASTERY_DIMENSIONS)[number];

/** Learner-readable labels for each dimension (used in bars + reason strings). */
export const DIMENSION_LABELS: Record<MasteryDimension, string> = {
  conceptual: "conceptual",
  procedural: "procedural",
  graphInterpretation: "graph interpretation",
  formulaRecall: "formula recall",
  transfer: "transfer",
};

/** Thresholds (spec-anchored; single source of truth for the whole page). */
export const STRUGGLING_CONCEPTUAL = 0.4;
export const MISCONCEPTION_ACTIVE = 0.5;
export const STRONG_CONCEPTUAL = 0.7;
/** confidence at/above which a self-report counts as "confident" (calibration). */
export const HIGH_CONFIDENCE = 0.7;
/** retention strength below which a learned concept is fading (review risk). */
export const RETENTION_RISK = 0.5;

/** Round a 0–1 fraction to a whole percentage. Kept here so JSX renders no math. */
export function pct(value: number): number {
  return Math.round(value * 100);
}

/** A learner has touched a concept when at least one evidence event landed. */
export function hasEvidence(state: MasteryState | undefined): state is MasteryState {
  return !!state && state.evidenceCount > 0;
}

/** Highest probability across a student's known misconceptions for a concept. */
function peakMisconception(state: MasteryState): number {
  const values = Object.values(state.misconceptionProbability ?? {});
  return values.length ? Math.max(...values) : 0;
}

/** A student (with evidence) is "struggling" on a concept per the §22 rule. */
export function isStruggling(state: MasteryState): boolean {
  return state.conceptual < STRUGGLING_CONCEPTUAL || peakMisconception(state) > MISCONCEPTION_ACTIVE;
}

export type SpreadBucket = "strong" | "developing" | "struggling";

/** Bucket a conceptual value for the heatmap. developing = [0.4, 0.7). */
export function bucketConceptual(value: number): SpreadBucket {
  if (value >= STRONG_CONCEPTUAL) return "strong";
  if (value >= STRUGGLING_CONCEPTUAL) return "developing";
  return "struggling";
}

export interface ConceptSummary {
  conceptSlug: string;
  /** learners in this class who have practiced this concept (evidenceCount > 0) */
  studentsWithEvidence: number;
  /** learners present in the class mastery set (the denominator for "not started") */
  totalStudents: number;
  /** per-dimension mean, averaged ONLY over students with evidence (§22 preserved) */
  avgByDimension: Record<MasteryDimension, number>;
  /** dimension with the lowest class average; null when nobody has practiced */
  weakestDimension: MasteryDimension | null;
  /** students with evidence who are below the conceptual floor or show a live misconception */
  strugglingCount: number;
  /** students present who have no evidence for this concept yet */
  notStartedCount: number;
}

function zeroVector(): Record<MasteryDimension, number> {
  return {
    conceptual: 0,
    procedural: 0,
    graphInterpretation: 0,
    formulaRecall: 0,
    transfer: 0,
  };
}

/**
 * Per-concept class summary. Students = the keys of `mastery` (the roster rows
 * that produced mastery states). Order of the output follows `concepts`, so it
 * is deterministic. Averages are taken only over students WITH evidence, never
 * diluted by learners who have not started (which would understate real signal).
 */
export function classConceptSummary(
  mastery: ClassMastery,
  concepts: readonly Pick<Concept, "slug">[],
): ConceptSummary[] {
  const studentIds = Object.keys(mastery);
  const totalStudents = studentIds.length;

  return concepts.map((concept) => {
    const slug = concept.slug;
    const withEvidence: MasteryState[] = [];
    for (const userId of studentIds) {
      const state = mastery[userId]?.[slug];
      if (hasEvidence(state)) withEvidence.push(state);
    }

    const avg = zeroVector();
    if (withEvidence.length > 0) {
      for (const dim of MASTERY_DIMENSIONS) {
        let sum = 0;
        for (const state of withEvidence) sum += state[dim];
        avg[dim] = sum / withEvidence.length;
      }
    }

    // weakest = lowest average; ties broken by MASTERY_DIMENSIONS order (deterministic)
    let weakestDimension: MasteryDimension | null = null;
    if (withEvidence.length > 0) {
      weakestDimension = MASTERY_DIMENSIONS[0];
      for (const dim of MASTERY_DIMENSIONS) {
        if (avg[dim] < avg[weakestDimension]) weakestDimension = dim;
      }
    }

    const strugglingCount = withEvidence.filter(isStruggling).length;

    return {
      conceptSlug: slug,
      studentsWithEvidence: withEvidence.length,
      totalStudents,
      avgByDimension: avg,
      weakestDimension,
      strugglingCount,
      notStartedCount: totalStudents - withEvidence.length,
    };
  });
}

/** Reteach priority tiers, highest urgency first. */
export type ReteachPriority = "struggling" | "not_started" | "healthy";

export interface ReteachItem {
  conceptSlug: string;
  conceptName: string;
  priority: ReteachPriority;
  strugglingCount: number;
  studentsWithEvidence: number;
  totalStudents: number;
  avgConceptual: number;
  weakestDimension: MasteryDimension | null;
  /** learner-readable justification rendered verbatim on the card (§22) */
  reason: string;
}

function priorityOf(s: ConceptSummary): ReteachPriority {
  if (s.strugglingCount > 0) return "struggling";
  if (s.studentsWithEvidence === 0) return "not_started";
  return "healthy";
}

const TIER_RANK: Record<ReteachPriority, number> = {
  struggling: 0,
  not_started: 1,
  healthy: 2,
};

function reasonFor(s: ConceptSummary, priority: ReteachPriority): string {
  const avgPct = pct(s.avgByDimension.conceptual);
  if (priority === "struggling") {
    const weak = s.weakestDimension ? DIMENSION_LABELS[s.weakestDimension] : "conceptual";
    const denom = s.studentsWithEvidence;
    return `${s.strugglingCount} of ${denom} student${denom === 1 ? "" : "s"} who've practiced are below ${pct(
      STRUGGLING_CONCEPTUAL,
    )}% conceptual or show a likely misconception; weakest dimension: ${weak}.`;
  }
  if (priority === "not_started") {
    return "No evidence yet — the class hasn't practiced this concept.";
  }
  return `${s.studentsWithEvidence} student${s.studentsWithEvidence === 1 ? "" : "s"} practiced; none struggling (avg conceptual ${avgPct}%).`;
}

/**
 * Ordered reteach list, most urgent first.
 *
 * Ranking rule (deterministic + explainable):
 *   Tier 0 "struggling"   — at least one student below the conceptual floor or
 *                           with a live misconception. Ranked by strugglingCount
 *                           DESC, then avg conceptual ASC, then slug ASC.
 *   Tier 1 "not_started"  — nobody has evidence yet. Worth teaching, but there is
 *                           no struggle signal, so it sits below every struggling
 *                           concept and above healthy ones. Ranked by slug ASC.
 *   Tier 2 "healthy"      — has evidence, nobody struggling. Reteach last, lowest
 *                           average first (avg conceptual ASC), then slug ASC.
 *
 * This realises the brief's "zero-evidence concepts rank below struggling ones
 * but above nothing": a not-started concept outranks a class that is doing fine.
 */
export function reteachRanking(
  summaries: readonly ConceptSummary[],
  concepts: readonly Pick<Concept, "slug" | "name">[],
): ReteachItem[] {
  const nameBySlug = new Map(concepts.map((c) => [c.slug, c.name]));

  const items: ReteachItem[] = summaries.map((s) => {
    const priority = priorityOf(s);
    return {
      conceptSlug: s.conceptSlug,
      conceptName: nameBySlug.get(s.conceptSlug) ?? s.conceptSlug,
      priority,
      strugglingCount: s.strugglingCount,
      studentsWithEvidence: s.studentsWithEvidence,
      totalStudents: s.totalStudents,
      avgConceptual: s.avgByDimension.conceptual,
      weakestDimension: s.weakestDimension,
      reason: reasonFor(s, priority),
    };
  });

  return items.sort((a, b) => {
    const tier = TIER_RANK[a.priority] - TIER_RANK[b.priority];
    if (tier !== 0) return tier;
    if (a.priority === "struggling" && a.strugglingCount !== b.strugglingCount) {
      return b.strugglingCount - a.strugglingCount; // more struggling first
    }
    if (a.priority !== "not_started" && a.avgConceptual !== b.avgConceptual) {
      return a.avgConceptual - b.avgConceptual; // lower mastery first
    }
    return a.conceptSlug < b.conceptSlug ? -1 : a.conceptSlug > b.conceptSlug ? 1 : 0;
  });
}

// ===========================================================================
// Class overview (D-045) — a calm, honest health read at the top of the page.
// ===========================================================================

export interface ClassOverview {
  totalStudents: number;
  /** students with at least one evidence event anywhere in the course */
  activeStudents: number;
  conceptsTotal: number;
  /** concepts at least one student has practiced */
  conceptsCovered: number;
  /** fraction of (student × concept) cells with evidence, 0–1 */
  coverage: number;
  /** class-wide per-dimension mean over ALL evidence cells (§22 preserved) */
  avgByDimension: Record<MasteryDimension, number>;
  /** lowest class-wide dimension; null when nobody has practiced */
  weakestDimension: MasteryDimension | null;
  weakestDimensionValue: number;
}

/**
 * Whole-class overview. Averages are taken over evidence cells only (never
 * diluted by not-started cells), consistent with `classConceptSummary`.
 */
export function classOverview(
  mastery: ClassMastery,
  concepts: readonly Pick<Concept, "slug">[],
): ClassOverview {
  const studentIds = Object.keys(mastery);
  const totalStudents = studentIds.length;
  const conceptsTotal = concepts.length;

  const coveredSlugs = new Set<string>();
  const activeIds = new Set<string>();
  const dimSums = zeroVector();
  let evidenceCells = 0;

  for (const userId of studentIds) {
    for (const concept of concepts) {
      const state = mastery[userId]?.[concept.slug];
      if (!hasEvidence(state)) continue;
      evidenceCells++;
      coveredSlugs.add(concept.slug);
      activeIds.add(userId);
      for (const dim of MASTERY_DIMENSIONS) dimSums[dim] += state[dim];
    }
  }

  const avg = zeroVector();
  if (evidenceCells > 0) for (const dim of MASTERY_DIMENSIONS) avg[dim] = dimSums[dim] / evidenceCells;

  let weakestDimension: MasteryDimension | null = null;
  if (evidenceCells > 0) {
    weakestDimension = MASTERY_DIMENSIONS[0];
    for (const dim of MASTERY_DIMENSIONS) if (avg[dim] < avg[weakestDimension]) weakestDimension = dim;
  }

  const totalCells = totalStudents * conceptsTotal;
  return {
    totalStudents,
    activeStudents: activeIds.size,
    conceptsTotal,
    conceptsCovered: coveredSlugs.size,
    coverage: totalCells > 0 ? evidenceCells / totalCells : 0,
    avgByDimension: avg,
    weakestDimension,
    weakestDimensionValue: weakestDimension ? avg[weakestDimension] : 0,
  };
}

// ===========================================================================
// Attention flags (D-045) — overconfidence + fading retention, per concept.
// Both use signals the mastery model already captures but the page ignored.
// ===========================================================================

export interface ConceptFlag {
  conceptSlug: string;
  conceptName: string;
  /** students with evidence who trip this flag */
  count: number;
  /** students with evidence for this concept (the denominator) */
  studentsWithEvidence: number;
  /** learner-readable justification rendered verbatim (§22) */
  reason: string;
}

function sortFlags(a: ConceptFlag, b: ConceptFlag): number {
  if (a.count !== b.count) return b.count - a.count;
  return a.conceptSlug < b.conceptSlug ? -1 : a.conceptSlug > b.conceptSlug ? 1 : 0;
}

/**
 * Concepts where students are OVERCONFIDENT: they self-report confidence at or
 * above HIGH_CONFIDENCE yet score below the conceptual floor. Only flagged
 * concepts (count > 0) are returned, most students first. This is exactly the
 * cohort that won't ask for help, so surfacing it is high-value.
 */
export function overconfidenceRanking(
  mastery: ClassMastery,
  concepts: readonly Pick<Concept, "slug" | "name">[],
): ConceptFlag[] {
  const out: ConceptFlag[] = [];
  for (const concept of concepts) {
    let count = 0;
    let withEvidence = 0;
    for (const userId of Object.keys(mastery)) {
      const state = mastery[userId]?.[concept.slug];
      if (!hasEvidence(state)) continue;
      withEvidence++;
      if (state.confidence >= HIGH_CONFIDENCE && state.conceptual < STRUGGLING_CONCEPTUAL) count++;
    }
    if (count > 0) {
      out.push({
        conceptSlug: concept.slug,
        conceptName: concept.name,
        count,
        studentsWithEvidence: withEvidence,
        reason: `${count} of ${withEvidence} who've practiced feel confident but score below ${pct(
          STRUGGLING_CONCEPTUAL,
        )}% conceptual — likely overconfident, and unlikely to ask for help.`,
      });
    }
  }
  return out.sort(sortFlags);
}

/**
 * Concepts at risk of being FORGOTTEN: students who reached the conceptual floor
 * (they did learn it) but whose retention strength has decayed below
 * RETENTION_RISK. A short spaced review re-anchors these before a test.
 */
export function retentionRiskRanking(
  mastery: ClassMastery,
  concepts: readonly Pick<Concept, "slug" | "name">[],
): ConceptFlag[] {
  const out: ConceptFlag[] = [];
  for (const concept of concepts) {
    let count = 0;
    let withEvidence = 0;
    for (const userId of Object.keys(mastery)) {
      const state = mastery[userId]?.[concept.slug];
      if (!hasEvidence(state)) continue;
      withEvidence++;
      if (state.conceptual >= STRUGGLING_CONCEPTUAL && state.retentionStrength < RETENTION_RISK) count++;
    }
    if (count > 0) {
      out.push({
        conceptSlug: concept.slug,
        conceptName: concept.name,
        count,
        studentsWithEvidence: withEvidence,
        reason: `${count} of ${withEvidence} learned this but their retention has faded below ${pct(
          RETENTION_RISK,
        )}% — a quick review will re-anchor it before it's lost.`,
      });
    }
  }
  return out.sort(sortFlags);
}

// ===========================================================================
// Per-student roster (D-045) — the student-centric view the page lacked.
// ===========================================================================

export type StudentStatus = "struggling" | "not_started" | "on_track";

export interface StudentRow {
  userId: string;
  /** short, non-PII handle for display (UUIDs are anonymous) */
  shortId: string;
  conceptsStarted: number;
  conceptsTotal: number;
  coverage: number;
  /** mean conceptual over STARTED concepts (0 when none started) */
  avgConceptual: number;
  strugglingConcepts: number;
  /** most recent evidence timestamp across concepts (ISO) or null */
  lastActiveAt: string | null;
  status: StudentStatus;
}

const STATUS_RANK: Record<StudentStatus, number> = {
  struggling: 0,
  not_started: 1,
  on_track: 2,
};

/**
 * One row per enrolled student, most-needing-attention first. The student set is
 * the UNION of the roster (so enrolled-but-never-started learners appear) and
 * any mastery keys. Deterministic: sorted by status tier, then more struggling
 * concepts first, then lower average, then userId.
 */
export function studentRoster(
  mastery: ClassMastery,
  roster: readonly { userId: string }[],
  concepts: readonly Pick<Concept, "slug">[],
): StudentRow[] {
  const ids = new Set<string>(Object.keys(mastery));
  for (const r of roster) ids.add(r.userId);

  const rows: StudentRow[] = [];
  for (const userId of ids) {
    let started = 0;
    let conceptualSum = 0;
    let strugglingConcepts = 0;
    let lastActiveAt: string | null = null;
    for (const concept of concepts) {
      const state = mastery[userId]?.[concept.slug];
      if (!hasEvidence(state)) continue;
      started++;
      conceptualSum += state.conceptual;
      if (isStruggling(state)) strugglingConcepts++;
      if (state.lastEvidenceAt && (lastActiveAt === null || state.lastEvidenceAt > lastActiveAt)) {
        lastActiveAt = state.lastEvidenceAt;
      }
    }
    const status: StudentStatus =
      started === 0 ? "not_started" : strugglingConcepts > 0 ? "struggling" : "on_track";
    rows.push({
      userId,
      shortId: userId.replace(/-/g, "").slice(0, 6) || userId,
      conceptsStarted: started,
      conceptsTotal: concepts.length,
      coverage: concepts.length > 0 ? started / concepts.length : 0,
      avgConceptual: started > 0 ? conceptualSum / started : 0,
      strugglingConcepts,
      lastActiveAt,
      status,
    });
  }

  return rows.sort((a, b) => {
    const tier = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (tier !== 0) return tier;
    if (a.strugglingConcepts !== b.strugglingConcepts) return b.strugglingConcepts - a.strugglingConcepts;
    if (a.avgConceptual !== b.avgConceptual) return a.avgConceptual - b.avgConceptual;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });
}

export interface StudentSpreadEntry {
  userId: string;
  conceptual: number;
  bucket: SpreadBucket;
}

/**
 * Per-student conceptual bucket for one concept's heatmap row. Only students
 * WITH evidence appear; the caller renders everyone else as "no-evidence".
 * Sorted by userId for a stable, deterministic column order in tests.
 */
export function studentSpread(mastery: ClassMastery, conceptSlug: string): StudentSpreadEntry[] {
  const entries: StudentSpreadEntry[] = [];
  for (const userId of Object.keys(mastery)) {
    const state = mastery[userId]?.[conceptSlug];
    if (!hasEvidence(state)) continue;
    entries.push({ userId, conceptual: state.conceptual, bucket: bucketConceptual(state.conceptual) });
  }
  return entries.sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}
