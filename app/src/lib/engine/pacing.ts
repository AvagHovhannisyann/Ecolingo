/**
 * Lesson pacing plan (D-036). Pure and deterministic.
 *
 * Turns a ratified course plan into a class-by-class schedule: it walks the
 * lessons in unit order and packs them into class sessions no longer than the
 * teacher's chosen minutes-per-class (a lesson longer than a whole session gets
 * its own). Grounded entirely in the teacher's own approved plan and its
 * per-lesson time estimates — nothing invented.
 */

import type { CourseDraft } from "./compile-course";

export interface PacedLesson {
  unitTitle: string;
  lessonTitle: string;
  minutes: number;
}

export interface PacedClass {
  index: number;
  items: PacedLesson[];
  totalMinutes: number;
}

export interface PacingPlan {
  classes: PacedClass[];
  totalMinutes: number;
  minutesPerClass: number;
}

/** Lessons in unit order; any lesson not referenced by a unit is appended. */
export function orderedLessons(draft: CourseDraft): PacedLesson[] {
  const byId = new Map(draft.lessons.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const out: PacedLesson[] = [];
  for (const unit of draft.units) {
    for (const id of unit.lessonIds) {
      const l = byId.get(id);
      if (!l || seen.has(id)) continue;
      seen.add(id);
      out.push({ unitTitle: unit.title, lessonTitle: l.title, minutes: Math.max(1, Math.round(l.estimatedMinutes)) });
    }
  }
  for (const l of draft.lessons) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);
    out.push({ unitTitle: "More", lessonTitle: l.title, minutes: Math.max(1, Math.round(l.estimatedMinutes)) });
  }
  return out;
}

/**
 * Pack the ordered lessons into class sessions of at most `minutesPerClass`
 * (first-fit by teaching order — the sequence is never reordered, so
 * prerequisites stay intact). A lesson longer than a whole class fills its own.
 */
export function buildPacingPlan(draft: CourseDraft, minutesPerClass: number): PacingPlan {
  const cap = Math.max(5, Math.round(minutesPerClass) || 50);
  const lessons = orderedLessons(draft);
  const classes: PacedClass[] = [];
  let cur: PacedLesson[] = [];
  let curMin = 0;
  const flush = () => {
    if (cur.length) {
      classes.push({ index: classes.length + 1, items: cur, totalMinutes: curMin });
      cur = [];
      curMin = 0;
    }
  };
  for (const l of lessons) {
    if (cur.length > 0 && curMin + l.minutes > cap) flush();
    cur.push(l);
    curMin += l.minutes;
  }
  flush();
  return {
    classes,
    totalMinutes: lessons.reduce((n, l) => n + l.minutes, 0),
    minutesPerClass: cap,
  };
}
