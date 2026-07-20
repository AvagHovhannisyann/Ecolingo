"use client";

/**
 * "Teach like you" editor (D-029). The teacher configures how the AI should
 * sound and teach — tone, approach, encouragement, reading level, analogies,
 * real-world examples, and two freeform fields — and sees a live preview of the
 * exact instruction block the AI receives. Saved to the teaching-style store;
 * from there it flows into the course compiler, the item-writer, and the
 * student-facing tutor, so the AI adopts THIS teacher's voice.
 *
 * Implementation only — reuses the app's existing design tokens/components; no
 * new visual language is introduced here (project rule: Fabel owns aesthetic).
 */

import { useState } from "react";
import {
  defaultTeachingStyle,
  isDefaultTeachingStyle,
  styleToPromptFragment,
  AVOID_MAX,
  VOICE_MAX,
  type Encouragement,
  type ReadingLevel,
  type TeacherTone,
  type TeachingApproach,
  type TeachingStyle,
} from "@/lib/engine/teaching-style";
import { saveTeachingStyle, useTeachingStyle } from "@/lib/teaching-style-store";

function sameStyle(a: TeachingStyle, b: TeachingStyle): boolean {
  return (
    a.tone === b.tone &&
    a.approach === b.approach &&
    a.encouragement === b.encouragement &&
    a.readingLevel === b.readingLevel &&
    a.useAnalogies === b.useAnalogies &&
    a.realWorldExamples === b.realWorldExamples &&
    a.voice === b.voice &&
    a.avoid === b.avoid
  );
}

