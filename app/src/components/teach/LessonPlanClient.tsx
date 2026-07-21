"use client";

/**
 * Lesson pacing plan (D-036). Packs the ratified plan's lessons (in unit order)
 * into class sessions of a chosen length, using each lesson's own time
 * estimate. Deterministic; prints clean via the shared @media print rules.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildPacingPlan, buildPacingPlanByClasses } from "@/lib/engine/pacing";
import { loadCompiledPlan } from "@/components/teach-compile/plan-store";

type PacingMode = "minutes" | "classes";

export function LessonPlanClient() {
  const draft = useMemo(() => loadCompiledPlan()?.draft ?? null, []);
  const [mode, setMode] = useState<PacingMode>("minutes");
  const [minutes, setMinutes] = useState(50);
  const [numClasses, setNumClasses] = useState(8);
  const plan = useMemo(
    () =>
      draft
        ? mode === "minutes"
          ? buildPacingPlan(draft, minutes)
          : buildPacingPlanByClasses(draft, numClasses)
        : null,
    [draft, mode, minutes, numClasses],
  );

  if (!draft) {
    return (
      <div>
        <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
          ← Back to teacher workspace
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Lesson pacing plan</h1>
        <div className="card mt-4 p-4">
          <p className="text-sm font-bold">No compiled course yet.</p>
          <p className="mt-1 text-sm text-app-muted">Compile a course first, then this schedules it across your classes.</p>
          <Link href="/teach/compile" className="btn-primary mt-3 inline-block min-h-12 px-5 py-3 text-white">
            Go to the course compiler
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="print-page">
      <div className="flex flex-wrap items-center justify-between gap-2" data-print-hide>
        <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
          ← Back to teacher workspace
        </Link>
        <button type="button" onClick={() => window.print()} className="btn-secondary min-h-12 px-4 py-2 text-sm">
          Print
        </button>
      </div>

      <h1 className="mt-2 text-2xl font-bold">Lesson pacing plan</h1>
      <p className="mt-1 text-sm text-app">
        Your lessons packed into classes in teaching order, using each lesson&apos;s time estimate. Choose how to
        pace it.
      </p>

      <div className="mt-3 space-y-3" data-print-hide>
        <div className="flex flex-wrap gap-2" role="group" aria-label="How to pace">
          {(
            [
              ["minutes", "By minutes per class"],
              ["classes", "By number of classes"],
            ] as [PacingMode, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={mode === v}
              onClick={() => setMode(v)}
              className={`min-h-11 rounded-xl border-2 px-3 text-sm font-bold ${
                mode === v
                  ? "border-[var(--model-blue)] bg-[var(--model-blue-tint)] text-[var(--model-blue-text)]"
                  : "border-[color:var(--app-border)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {mode === "minutes" ? (
            <label htmlFor="mpc" className="text-sm font-bold">
              Minutes per class{" "}
              <input
                id="mpc"
                type="number"
                min={10}
                max={240}
                value={minutes}
                onChange={(e) => setMinutes(Math.max(10, Math.min(240, Number(e.target.value) || 50)))}
                className="ml-1 w-24 rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-2 text-sm font-normal"
              />
            </label>
          ) : (
            <label htmlFor="npc" className="text-sm font-bold">
              Number of classes{" "}
              <input
                id="npc"
                type="number"
                min={1}
                max={200}
                value={numClasses}
                onChange={(e) => setNumClasses(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="ml-1 w-24 rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-2 text-sm font-normal"
              />
            </label>
          )}
          {plan && (
            <span className="text-sm text-app-muted">
              → {plan.classes.length} class{plan.classes.length === 1 ? "" : "es"} · {plan.totalMinutes} min total ·
              ~{plan.minutesPerClass} min/class avg
            </span>
          )}
        </div>
        {mode === "classes" && plan && draft && plan.classes.length < numClasses && (
          <p className="text-xs text-app-muted" role="status">
            You asked for {numClasses} classes but the course only has {plan.classes.length} lesson
            {plan.classes.length === 1 ? "" : "s"} — every class needs at least one, so it&apos;s spread across{" "}
            {plan.classes.length}.
          </p>
        )}
      </div>

      <ol className="mt-4 space-y-3">
        {plan?.classes.map((c) => (
          <li key={c.index} className="card break-inside-avoid p-4">
            <p className="font-bold">
              Class {c.index}{" "}
              <span className="text-sm font-normal text-app-muted">· {c.totalMinutes} min</span>
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {c.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    <span className="text-app-muted">{it.unitTitle}:</span> {it.lessonTitle}
                    {it.overLength && (
                      <span className="ml-2 rounded-full bg-[color:var(--coral-tint)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--deep-ink)]">
                        longer than one class
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-app-muted">{it.minutes} min</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
