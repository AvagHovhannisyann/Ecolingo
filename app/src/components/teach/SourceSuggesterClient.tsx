"use client";

/**
 * Source suggester (D-036). For each concept in the ratified plan, shows the
 * uploaded section that best grounds it (deterministic term overlap — the exact
 * matched words are shown, nothing AI-invented). Prints clean via the shared
 * @media print rules.
 */

import Link from "next/link";
import { useMemo } from "react";
import { bestSourcesForConcepts } from "@/lib/engine/source-match";
import { loadCompiledPlan } from "@/components/teach-compile/plan-store";
import { useTeacherState } from "@/lib/teacher-store";
import { LoadingScreen } from "../LoadingScreen";

export function SourceSuggesterClient() {
  const teacher = useTeacherState();
  const concepts = useMemo(() => loadCompiledPlan()?.draft.concepts ?? [], []);
  const results = useMemo(
    () => (teacher ? bestSourcesForConcepts(teacher.docs, concepts) : []),
    [teacher, concepts],
  );

  if (!teacher) return <LoadingScreen label="Matching your sources…" />;

  const grounded = results.filter((r) => r.matches.length > 0).length;

  return (
    <div className="print-page">
      <div className="flex flex-wrap items-center justify-between gap-2" data-print-hide>
        <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
          ← Back to teacher workspace
        </Link>
        {results.length > 0 && (
          <button type="button" onClick={() => window.print()} className="btn-secondary min-h-12 px-4 py-2 text-sm">
            Print
          </button>
        )}
      </div>

      <h1 className="mt-2 text-2xl font-bold">Source suggester</h1>
      <p className="mt-1 text-sm text-app">
        Each concept in your course, matched to the section of your material that best grounds it — with the exact
        words that matched. Nothing is AI-invented.
      </p>

      {concepts.length === 0 ? (
        <div className="card mt-4 p-4">
          <p className="text-sm font-bold">No compiled course yet.</p>
          <p className="mt-1 text-sm text-app-muted">Compile a course first, then this matches its concepts to your uploads.</p>
          <Link href="/teach/compile" className="btn-primary mt-3 inline-block min-h-12 px-5 py-3 text-white">
            Go to the course compiler
          </Link>
        </div>
      ) : teacher.docs.length === 0 ? (
        <div className="card mt-4 p-4">
          <p className="text-sm font-bold">No uploaded material yet.</p>
          <p className="mt-1 text-sm text-app-muted">Upload notes on the workspace, then reopen this to match sources.</p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-app-muted">
            <span className="stat-chip">{grounded}</span> of {results.length} concepts have a matching source.
          </p>
          <ul className="mt-3 space-y-3">
            {results.map((r) => (
              <li key={r.conceptSlug} className="card p-4">
                <p className="font-bold">
                  {r.matches.length > 0 ? "✅" : "⚠️"} {r.conceptName}
                </p>
                {r.matches.length === 0 ? (
                  <p className="mt-1 text-sm text-app-muted">No section strongly matches — this concept isn&apos;t grounded yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {r.matches.map((m, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-medium text-[var(--model-blue-text)]">
                          {m.docTitle} § {m.sectionHeading}
                        </span>{" "}
                        <span className="stat-chip text-xs">match {Math.round(m.score * 100)}%</span>
                        <span className="mt-1 block text-xs text-app-muted">
                          matched:{" "}
                          {m.matchedTerms.slice(0, 8).map((t) => (
                            <code key={t} className="mr-1 rounded bg-[var(--mist-gray)] px-1 text-[var(--deep-ink)]">
                              {t}
                            </code>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
