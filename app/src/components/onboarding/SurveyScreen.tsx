"use client";

/**
 * One survey screen: Eco mascot on the left with a speech bubble (caret
 * pointing at Eco) that holds the real question text as a focusable heading,
 * and the answer controls below. The mascot image is decorative (alt="") —
 * the question is always real text (GATE-002 spirit).
 */

import Image from "next/image";
import type { RefObject } from "react";

export type EcoPose = "eco-wave" | "eco-think" | "eco-encourage" | "eco-celebrate";

export function SurveyScreen({
  pose,
  headingId,
  headingRef,
  question,
  why,
  children,
}: {
  pose: EcoPose;
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  question: string;
  why?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="survey-screen" aria-labelledby={headingId}>
      <div className="survey-stage">
        <Image
          src={`/art-v2/${pose}.webp`}
          alt=""
          aria-hidden="true"
          width={256}
          height={256}
          priority
          className="survey-mascot art-enter"
        />
        <div className="survey-bubble">
          <h1 id={headingId} ref={headingRef} tabIndex={-1} className="survey-question">
            {question}
          </h1>
          {why && <p className="survey-why">{why}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