function ChipGroup<T extends string>({
  legend,
  hint,
  value,
  options,
  onChange,
}: {
  legend: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-bold">{legend}</legend>
      {hint && <p className="text-xs text-app-muted">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-xl border-2 px-3 text-sm font-bold ${
              value === o.value
                ? "border-[var(--model-blue)] bg-[var(--model-blue-tint)] text-[var(--model-blue-text)]"
                : "border-[color:var(--app-border)] text-app hover:bg-[color:var(--app-surface-2)]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function TeachingStyleCard() {
  const saved = useTeachingStyle();
  const [draft, setDraft] = useState<TeachingStyle>(saved);
  const [justSaved, setJustSaved] = useState(false);
  const [open, setOpen] = useState(false);

  // Keep the local draft in sync if the saved style changes elsewhere while the
  // editor is closed (e.g. after a hard reload hydrates the store).
  const dirty = !sameStyle(draft, saved);

  const set = <K extends keyof TeachingStyle>(key: K, val: TeachingStyle[K]) => {
    setDraft((d) => ({ ...d, [key]: val }));
    setJustSaved(false);
  };

  const onSave = () => {
    saveTeachingStyle(draft);
    setJustSaved(true);
  };

  const onReset = () => {
    setDraft(defaultTeachingStyle());
    setJustSaved(false);
  };

  const configured = !isDefaultTeachingStyle(saved);
  const preview = styleToPromptFragment(draft);

  return (
    <section className="card mt-4 p-4" aria-labelledby="teach-style-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="teach-style-heading" className="font-bold">
            <span aria-hidden>🎙️</span> Teach like you
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            Tell the AI how <em>you</em> teach. It uses this voice everywhere — when it drafts your course, writes
            practice questions, and tutors your students.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide ${
            configured
              ? "bg-[var(--growth-green-tint)] text-[var(--growth-green-text)]"
              : "bg-[color:var(--app-surface-2)] text-app-muted"
          }`}
        >
          {configured ? "Your voice is on" : "Default voice"}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn-secondary mt-3 min-h-12 px-4 text-sm"
      >
        {open ? "Hide" : configured ? "Edit your teaching style" : "Set up your teaching style"}
      </button>

      {open && (
        <div className="mt-4">
          <ChipGroup<TeacherTone>
            legend="Tone"
            value={draft.tone}
            onChange={(v) => set("tone", v)}
            options={[
              { value: "neutral", label: "Neutral" },
              { value: "warm", label: "Warm & encouraging" },
              { value: "rigorous", label: "Rigorous" },
              { value: "playful", label: "Playful" },
            ]}
          />

          <ChipGroup<TeachingApproach>
            legend="How you explain"
            value={draft.approach}
            onChange={(v) => set("approach", v)}
            options={[
              { value: "balanced", label: "Balanced" },
              { value: "intuition_first", label: "Intuition first" },
              { value: "formal_first", label: "Definition first" },
              { value: "socratic", label: "Socratic" },
              { value: "example_driven", label: "Example-driven" },
            ]}
          />

          <ChipGroup<ReadingLevel>
            legend="Reading level"
            value={draft.readingLevel}
            onChange={(v) => set("readingLevel", v)}
            options={[
              { value: "simple", label: "Simple" },
              { value: "standard", label: "Standard" },
              { value: "advanced", label: "Advanced" },
            ]}
          />

          <ChipGroup<Encouragement>
            legend="Encouragement"
            value={draft.encouragement}
            onChange={(v) => set("encouragement", v)}
            options={[
              { value: "minimal", label: "Minimal" },
              { value: "some", label: "Some" },
              { value: "high", label: "Lots" },
            ]}
          />

          <fieldset className="mt-4">
            <legend className="text-sm font-bold">Extras</legend>
            <div className="mt-2 space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={draft.useAnalogies}
                  onChange={(e) => set("useAnalogies", e.target.checked)}
                />
                Use everyday analogies and mental pictures
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={draft.realWorldExamples}
                  onChange={(e) => set("realWorldExamples", e.target.checked)}
                />
                Bring in real-world examples
              </label>
            </div>
          </fieldset>

          <div className="mt-4">
            <label htmlFor="style-voice" className="block text-sm font-bold">
              In your own words <span className="font-normal text-app-muted">(optional)</span>
            </label>
            <p className="text-xs text-app-muted">
              How should the AI sound? e.g. “Talk like a patient TA. Always connect ideas back to a real example
              before the theory.”
            </p>
            <textarea
              id="style-voice"
              rows={3}
              maxLength={VOICE_MAX}
              value={draft.voice}
              onChange={(e) => set("voice", e.target.value)}
              className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm"
              placeholder="Describe your teaching voice…"
            />
            <p className="mt-0.5 text-right text-xs text-app-muted">
              {draft.voice.length}/{VOICE_MAX}
            </p>
          </div>

          <div className="mt-2">
            <label htmlFor="style-avoid" className="block text-sm font-bold">
              Things to avoid <span className="font-normal text-app-muted">(optional)</span>
            </label>
            <textarea
              id="style-avoid"
              rows={2}
              maxLength={AVOID_MAX}
              value={draft.avoid}
              onChange={(e) => set("avoid", e.target.value)}
              className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm"
              placeholder="e.g. Never just give the answer — nudge first. Don't use sports metaphors."
            />
            <p className="mt-0.5 text-right text-xs text-app-muted">
              {draft.avoid.length}/{AVOID_MAX}
            </p>
          </div>

          {/* Live preview: exactly what the AI is told, so nothing is hidden. */}
          <div className="mt-4">
            <h3 className="text-sm font-bold">What the AI will be told</h3>
            {preview ? (
              <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-xs text-app">
                {preview}
              </pre>
            ) : (
              <p className="mt-1 rounded-xl border border-[color:var(--app-border)] p-3 text-xs text-app-muted">
                Using Ecolingo&apos;s default voice — pick options above to make the AI sound like you.
              </p>
            )}
            <p className="mt-1 text-xs text-app-muted">
              Your style guides voice and structure only — the AI still teaches strictly from your materials and
              never invents facts, numbers, or citations.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty}
              className="btn-primary min-h-12 px-5 text-sm text-white disabled:opacity-50"
            >
              {dirty ? "Save teaching style" : justSaved ? "Saved ✓" : "Saved"}
            </button>
            <button type="button" onClick={onReset} className="btn-secondary min-h-12 px-4 text-sm">
              Reset to default
            </button>
            {justSaved && !dirty && (
              <span className="text-sm text-[var(--growth-green-text)]" role="status">
                Saved — the AI will teach in your voice.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
