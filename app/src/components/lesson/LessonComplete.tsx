"use client";

/**
 * LessonComplete — end-of-lesson celebration screen (D-020). Shows the celebrate
 * mascot (an autoplaying muted loop behind a reduced-motion guard, with a webp
 * still fallback), an XP-style summary of what the learner just did, the honest
 * mastery readout (updated from real evidence, GATE-006), and a big CONTINUE
 * back to /learn. The heading receives focus on mount for the same
 * step-to-step focus contract the rest of the flow follows.
 */

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AmbientArt } from "../AmbientHero";

export function LessonComplete({
  conceptName,
  stepsCompleted,
  questionsCorrect,
  questionsAttempted,
  conceptualPct,
  transferPct,
}: {
  conceptName: string;
  stepsCompleted: number;
  questionsCorrect: number;
  questionsAttempted: number;
  conceptualPct: number;
  transferPct: number;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-8.5rem)] flex-col items-center justify-center py-6 text-center">
      <AmbientArt
        videoSrc="/art-cast/eco-cheer-loop.mp4"
        imageSrc="/art-v2/eco-celebrate.webp"
        width={480}
        height={480}
        className="art-enter h-40 w-40 rounded-3xl object-cover"
      />
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-2xl font-extrabold text-[color:var(--duo-green-text)] outline-none"
      >
        Lesson complete!
      </h2>
      <p className="mt-1 text-sm text-app-muted">You built real evidence for {conceptName}.</p>

      <div className="mt-6 grid w-full max-w-sm grid-cols-2 gap-3">
        <div className="card px-4 py-4">
          <p className="text-2xl font-extrabold text-[color:var(--duo-gold)]">{stepsCompleted}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-app-muted">
            Steps completed
          </p>
        </div>
        <div className="card px-4 py-4">
          <p className="text-2xl font-extrabold text-[color:var(--duo-green-text)]">
            {questionsCorrect}
            <span className="text-base text-app-muted">/{questionsAttempted}</span>
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-app-muted">
            Questions right
          </p>
        </div>
      </div>

      <p className="mt-5 max-w-sm text-sm text-app">
        Your mastery of <strong>{conceptName}</strong> updated from real evidence — conceptual{" "}
        {conceptualPct}%, transfer {transferPct}%. The scheduler queued this concept for review before
        you&apos;d start forgetting it — see{" "}
        <Link href="/review" className="underline">
          Review
        </Link>
        .
      </p>

      <Link href="/learn" className="btn-primary mt-6 min-h-12 w-full max-w-sm px-6 text-white">
        Continue
      </Link>
    </div>
  );
}
