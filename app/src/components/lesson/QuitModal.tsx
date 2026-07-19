"use client";

/**
 * QuitModal — the retention prompt shown when the learner taps the X mid-lesson.
 * Focus-trapped dialog (aria-modal) with the sad mascot, a warning, and two
 * choices: KEEP LEARNING (primary, closes back to the lesson) and END SESSION
 * (quiet red text link → /learn). Esc closes back to the lesson. Focus is moved
 * in on open and restored to the opener on close (handled by the caller).
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./lesson.module.css";

export function QuitModal({ onKeepLearning }: { onKeepLearning: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onKeepLearning();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onKeepLearning]);

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onKeepLearning();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quit-modal-title"
        className={styles.modal}
      >
        <Image
          src="/art-v2/eco-sad.webp"
          alt=""
          role="presentation"
          width={200}
          height={200}
          className="mx-auto h-28 w-28 rounded-2xl object-cover"
        />
        <h2 id="quit-modal-title" className="mt-3 text-lg font-extrabold text-app">
          Wait, don&apos;t go! You&apos;ll lose your progress in this lesson.
        </h2>
        <div className="mt-5 flex flex-col items-stretch gap-3">
          <button
            ref={keepRef}
            type="button"
            onClick={onKeepLearning}
            className="btn-primary min-h-12 w-full px-6 text-white"
          >
            Keep learning
          </button>
          <Link
            href="/learn"
            className="min-h-12 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-[color:var(--duo-red-text)] hover:underline"
          >
            End session
          </Link>
        </div>
      </div>
    </div>
  );
}
