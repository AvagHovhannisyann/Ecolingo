"use client";

/**
 * LessonShell — the one-exercise-per-screen chrome (D-020). Renders the lesson's
 * own top row directly under the app shell header: an X/close control on the
 * left, a fat rounded green progress bar that fills per completed step in the
 * middle, and a hearts indicator on the right. Below the row it lays the current
 * exercise out vertically centred with a bottom-anchored action footer.
 *
 * The shell owns none of the pedagogy — it only positions one step's worth of
 * content and reports the close intent upward (the player decides whether to
 * open the quit modal). Hearts are read the same way AppStatBar reads them: a
 * hardcoded 5 until the hearts economy lands (see TODO below).
 */

import type { ReactNode } from "react";
import { HeartIcon } from "../icons";
import styles from "./lesson.module.css";

// TODO(hearts-economy): mirrors AppStatBar — hearts are a fixed 5 until the
// lives/refill system ships in a later wave.
const HEARTS = 5;

export function LessonShell({
  completed,
  total,
  onClose,
  banner,
  body,
  footer,
  bodyHasStrip = false,
  closeRef,
}: {
  /** number of steps already finished (drives the progress fill) */
  completed: number;
  total: number;
  onClose: () => void;
  banner?: ReactNode;
  body: ReactNode;
  footer?: ReactNode;
  /** add bottom padding so the fixed feedback strip never hides content */
  bodyHasStrip?: boolean;
  closeRef?: React.Ref<HTMLButtonElement>;
}) {
  const pct = total > 0 ? Math.round((Math.min(completed, total) / total) * 100) : 0;

  return (
    <div className={styles.screen}>
      <div className={styles.topRow}>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className={styles.closeBtn}
          aria-label="Close lesson"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(completed, total)}
        >
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>

        <span className={styles.hearts} title="Hearts">
          <HeartIcon className="h-6 w-6" />
          <span>{HEARTS}</span>
          <span className="sr-only">hearts</span>
        </span>
      </div>

      {banner}

      <div className={`${styles.body} ${bodyHasStrip ? styles.hasStrip : ""}`}>{body}</div>

      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </div>
  );
}
