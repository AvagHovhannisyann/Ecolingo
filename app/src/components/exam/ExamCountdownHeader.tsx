"use client";

/**
 * Big countdown header (Wave 2 Stream N, D-020 dark-game restyle).
 * Red-amber-green urgency tinting by distance to the exam — every pairing
 * is AA-checked against the surface it renders on (see exam.module.css).
 * No exam date set → an honest empty state that explains *why* the date
 * matters (back-planning, IDEA-110) and the same `updatePlan` mutation the
 * flat UI used, unchanged in semantics.
 */

import Image from "next/image";
import { formatFullDate } from "./dateFormat";
import styles from "./exam.module.css";

type Urgency = "none" | "urgent" | "soon" | "plenty";

function urgencyBand(daysLeft: number | null): Urgency {
  if (daysLeft === null) return "none";
  if (daysLeft <= 3) return "urgent"; // includes exam day (0) and a passed date (negative)
  if (daysLeft <= 10) return "soon";
  return "plenty";
}

const EYEBROW: Record<Urgency, string> = {
  none: "No exam date set",
  urgent: "Coming up fast",
  soon: "Getting close",
  plenty: "Plenty of runway",
};

export function ExamCountdownHeader({
  examISO,
  nowISO,
  onDateChange,
}: {
  examISO: string | null;
  nowISO: string;
  onDateChange: (value: string) => void;
}) {
  const daysLeft = examISO ? Math.ceil((Date.parse(examISO) - Date.parse(nowISO)) / 86_400_000) : null;
  const band = urgencyBand(daysLeft);

  let heading: string;
  if (daysLeft === null) {
    heading = "No exam date set yet";
  } else if (daysLeft < 0) {
    heading = "Your exam date has passed";
  } else if (daysLeft === 0) {
    heading = "Exam day is today";
  } else {
    heading = `${daysLeft} day${daysLeft === 1 ? "" : "s"} until your exam`;
  }

  return (
    <section aria-labelledby="exam-countdown-heading" className={`${styles.header} ${styles[`header--${band}`]}`}>
      <div className={styles.headerRow}>
        {/* Higgsfield "determined" mascot (decorative slot §17.2) — the
            eco-* v2 set fits the "counting down, studying hard" framing. */}
        <Image
          src="/art-v2/eco-determined.webp"
          alt=""
          role="presentation"
          width={200}
          height={200}
          className={`art-enter ${styles.mascot}`}
        />
        <div className={styles.headerCopy}>
          <p className={`${styles.eyebrow} ${styles[`eyebrow--${band}`]}`}>{EYEBROW[band]}</p>
          <h1 id="exam-countdown-heading" className={styles.countdownHeading}>
            {daysLeft !== null && daysLeft > 0 ? (
              <>
                <span className={styles.countdownNumber}>{daysLeft}</span>
                {`day${daysLeft === 1 ? "" : "s"} until your exam`}
              </>
            ) : (
              heading
            )}
          </h1>
          <p className={styles.subline}>
            {examISO ? (
              <>
                {formatFullDate(examISO)} — the scheduler back-plans every examinable concept to be reviewed
                inside this window, weakest first.
              </>
            ) : (
              <>
                Reviews follow pure retention timing until you add one. Setting a date lets the scheduler
                back-plan from it, pulling examinable concepts forward so nothing is met for the first time
                in exam week.
              </>
            )}
          </p>
        </div>
      </div>

      <label className={styles.dateField} htmlFor="exam-date-input">
        Exam date
        <input
          id="exam-date-input"
          type="date"
          className={styles.dateInput}
          value={examISO?.slice(0, 10) ?? ""}
          onChange={(e) => onDateChange(e.target.value)}
        />
      </label>
    </section>
  );
}
