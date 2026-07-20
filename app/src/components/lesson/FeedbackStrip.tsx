"use client";

/**
 * FeedbackStrip — the signature Duolingo moment. After a question is scored a
 * full-width strip slides up from the bottom of the screen:
 *   - correct: green-tinted, bold "Nicely done!" + the key idea, a green CONTINUE
 *   - wrong:   red-tinted, "Correct answer:" + the right answer rendered from the
 *              deterministic answer key + misconception-specific remediation, and
 *              a red TRY AGAIN (the lesson keeps its retry-until-correct pedagogy,
 *              so a wrong answer returns to the question rather than advancing).
 *
 * GATE-002: every word here comes from existing content — the answer key, the
 * misconception/remediation table, or the question's own hint. Nothing is
 * invented, and scoring already happened in the deterministic engine.
 * prefers-reduced-motion is honoured by the stylesheet (no slide, just appear).
 */

import { useEffect, useRef } from "react";
import type { Question } from "@/lib/engine/types";
import type { ScoreResult } from "@/lib/engine/scoring";
import { misconceptions } from "@/content/active-course";
import { AmbientArt } from "../AmbientHero";
import { MathTex } from "../MathTex";
import styles from "./lesson.module.css";

/** Render the correct answer for any question type straight from its answer key. */
function CorrectAnswer({ question }: { question: Question }) {
  switch (question.type) {
    case "mc_single": {
      const o = question.options.find((x) => x.id === question.answerKey.correctOptionId);
      return <span>{o?.text ?? ""}</span>;
    }
    case "mc_multi": {
      const texts = question.answerKey.correctOptionIds
        .map((id) => question.options.find((o) => o.id === id)?.text)
        .filter(Boolean);
      return <span>{texts.join("; ")}</span>;
    }
    case "numeric":
      return (
        <span>
          {question.answerKey.value}
          {question.unitLabel ? ` ${question.unitLabel}` : ""}
        </span>
      );
    case "equation_assembly":
      return (
        <span>
          {question.answerKey.orderedTokenIds.map((id) => {
            const tok = question.tokens.find((t) => t.id === id);
            return tok ? <MathTex key={id} latex={tok.latex + "\\;"} /> : null;
          })}
        </span>
      );
    case "causal_order": {
      const texts = question.answerKey.orderedItemIds.map(
        (id) => question.items.find((it) => it.id === id)?.text ?? ""
      );
      return <span>{texts.join(" → ")}</span>;
    }
    case "diagram_label": {
      const pairs = Object.values(question.answerKey.slotToLabel).map((labelId) => {
        const label = question.labels.find((l) => l.id === labelId);
        return label ? label.text : labelId;
      });
      return <span>{pairs.join(", ")}</span>;
    }
    default:
      return null;
  }
}

export function FeedbackStrip({
  question,
  result,
  onContinue,
  onRetry,
}: {
  question: Question;
  result: ScoreResult;
  onContinue: () => void;
  onRetry: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btnRef.current?.focus();
  }, []);

  const misconception =
    result.misconceptionSlugs.length > 0
      ? misconceptions.find((m) => m.slug === result.misconceptionSlugs[0]) ?? null
      : null;

  if (result.correct) {
    return (
      <aside
        className={`${styles.strip} ${styles.stripCorrect}`}
        role="status"
        aria-live="polite"
        aria-label="Correct"
      >
        <div className={styles.stripInner}>
          <div className="flex items-start gap-3">
            {/* Higgsfield cheer loop — Eco celebrates the correct answer */}
            <AmbientArt
              videoSrc="/art-cast/eco-cheer-loop.mp4"
              imageSrc="/art-v2/eco-celebrate.webp"
              width={480}
              height={480}
              className="h-16 w-16 shrink-0 rounded-2xl border-2 border-[color:var(--app-border)] object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className={`${styles.stripTitle} ${styles.stripTitleCorrect}`}>
                <svg viewBox="0 0 20 20" className="h-6 w-6" aria-hidden="true">
                  <circle cx="10" cy="10" r="10" fill="var(--duo-green)" />
                  <path
                    d="M5.5 10.5l3 3 6-6.5"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Nicely done!
              </p>
              <p className="text-sm text-app">{question.hint}</p>
            </div>
          </div>
          <button
            ref={btnRef}
            type="button"
            onClick={onContinue}
            className="btn-primary min-h-12 w-full px-6 text-white"
          >
            Continue
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`${styles.strip} ${styles.stripWrong}`}
      role="alert"
      aria-label="Incorrect"
    >
      <div className={styles.stripInner}>
        <div className="flex items-start gap-3">
          {/* Higgsfield sad-then-encouraging loop — no penalty, just honesty */}
          <AmbientArt
            videoSrc="/art-cast/eco-sad-loop.mp4"
            imageSrc="/art-v2/eco-sad.webp"
            width={480}
            height={480}
            className="h-16 w-16 shrink-0 rounded-2xl border-2 border-[color:var(--app-border)] object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className={`${styles.stripTitle} ${styles.stripTitleWrong}`}>
              <svg viewBox="0 0 20 20" className="h-6 w-6" aria-hidden="true">
                <circle cx="10" cy="10" r="10" fill="var(--duo-red)" />
                <path
                  d="M6.5 6.5l7 7M13.5 6.5l-7 7"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
              Correct answer:
            </p>
            <p className="text-sm font-semibold text-app">
              <CorrectAnswer question={question} />
            </p>
            {misconception ? (
              <p className="text-sm text-app">
                <strong>Likely mix-up:</strong> {misconception.remediationHint}
              </p>
            ) : (
              <p className="text-sm text-app">{question.hint}</p>
            )}
          </div>
        </div>
        <button
          ref={btnRef}
          type="button"
          onClick={onRetry}
          className={`${styles.btnStripWrong} min-h-12 w-full rounded-[14px] px-6 text-sm font-extrabold uppercase tracking-wide`}
        >
          Try again
        </button>
      </div>
    </aside>
  );
}
