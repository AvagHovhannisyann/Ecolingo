"use client";

/**
 * Question card for the MVP practice formats (IDEA-085..090 subset rendered
 * here: mc_single, mc_multi, numeric, equation_assembly, causal_order;
 * diagram_label ships with the Budget Lab in Phase 4).
 *
 * All scoring is deterministic (src/lib/engine/scoring.ts); this component
 * only collects the answer, runs the hint ladder (IDEA-098), captures
 * confidence (IDEA-007/101), and reports an EvidenceEvent upward.
 * Mistakes are never punished (IDEA-132): wrong answers get a gentle retry.
 */

import Image from "next/image";
import { useMemo, useState } from "react";
import type { EvidenceEvent, Question } from "@/lib/engine/types";
import { scoreAnswer, type Answer, type ScoreResult } from "@/lib/engine/scoring";
import { course, misconceptions, getConcept, getEquation } from "@/content/econ13210";
import { MathTex } from "./MathTex";
import { ExplainPanel } from "./ExplainPanel";
import { MiniSolowDiagram } from "./MiniSolowDiagram";

function shuffled<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function QuestionCard({
  question,
  hintsAllowed = true,
  onEvidence,
}: {
  question: Question;
  hintsAllowed?: boolean;
  onEvidence: (e: EvidenceEvent, result: ScoreResult) => void;
}) {
  const [startedAt] = useState(() => Date.now());
  const [attemptNo, setAttemptNo] = useState(1);
  const [hintShown, setHintShown] = useState(false);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | null>(null);
  const [result, setResult] = useState<ScoreResult | null>(null);

  // answer drafts per format
  const [optionId, setOptionId] = useState<string | null>(null);
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [numericRaw, setNumericRaw] = useState("");
  const [tokenOrder, setTokenOrder] = useState<string[]>([]);
  const [itemOrder, setItemOrder] = useState<string[]>([]);
  const [slotToLabel, setSlotToLabel] = useState<Record<string, string>>({});
  const [activeSlot, setActiveSlot] = useState<string | null>(null);

  const shuffledTokens = useMemo(
    () => (question.type === "equation_assembly" ? shuffled(question.tokens, 7) : []),
    [question]
  );
  const shuffledItems = useMemo(
    () => (question.type === "causal_order" ? shuffled(question.items, 11) : []),
    [question]
  );

  const buildAnswer = (): Answer | null => {
    switch (question.type) {
      case "mc_single":
        return optionId ? { type: "mc_single", optionId } : null;
      case "mc_multi":
        return optionIds.length ? { type: "mc_multi", optionIds } : null;
      case "numeric":
        return numericRaw.trim() ? { type: "numeric", raw: numericRaw } : null;
      case "equation_assembly":
        return tokenOrder.length === question.tokens.length ? { type: "equation_assembly", orderedTokenIds: tokenOrder } : null;
      case "causal_order":
        return itemOrder.length === question.items.length ? { type: "causal_order", orderedItemIds: itemOrder } : null;
      case "diagram_label":
        return Object.keys(slotToLabel).length === question.slots.length
          ? { type: "diagram_label", slotToLabel }
          : null;
      default:
        return null;
    }
  };

  const submit = () => {
    const answer = buildAnswer();
    if (!answer) return;
    const r = scoreAnswer(question, answer);
    setResult(r);
    const evidence: EvidenceEvent = {
      at: new Date().toISOString(),
      conceptSlug: question.conceptSlug,
      questionType: question.type,
      correct: r.correct,
      difficulty: question.difficulty,
      hintsUsed: hintShown ? 1 : 0,
      timeMs: Date.now() - startedAt,
      expectedSeconds: question.expectedSeconds,
      confidence,
      attemptNo,
      transferDistance: question.transferDistance,
      misconceptionSlugs: r.misconceptionSlugs,
    };
    onEvidence(evidence, r);
  };

  const retry = () => {
    setResult(null);
    setAttemptNo((n) => n + 1);
    setOptionId(null);
    setOptionIds([]);
    setNumericRaw("");
    setTokenOrder([]);
    setItemOrder([]);
    setSlotToLabel({});
    setActiveSlot(null);
  };

  const activeMisconception =
    result && result.misconceptionSlugs.length > 0
      ? misconceptions.find((m) => m.slug === result.misconceptionSlugs[0]) ?? null
      : null;

  const concept = getConcept(question.conceptSlug);
  const equation =
    course.equations.find((e) => e.conceptSlug === question.conceptSlug) ??
    (question.conceptSlug === "steady-state" ? getEquation("eq-fundamental") : null);

  const answered = result !== null;
  const answerReady = buildAnswer() !== null;

  return (
    <div className="rounded-2xl border border-gray-300 p-4">
      <p className="font-medium">{question.stem}</p>

      {/* format-specific input */}
      {(question.type === "mc_single" || question.type === "mc_multi") && (
        <fieldset className="mt-3 space-y-2" disabled={answered}>
          <legend className="sr-only">Answer options</legend>
          {question.options.map((o) => {
            const selected = question.type === "mc_single" ? optionId === o.id : optionIds.includes(o.id);
            return (
              <label
                key={o.id}
                className={`flex min-h-12 cursor-pointer items-center gap-3 p-3 ${
                  selected ? "choice-selected" : "choice-idle"
                }`}
              >
                <input
                  type={question.type === "mc_single" ? "radio" : "checkbox"}
                  name={question.id}
                  checked={selected}
                  onChange={() =>
                    question.type === "mc_single"
                      ? setOptionId(o.id)
                      : setOptionIds((xs) => (xs.includes(o.id) ? xs.filter((x) => x !== o.id) : [...xs, o.id]))
                  }
                />
                <span className="text-sm">{o.text}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {question.type === "numeric" && (
        <label className="mt-3 block text-sm">
          Your answer{question.unitLabel ? ` (${question.unitLabel})` : ""}
          <input
            type="text"
            inputMode="decimal"
            className="mt-1 block w-full max-w-xs rounded-xl border border-gray-400 p-3"
            value={numericRaw}
            disabled={answered}
            onChange={(e) => setNumericRaw(e.target.value)}
            aria-describedby={`${question.id}-equiv`}
          />
          <span id={`${question.id}-equiv`} className="text-xs text-gray-600">
            Decimals, fractions and percentages are all accepted — equivalent answers count.
          </span>
        </label>
      )}

      {question.type === "equation_assembly" && (
        <div className="mt-3">
          <p className="text-sm text-gray-700" aria-live="polite">
            Your equation:{" "}
            {tokenOrder.length === 0 ? (
              <em>tap terms below in order</em>
            ) : (
              tokenOrder.map((id) => {
                const tok = question.tokens.find((t) => t.id === id)!;
                return <MathTex key={id} latex={tok.latex + "\\;"} />;
              })
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {shuffledTokens.map((tok) => (
              <button
                key={tok.id}
                type="button"
                disabled={answered || tokenOrder.includes(tok.id)}
                onClick={() => setTokenOrder((xs) => [...xs, tok.id])}
                className="btn-secondary min-h-12 px-3 disabled:opacity-40"
              >
                <MathTex latex={tok.latex} />
              </button>
            ))}
            <button
              type="button"
              disabled={answered || tokenOrder.length === 0}
              onClick={() => setTokenOrder((xs) => xs.slice(0, -1))}
              className="btn-secondary min-h-12 px-3 text-sm disabled:opacity-40"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      {question.type === "causal_order" && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-gray-700">Tap the events in the order they happen:</p>
          {shuffledItems.map((item) => {
            const pos = itemOrder.indexOf(item.id);
            return (
              <button
                key={item.id}
                type="button"
                disabled={answered}
                onClick={() =>
                  setItemOrder((xs) => (xs.includes(item.id) ? xs.filter((x) => x !== item.id) : [...xs, item.id]))
                }
                aria-pressed={pos >= 0}
                className={`flex min-h-12 w-full items-center gap-3 p-3 text-left text-sm ${
                  pos >= 0 ? "choice-selected" : "choice-idle"
                }`}
              >
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs">
                  {pos >= 0 ? pos + 1 : "·"}
                </span>
                {item.text}
              </button>
            );
          })}
        </div>
      )}

      {question.type === "diagram_label" && (
        <div className="mt-3">
          {/* the diagram itself is code-rendered from the model math — it is
              the answer key, so it is never a generated image (GATE-002) */}
          <MiniSolowDiagram
            slotMarkers
            ariaLabel="Solow diagram with three numbered markers: marker 1 on the curved solid line, marker 2 on the straight dashed line, marker 3 at their crossing point."
          />
          <p className="mt-2 text-sm text-gray-700">Pick a marker, then tap the label that belongs to it:</p>
          <div className="mt-2 flex gap-2" role="group" aria-label="Diagram markers">
            {question.slots.map((s, i) => (
              <button
                key={s.id}
                type="button"
                disabled={answered}
                aria-pressed={activeSlot === s.id}
                onClick={() => setActiveSlot(s.id)}
                className={`min-h-12 px-4 ${
                  activeSlot === s.id ? "choice-selected" : "choice-idle"
                }`}
              >
                {i + 1}
                {slotToLabel[s.id] ? " ✓" : ""}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-2">
            {question.labels.map((l) => {
              const assignedTo = Object.entries(slotToLabel).find(([, v]) => v === l.id)?.[0];
              const slotIdx = assignedTo ? question.slots.findIndex((s) => s.id === assignedTo) : -1;
              return (
                <button
                  key={l.id}
                  type="button"
                  disabled={answered || !activeSlot}
                  onClick={() => {
                    if (!activeSlot) return;
                    setSlotToLabel((m) => {
                      const next = { ...m };
                      // a label belongs to at most one marker
                      for (const k of Object.keys(next)) if (next[k] === l.id) delete next[k];
                      next[activeSlot] = l.id;
                      return next;
                    });
                    setActiveSlot(null);
                  }}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-gray-300 p-3 text-left text-sm disabled:opacity-50"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs">
                    {slotIdx >= 0 ? slotIdx + 1 : "·"}
                  </span>
                  <MathTex latex={l.text} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* confidence before submit (IDEA-007) */}
      {!answered && (
        <fieldset className="mt-3">
          <legend className="text-sm text-gray-700">How confident are you?</legend>
          <div className="mt-1 flex gap-2">
            {([1, 2, 3, 4] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={confidence === c}
                onClick={() => setConfidence(c)}
                className={`min-h-12 px-3 text-sm ${confidence === c ? "choice-selected" : "choice-idle"}`}
              >
                {["Guessing", "Unsure", "Fairly sure", "Certain"][c - 1]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* actions */}
      {!answered && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={!answerReady}
            className="btn-primary min-h-12 px-5 text-white disabled:opacity-40"
          >
            Check
          </button>
          {hintsAllowed && !hintShown && (
            <button type="button" onClick={() => setHintShown(true)} className="btn-secondary min-h-12 px-4 text-sm">
              I need a hint
            </button>
          )}
        </div>
      )}
      {hintShown && !answered && (
        <p className="mt-2 rounded-xl bg-gray-100 p-3 text-sm" role="status">
          💡 {question.hint}
        </p>
      )}

      {/* feedback (IDEA-097/099/101) */}
      {result && (
        <div
          className={`mt-3 p-3 ${
            result.correct
              ? "feedback-correct border-green-600 bg-green-50"
              : "feedback-incorrect border-orange-400 bg-orange-50"
          }`}
          role="status"
        >
          {result.correct ? (
            <div className="flex items-start gap-3">
              {/* Higgsfield celebration creature (decorative slot §17.2) */}
              <Image
                src="/art/creature-celebrating.webp"
                alt=""
                role="presentation"
                width={160}
                height={160}
                className="art-enter h-16 w-16 shrink-0 rounded-2xl object-cover sm:h-20 sm:w-20"
              />
              <p className="relative text-sm">
              {/* §16 correct-answer choreography: check draws itself + tiny particles (decorative) */}
              <svg viewBox="0 0 20 20" className="mr-1 inline h-4 w-4 align-text-bottom" aria-hidden="true">
                <path
                  d="M3.5 10.5l4 4 9-9"
                  fill="none"
                  stroke="#15803d"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="check-draw"
                />
              </svg>
              <span aria-hidden="true" className="pointer-events-none absolute -top-1 left-2">
                <span className="particle absolute h-1.5 w-1.5 rounded-full bg-green-600" style={{ "--px": "-10px", "--py": "-14px" } as React.CSSProperties} />
                <span className="particle absolute h-1.5 w-1.5 rounded-full bg-yellow-400" style={{ "--px": "2px", "--py": "-18px" } as React.CSSProperties} />
                <span className="particle absolute h-1.5 w-1.5 rounded-full bg-sky-500" style={{ "--px": "12px", "--py": "-12px" } as React.CSSProperties} />
              </span>
              <span className="sr-only">✓ </span>Correct.
              {confidence !== null && confidence <= 2 && " You were surer than you thought — your understanding is ahead of your confidence."}
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 text-sm">
              {/* Higgsfield encouragement creature (decorative slot §17.2) */}
              <Image
                src="/art/creature-encouraging.webp"
                alt=""
                role="presentation"
                width={160}
                height={160}
                className="art-enter h-16 w-16 shrink-0 rounded-2xl object-cover sm:h-20 sm:w-20"
              />
              <div>
              <p>Not quite — no penalty, let&apos;s fix it.</p>
              {confidence === 4 && (
                <p className="mt-1 text-xs text-orange-900">
                  You were certain but missed it — that gap is exactly what review will target.
                </p>
              )}
              {activeMisconception && (
                <p className="mt-1">
                  <strong>Likely mix-up:</strong> {activeMisconception.description}
                </p>
              )}
              <button type="button" onClick={retry} className="mt-2 btn-secondary min-h-12 px-4">
                Try again
              </button>
              </div>
            </div>
          )}
          <ExplainPanel
            concept={concept}
            equation={equation}
            misconception={activeMisconception}
            extraMode={result.correct ? undefined : "why_wrong"}
          />
        </div>
      )}
    </div>
  );
}
