"use client";

/**
 * Reading-level adapter (D-036). The teacher pastes a passage and picks a target
 * level; the grounded generator re-pitches the wording WITHOUT changing any
 * facts, and the result is handed to /teach/print. Honest degrade if AI isn't
 * configured.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateHandout } from "@/lib/ai/teach-generate";
import { useTeachingStyle } from "@/lib/teaching-style-store";
import { savePrintable } from "@/lib/teach/printable-store";

export function ReadingLevelClient() {
  const router = useRouter();
  const style = useTeachingStyle();
  const [passage, setPassage] = useState("");
  const [level, setLevel] = useState<"simpler" | "advanced">("simpler");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    if (passage.trim().length < 20) return;
    setBusy(true);
    setNote(null);
    const outcome = await generateHandout(
      "reading_level",
      [{ heading: "Passage", text: passage.trim() }],
      style,
      { level },
    );
    setBusy(false);
    if (!outcome.ok) {
      setNote(
        outcome.reason === "no_provider"
          ? "Live AI isn't configured on the server yet, so this can't generate."
          : "Couldn't adapt that passage just now — try again in a moment.",
      );
      return;
    }
    savePrintable({
      kind: "handout",
      title: level === "advanced" ? "Passage (advanced)" : "Passage (simplified)",
      mode: "reading_level",
      sourceTitle: passage.trim().slice(0, 60),
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
      <h1 className="mt-2 text-2xl font-bold">Reading-level adapter</h1>
      <p className="mt-1 text-sm text-app">
        Paste a passage and pick a target level. The AI re-pitches the wording and complexity — the facts stay
        exactly the same.
      </p>

      <div className="card mt-4 p-4">
        <fieldset>
          <legend className="text-sm font-bold">Target level</legend>
          <div className="mt-2 flex gap-2">
            {(
              [
                ["simpler", "Simpler"],
                ["advanced", "More advanced"],
              ] as ["simpler" | "advanced", string][]
            ).map(([v, lbl]) => (
              <button
                key={v}
                type="button"
                aria-pressed={level === v}
                onClick={() => setLevel(v)}
                className={`min-h-11 rounded-xl border-2 px-3 text-sm font-bold ${
                  level === v
                    ? "border-[var(--model-blue)] bg-[var(--model-blue-tint)] text-[var(--model-blue-text)]"
                    : "border-[color:var(--app-border)]"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </fieldset>

        <label htmlFor="rl-passage" className="mt-4 block text-sm font-bold">
          Passage
        </label>
        <textarea
          id="rl-passage"
          rows={6}
          value={passage}
          onChange={(e) => setPassage(e.target.value)}
          placeholder="Paste the passage to re-pitch…"
          className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm"
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || passage.trim().length < 20}
          className="btn-primary mt-3 min-h-12 px-5 py-3 text-white disabled:opacity-50"
        >
          {busy ? "Adapting…" : "Adapt passage →"}
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
