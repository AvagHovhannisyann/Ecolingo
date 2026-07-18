/**
 * Deterministic review scheduler (spec §20.7, IDEA-109/110/111/112/114/119).
 * Not an LLM. Every scheduled item carries a learner-readable reason (§22).
 */

import type { Concept, MasteryState, ReviewItem, StudyPlanInput } from "./types";
import { dominantMisconception, retentionAt } from "./mastery";

const DAY = 86_400_000;

export function isoDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** expanding intervals; contraction on weak retention */
export function nextIntervalDays(prevIntervalDays: number, retention: number): number {
  if (retention < 0.35) return 1; // relearn tomorrow
  if (retention < 0.6) return Math.max(1, Math.round(prevIntervalDays * 1.3));
  return Math.max(1, Math.round(prevIntervalDays * 2.2));
}

export interface ScheduleContext {
  nowISO: string;
  concepts: Concept[];
  mastery: Record<string, MasteryState>;
  prevIntervals: Record<string, number>; // conceptSlug → last interval days
  plan: StudyPlanInput;
}

function skipNoStudyDays(dueMs: number, noStudyDays: string[]): number {
  let d = dueMs;
  let guard = 0;
  while (noStudyDays.includes(isoDate(d)) && guard++ < 30) d += DAY;
  return d;
}

/**
 * Build the review queue: one candidate per studied concept, due date from
 * retention decay, pulled earlier by exam back-planning and importance.
 */
export function buildReviewQueue(ctx: ScheduleContext): ReviewItem[] {
  const now = Date.parse(ctx.nowISO);
  const exam = ctx.plan.examDateISO ? Date.parse(ctx.plan.examDateISO) : null;
  const items: ReviewItem[] = [];

  for (const concept of ctx.concepts) {
    const m = ctx.mastery[concept.slug];
    if (!m || m.evidenceCount === 0) continue; // never studied → belongs to Learn, not Review

    const retention = retentionAt(m, ctx.nowISO);
    const prevInterval = ctx.prevIntervals[concept.slug] ?? 1;
    const misconception = dominantMisconception(m);

    let intervalDays = nextIntervalDays(prevInterval, retention);
    let reasonCode: ReviewItem["reasonCode"];
    let reasonText: string;

    if (misconception) {
      intervalDays = Math.min(intervalDays, 1);
      reasonCode = "misconception_active";
      reasonText = `You're seeing this because your recent answers suggest a specific mix-up on ${concept.name} that's worth clearing up now.`;
    } else if (retention < 0.5 && m.retentionStrength >= 0.5) {
      intervalDays = Math.min(intervalDays, 2);
      reasonCode = "retention_falling";
      reasonText = `You're seeing this because you understood ${concept.name} recently but your retention estimate is falling.`;
    } else if (m.evidenceCount <= 2) {
      reasonCode = "new_concept";
      reasonText = `You're seeing this because ${concept.name} is new — an early review locks it in.`;
    } else {
      reasonCode = "retention_falling";
      reasonText = `You're seeing this because it's the ideal moment to review ${concept.name} before you'd start forgetting it.`;
    }

    // high-importance weak concepts come back more often (IDEA-114)
    if (concept.importance >= 4 && retention < 0.6) {
      intervalDays = Math.max(1, Math.floor(intervalDays / 2));
    }

    let dueMs = now + intervalDays * DAY;

    // backward exam planning (IDEA-110): everything examinable must be seen
    // again inside the pre-exam window, weakest first
    if (exam && concept.examinable) {
      const daysToExam = Math.floor((exam - now) / DAY);
      if (daysToExam >= 0 && intervalDays > daysToExam) {
        dueMs = now + Math.max(0, daysToExam - 1) * DAY;
        reasonCode = "exam_priority";
        reasonText = `You're seeing this because ${concept.name} is examinable and your exam is in ${daysToExam} day${daysToExam === 1 ? "" : "s"}.`;
        intervalDays = Math.max(1, Math.floor((dueMs - now) / DAY));
      }
    }

    dueMs = skipNoStudyDays(dueMs, ctx.plan.noStudyDays);

    // A no-study day at or just before the exam must never push an examinable
    // review onto or past the exam itself: a review scheduled after the exam
    // cannot help and silently defeats the back-planning guarantee (IDEA-110).
    // `skipNoStudyDays` only ever moves *forward*, so if the day the back-planner
    // chose (or the natural due day) is a no-study day near the deadline, the
    // review can jump beyond the exam. When that happens for an examinable
    // concept, walk backward instead to the last studyable day strictly before
    // the exam (falling back to now when the whole pre-exam window is blocked).
    if (exam !== null && concept.examinable && dueMs >= exam) {
      let d = exam - DAY;
      let guard = 0;
      while (ctx.plan.noStudyDays.includes(isoDate(d)) && d > now && guard++ < 366) d -= DAY;
      dueMs = Math.max(now, d);
    }

    items.push({
      conceptSlug: concept.slug,
      dueAt: new Date(dueMs).toISOString(),
      intervalDays,
      reasonCode,
      reasonText,
    });
  }

  // order: overdue first, then by due date, importance breaking ties
  const bySlug = new Map(ctx.concepts.map((c) => [c.slug, c] as const));
  return items.sort((a, b) => {
    const t = Date.parse(a.dueAt) - Date.parse(b.dueAt);
    if (t !== 0) return t;
    return (bySlug.get(b.conceptSlug)?.importance ?? 0) - (bySlug.get(a.conceptSlug)?.importance ?? 0);
  });
}

/** items due now (with catch-up flag for overdue, IDEA-112) */
export function dueNow(queue: ReviewItem[], nowISO: string): (ReviewItem & { overdue: boolean })[] {
  const now = Date.parse(nowISO);
  return queue
    .filter((i) => Date.parse(i.dueAt) <= now)
    .map((i) => {
      const overdueDays = Math.floor((now - Date.parse(i.dueAt)) / DAY);
      return overdueDays >= 1
        ? {
            ...i,
            overdue: true,
            reasonCode: "overdue_catchup" as const,
            reasonText: `${i.reasonText} (It was due ${overdueDays} day${overdueDays === 1 ? "" : "s"} ago — no penalty, just catch up.)`,
          }
        : { ...i, overdue: false };
    });
}

/**
 * Daily budget (IDEA-111): fit due reviews + new lessons into minutesPerDay.
 * Reviews cost ~3 min each; lessons carry their own estimate.
 */
export function planToday(
  due: ReviewItem[],
  newLessons: { id: string; estimatedMinutes: number }[],
  minutesPerDay: number
): { reviews: ReviewItem[]; lessons: { id: string; estimatedMinutes: number }[]; minutesPlanned: number } {
  const REVIEW_MIN = 3;
  let budget = Math.max(5, minutesPerDay);
  const reviews: ReviewItem[] = [];
  for (const r of due) {
    if (budget - REVIEW_MIN < 0) break;
    reviews.push(r);
    budget -= REVIEW_MIN;
  }
  const lessons: { id: string; estimatedMinutes: number }[] = [];
  for (const l of newLessons) {
    if (budget - l.estimatedMinutes < 0) break;
    lessons.push(l);
    budget -= l.estimatedMinutes;
  }
  return { reviews, lessons, minutesPlanned: Math.max(5, minutesPerDay) - budget };
}
