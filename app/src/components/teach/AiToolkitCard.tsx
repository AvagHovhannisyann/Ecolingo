"use client";

/**
 * AI Teacher Toolkit (D-030). Renders the capability registry (ai-tools.ts):
 * LIVE tools act, PLANNED tools are shown honestly as on-the-way. The grounded
 * generators (study guide / worked examples / key points) run the teacher's
 * uploaded material through /api/teach-generate and hand the result to
 * /teach/print. Everything stays grounded in the teacher's own material and
 * carries their teaching style (D-029).
 *
 * Implementation only; existing design tokens (project rule: Fabel owns aesthetic).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AI_TOOLS, type AiTool } from "@/lib/engine/ai-tools";
import { generateHandout } from "@/lib/ai/teach-generate";
import { useTeacherState } from "@/lib/teacher-store";
import { useTeachingStyle } from "@/lib/teaching-style-store";
import { savePrintable } from "@/lib/teach/printable-store";

const MODE_TITLE: Record<string, string> = {
  study_guide: "Study guide",
  worked_examples: "Worked examples",
  key_points: "Key points",
};

export function AiToolkitCard() {
  const teacher = useTeacherState();
  const style = useTeachingStyle();
  const router = useRouter();
  const [busyMode, setBusyMode] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const docs = teacher?.docs ?? [];
  const hasMaterial = docs.some((d) => d.sections.length > 0);

  const runGenerate = async (mode: string) => {
    setNote(null);
    if (!hasMaterial) {
      setNote("Add some course material first (Step 1) — the AI builds these from your uploads.");
      return;
    }
    setBusyMode(mode);
    const sections = docs.flatMap((d) => d.sections.map((s) => ({ heading: s.heading, text: s.text })));
    const outcome = await generateHandout(mode, sections, style);
    setBusyMode(null);
    if (!outcome.ok) {
      setNote(
        outcome.reason === "no_provider"
          ? "Live AI isn't configured on the server yet, so this can't generate. Your material is safe."
          : "The AI couldn't produce that just now — try again in a moment.",
      );
      return;
    }
    const sourceTitle = docs.length === 1 ? docs[0].title : `${docs.length} documents`;
    savePrintable({
      kind: "handout",
      title: MODE_TITLE[mode] ?? "Handout",
      mode,
      sourceTitle,
      model: outcome.model,
      generatedAtISO: new Date().toISOString(),
      sections: outcome.sections,
    });
    router.push("/teach/print");
  };

  const onActivate = (tool: AiTool) => {
    if (tool.action.kind === "route") router.push(tool.action.href);
    else if (tool.action.kind === "generate") void runGenerate(tool.action.mode);
  };

  return (
    <section className="card mt-4 p-4" aria-labelledby="ai-toolkit-heading">
      <h2 id="ai-toolkit-heading" className="font-bold">
        <span aria-hidden>🧰</span> AI toolkit
      </h2>
      <p className="mt-1 text-sm text-app-muted">
        Your AI does far more than multiple-choice. Tools marked{" "}
        <span className="font-semibold text-app">grounded</span> work only from your material (never inventing
        facts, numbers, or citations); <span className="font-semibold text-app">generative</span> tools create new
        illustrative media and are labelled as such.
      </p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {AI_TOOLS.map((tool) => {
          const live = tool.status === "live";
          const busy = busyMode !== null && tool.action.kind === "generate" && tool.action.mode === busyMode;
          const disabled = !live || busyMode !== null;
          const inner = (
            <div className="flex h-full items-start gap-3">
              <span aria-hidden className="text-2xl leading-none">
                {tool.glyph}
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {tool.label}
                  {!live && (
                    <span className="rounded-full bg-[color:var(--app-surface-2)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-app-muted">
                      Soon
                    </span>
                  )}
                  {live && !tool.grounded && (
                    <span className="rounded-full bg-[color:rgba(177,140,255,0.16)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--lavender-text)]">
                      Generative
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-app-muted">{busy ? "Generating…" : tool.description}</p>
              </div>
            </div>
          );

          const cls =
            "nav-pop rounded-2xl border-2 p-3 text-left transition " +
            (live
              ? "border-[color:var(--app-border)] hover:border-[var(--lavender)] hover:bg-[color:rgba(177,140,255,0.08)]"
              : "border-dashed border-[color:var(--app-border)] opacity-70");

          // A route tool is a real link (accessible + right-click friendly);
          // generate/planned tools are buttons.
          return (
            <li key={tool.id}>
              {live && tool.action.kind === "route" ? (
                <Link href={tool.action.href} className={cls + " block h-full"}>
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  aria-disabled={disabled}
                  onClick={() => onActivate(tool)}
                  className={cls + " block h-full w-full disabled:cursor-default"}
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {note && (
        <p className="mt-3 rounded-xl bg-[var(--coral-tint)] p-3 text-sm text-[var(--deep-ink)]" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
