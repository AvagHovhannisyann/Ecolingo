"use client";

/**
 * Onboarding diagnostic (spec §7.5, IDEA-005/006/007). Four quick items:
 * two math-readiness, two graph-reading, each with a confidence rating.
 * Scored deterministically (engine/diagnostic.ts); results land in the
 * profile and gently suggest defaults the learner confirms next step.
 */

import { useState } from "react";
import {
  DIAGNOSTIC_ITEMS,
  scoreDiagnostic,
  suggestedDefaults,
  type DiagnosticAnswer,
  type DiagnosticResult,
} from "@/lib/engine/diagnostic";
import { MiniSolowDiagram } from "./MiniSolowDiagram";

export function DiagnosticStep({
  onDone,
}: {
  onDone: (result: DiagnosticResult, defaults: ReturnType<typeof suggestedDefaults>) => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [numericRaw, setNumericRaw] = useState("");
  const [optionId, setOptionId] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<1 | 2 | 3 | 4 | null>(null);

  const item = DIAGNOSTIC_ITEMS[index];

  const submit = () => {
    const response = item.kind === "numeric" ? numericRaw : (optionId ?? "");
    if (!response.trim()) return;
    const next = [...answers, { itemId: item.id, response, confidence }];
    setNumericRaw("");
    setOptionId(null);
    setConfidence(null);
    if (index + 1 < DIAGNOSTIC_ITEMS.length) {
      setAnswers(next);
      setIndex(index + 1);
    } else {
      const result = scoreDiagnostic(next);
      onDone(result, suggestedDefaults(result));
    }
  };

  return (
    <div>
      <p className="text-sm text-gray-600" aria-live="polite">
        Question {index + 1} of {DIAGNOSTIC_ITEMS.length} — there&apos;s no grade here; this only tunes where we start.
      </p>
      <p className="mt-3 font-medium">{item.prompt}</p>

      {item.showDiagram && (
        <div className="mt-2">
          <MiniSolowDiagram ariaLabel="A curved solid line rising from the origin and a straight dashed line from the origin, crossing once. Left of the crossing the curved line is higher; right of it the dashed line is higher." />
        </div>
      )}

      {item.kind === "numeric" ? (
        <label className="mt-3 block text-sm">
          Your answer{item.unitHint ? ` (${item.unitHint})` : ""}
          <input
            type="text"
            inputMode="decimal"
            className="mt-1 block w-full max-w-xs rounded-xl border border-gray-400 p-3"
            value={numericRaw}
            onChange={(e) => setNumericRaw(e.target.value)}
          />
        </label>
      ) : (
        <div className="mt-3 space-y-2">
          {item.options!.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={optionId === o.id}
              onClick={() => setOptionId(o.id)}
              className={`block min-h-12 w-full p-3 text-left text-sm ${
                optionId === o.id ? "choice-selected" : "choice-idle"
              }`}
            >
              {o.text}
            </button>
          ))}
        </div>
      )}

      <fieldset className="mt-3">
        <legend className="text-sm text-gray-700">How confident are you? (IDEA-007 — helps calibrate your reviews)</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {([1, 2, 3, 4] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={confidence === c}
              onClick={() => setConfidence(c)}
              className={`min-h-12 px-3 text-sm ${
                confidence === c ? "choice-selected" : "choice-idle"
              }`}
            >
              {["Guessing", "Unsure", "Fairly sure", "Certain"][c - 1]}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={submit}
        disabled={item.kind === "numeric" ? !numericRaw.trim() : !optionId}
        className="mt-4 btn-primary min-h-12 px-6 text-white disabled:opacity-40"
      >
        {index + 1 < DIAGNOSTIC_ITEMS.length ? "Next" : "Finish diagnostic"}
      </button>
    </div>
  );
}
