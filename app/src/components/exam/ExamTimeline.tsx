"use client";

/**
 * Back-planned schedule as a vertical timeline (Wave 2 Stream N, D-020
 * dark-game restyle). Pure presentation over two scheduler functions:
 *
 *  - `dueNow(queue, nowISO)` — everything due today or earlier. Items whose
 *    due date has already passed come back with `overdue: true` and a
 *    reasonText the engine has already appended a catch-up line to
 *    ("...It was due N days ago — no penalty, just catch up.").
 *  - the raw `queue` from `buildReviewQueue` — everything still ahead,
 *    grouped into day buckets with `scheduler.isoDate` (the same UTC-day
 *    key the scheduler itself uses for no-study-day bookkeeping).
 *
 * Every `reasonText` rendered here is the engine's string verbatim (§22) —
 * nothing is paraphrased or summarized. Today is its own highlighted group;
 * anything overdue is its own distinctly-styled catch-up group ahead of it.
 */

import Link from "next/link";
import { dueNow, isoDate } from "@/lib/engine/scheduler";
import type { Concept, ReviewItem } from "@/lib/engine/types";
import { formatShortDate } from "./dateFormat";
import styles from "./exam.module.css";

interface TimelineEntry {
  conceptSlug: string;
  conceptName: string;
  reasonText: string;
  reasonCode: ReviewItem["reasonCode"];
  overdue: boolean;
}

function reviewCard(entry: TimelineEntry) {
  const classNames = [styles.reviewCard];
  if (entry.overdue) classNames.push(styles.reviewCardOverdue);
  else if (entry.reasonCode === "exam_priority") classNames.push(styles.reviewCardExam);
  return (
    <li key={entry.conceptSlug} className={classNames.join(" ")}>
      <p className={styles.reviewConcept}>{entry.conceptName}</p>
      <p className={styles.reviewReason}>{entry.reasonText}</p>
    </li>
  );
}

export function ExamTimeline({
  queue,
  concepts,
  nowISO,
}: {
  queue: ReviewItem[];
  concepts: Concept[];
  nowISO: string;
}) {
  const now = Date.parse(nowISO);
  const nameFor = (slug: string) => concepts.find((c) => c.slug === slug)?.name ?? slug;
  const toEntry = (item: ReviewItem, overdue: boolean): TimelineEntry => ({
    conceptSlug: item.conceptSlug,
    conceptName: nameFor(item.conceptSlug),
    reasonText: item.reasonText,
    reasonCode: item.reasonCode,
    overdue,
  });

  const due = dueNow(queue, nowISO);
  const overdueEntries = due.filter((i) => i.overdue).map((i) => toEntry(i, true));
  const todayEntries = due.filter((i) => !i.overdue).map((i) => toEntry(i, false));

  const upcoming = queue.filter((i) => Date.parse(i.dueAt) > now);
  const byDay = new Map<string, TimelineEntry[]>();
  for (const item of upcoming) {
    const key = isoDate(Date.parse(item.dueAt));
    const list = byDay.get(key) ?? [];
    list.push(toEntry(item, false));
    byDay.set(key, list);
  }
  const upcomingDayKeys = [...byDay.keys()].sort(); // "YYYY-MM-DD" sorts chronologically

  const hasAny = overdueEntries.length > 0 || todayEntries.length > 0 || upcomingDayKeys.length > 0;

  if (!hasAny) {
    return (
      <p className={styles.emptyTimeline}>
        Nothing scheduled yet — the schedule fills in as you study.{" "}
        <Link href="/learn" className="underline">
          Start today&apos;s plan
        </Link>
        .
      </p>
    );
  }

  return (
    <ol className={styles.timeline}>
      {overdueEntries.length > 0 && (
        <li className={`${styles.dayGroup} ${styles.dayGroupOverdue}`}>
          <div className={styles.dayHeading}>
            <span className={styles.dayMarker} aria-hidden="true" />
            <h3>Catch up ({overdueEntries.length})</h3>
          </div>
          <ul className={styles.cardList}>{overdueEntries.map(reviewCard)}</ul>
        </li>
      )}
      {todayEntries.length > 0 && (
        <li className={`${styles.dayGroup} ${styles.dayGroupToday}`}>
          <div className={styles.dayHeading}>
            <span className={styles.dayMarker} aria-hidden="true" />
            <h3>Today</h3>
          </div>
          <ul className={styles.cardList}>{todayEntries.map(reviewCard)}</ul>
        </li>
      )}
      {upcomingDayKeys.map((key) => (
        <li key={key} className={styles.dayGroup}>
          <div className={styles.dayHeading}>
            <span className={styles.dayMarker} aria-hidden="true" />
            <h3>{formatShortDate(key)}</h3>
          </div>
          <ul className={styles.cardList}>{(byDay.get(key) ?? []).map(reviewCard)}</ul>
        </li>
      ))}
    </ol>
  );
}
