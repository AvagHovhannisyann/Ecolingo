"use client";

/**
 * Rubric builder (D-036). The teacher pastes an assignment prompt; the grounded
 * generator drafts a grading rubric (criteria + level descriptors) from it, and
 * the result is handed to /teach/print. Honest degrade if AI isn't configured.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateHandout } from "@/lib/ai/teach-generate";
import { useTeachingStyle } from "@/lib/teaching-style-store";
import { savePrintable } from "@/lib/teach/printable-store";

export function RubricBuilderClient() {
  const router = useRouter();
  const style = useTeachingStyle();
  const [prompt, setPrompt] = useState("");
  const [levels, setLevels] = useState(4);
  const [points, setPoints] = useState(100);
  const [usePoints, setUsePoints] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    if (prompt.trim().length < 10) return;
    setBusy(true);
    setNote(null);
    const outcome = await generateHandout("rubric", [{ heading: "Assignment", text: prompt.trim() }], style, {
      rubricLevels: levels,
      rubricPoints: usePoints ? points : undefined,
    });
    setBusy(false);
    if (!outcome.ok) {
      setNote(
        outcome.reason === "no_provider"
          ? "Live AI isn't configured on the server yet, so this can't generate."
          : "Couldn't draft that rubric just now — try again in a moment.",
      );
      return;
    }
    savePrintable({
      kind: "handout",
      title: "Grading rubric",
      mode: "rubric",
      sourceTitle: prompt.trim().slice(0, 60),
      model: outcome.model,
      generatedAtISO: new Date().toISOString(),
      sections: outcome.sections,
    });
    router.push("/teach/print");
  };

  return (
    <div>
      <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
        ← Back to teacher workspace
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Rubric builder</h1>
      <p className="mt-1 text-sm text-app">
        Paste your assignment or open-ended prompt. The AI drafts a grading rubric — criteria with performance-level
        descriptors — for you to review and print.
      </p>

      <div className="card mt-4 p-4">
        <label htmlFor="rubric-prompt" className="block text-sm font-bold">
          Assignment prompt
        </label>
        <textarea
          id="rubric-prompt"
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Write a 500-word argument on whether a carbon tax reduces emissions, using evidence from at least two sources."
          className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm"
        />

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <fieldset>
            <legend className="text-sm font-bold">Performance levels</legend>
            <div className="mt-1 flex gap-2">
              {[3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={levels === n}
                  onClick={() => setLevels(n)}
                  className={`min-h-11 w-11 rounded-xl border-2 text-sm font-bold ${
                    levels === n
                      ? "border-[var(--model-blue)] bg-[var(--model-blue-tint)] text-[var(--model-blue-text)]"
                      : "border-[color:var(--app-border)]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="text-sm font-bold">
            <span className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} />
              Total points
            </span>
            <input
              type="number"
              min={1}
              max={1000}
              value={points}
              disabled={!usePoints}
              onChange={(e) => setPoints(Math.max(1, Math.min(1000, Number(e.target.value) || 100)))}
              className="mt-1 block w-28 rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-2 text-sm font-normal disabled:opacity-50"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || prompt.trim().length < 10}
          className="btn-primary mt-4 min-h-12 px-5 py-3 text-white disabled:opacity-50"
        >
          {busy ? "Drafting rubric…" : "Draft rubric →"}
        </button>
        {note && (
          <p className="mt-3 rounded-xl bg-[var(--coral-tint)] p-3 text-sm text-[var(--deep-ink)]" role="status">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
