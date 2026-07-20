"use client";

/**
 * Renders a PrintableDoc (D-030) — an exam or a generated handout — in a
 * paper-friendly layout. Screen shows a "Print / Save as PDF" toolbar (marked
 * data-print-hide so it never appears on paper); print drops the app chrome via
 * the @media print rules in globals.css. Reads the doc from the printable store
 * on mount; an empty store shows an honest "nothing to print yet" state.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadPrintable, type PrintableDoc } from "@/lib/teach/printable-store";
import type { Question } from "@/lib/engine/types";

function QuestionBlock({ number, points, question }: { number: number; points: number; question: Question }) {
  return (
    <li className="mb-5 break-inside-avoid">
      <p className="font-semibold">
        {number}. {question.stem}{" "}
        <span className="font-normal text-app-muted">({points} pt{points === 1 ? "" : "s"})</span>
      </p>
      {(question.type === "mc_single" || question.type === "mc_multi") && (
        <ol className="mt-1 list-[upper-alpha] pl-6">
          {question.options.map((o) => (
            <li key={o.id} className="mt-0.5">
              {o.text}
            </li>
          ))}
        </ol>
      )}
      {question.type === "cloze" && <p className="mt-1 italic">{question.template.replace(/\{\{(\w+)\}\}/g, "______")}</p>}
      {question.type === "causal_order" && (
        <ul className="mt-1 list-disc pl-6">
          {question.items.map((it) => (
            <li key={it.id}>{it.text}</li>
          ))}
        </ul>
      )}
      {question.type === "match_pairs" && (
        <div className="mt-1 grid grid-cols-2 gap-x-6">
          <ol className="list-[decimal] pl-5">
            {question.pairs.map((p) => (
              <li key={`l-${p.id}`}>{p.left}</li>
            ))}
          </ol>
          <ol className="list-[upper-alpha] pl-5">
            {[...question.pairs].map((p) => (
              <li key={`r-${p.id}`}>{p.right}</li>
            ))}
          </ol>
        </div>
      )}
      {question.type === "numeric" && (
        <p className="mt-2 text-app-muted">Answer: __________ {question.unitLabel ?? ""}</p>
      )}
    </li>
  );
}

export function PrintableView() {
  const [doc, setDoc] = useState<PrintableDoc | null | "empty">(null);

  useEffect(() => {
    // Read localStorage off the effect's synchronous path: keeps the store read
    // client-only (no hydration mismatch on this statically-prerendered page)
    // and avoids a synchronous setState-in-effect cascade.
    let alive = true;
    queueMicrotask(() => {
      if (alive) setDoc(loadPrintable() ?? "empty");
    });
    return () => {
      alive = false;
    };
  }, []);

  if (doc === null) return null;

  if (doc === "empty") {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <h1 className="text-xl font-extrabold">Nothing to print yet</h1>
        <p className="mt-2 text-sm text-app-muted">
          Build an exam or generate a handout from your workspace, then it&apos;ll appear here ready to print.
        </p>
        <Link href="/teach" className="btn-primary mt-5 inline-block min-h-12 px-6 py-3 text-white">
          Back to workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="print-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2" data-print-hide>
        <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
          ← Back to workspace
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-primary min-h-12 px-5 py-3 text-white"
        >
          Print / Save as PDF
        </button>
      </div>

      {doc.kind === "exam" ? (
        <article>
          <header className="border-b-2 border-black pb-2">
            <h1 className="text-2xl font-bold">{doc.exam.title}</h1>
            <div className="mt-2 flex flex-wrap justify-between gap-4 text-sm">
              <span>Name: ______________________________</span>
              <span>Date: ____________</span>
              <span>
                Total: {doc.exam.totalPoints} pt{doc.exam.totalPoints === 1 ? "" : "s"}
              </span>
            </div>
            {doc.exam.instructions && <p className="mt-2 text-sm italic">{doc.exam.instructions}</p>}
          </header>
          <ol className="mt-5 list-none">
            {doc.exam.items.map((it) => (
              <QuestionBlock key={it.number} number={it.number} points={it.points} question={it.question} />
            ))}
          </ol>

          {doc.exam.answerKey.length > 0 && (
            <section className="print-break mt-10">
              <h2 className="border-b-2 border-black pb-1 text-xl font-bold">Answer key — {doc.exam.title}</h2>
              <ol className="mt-3 space-y-1">
                {doc.exam.answerKey.map((a) => (
                  <li key={a.number} className="text-sm">
                    <span className="font-semibold">{a.number}.</span> {a.answer}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </article>
      ) : (
        <article>
          <header className="border-b-2 border-black pb-2">
            <h1 className="text-2xl font-bold">{doc.title}</h1>
            {doc.sourceTitle && <p className="mt-1 text-sm italic">From: {doc.sourceTitle}</p>}
          </header>
          <div className="mt-5 space-y-4">
            {doc.sections.map((s, i) => (
              <section key={i} className="break-inside-avoid">
                <h2 className="text-lg font-bold">{s.heading}</h2>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{s.body}</p>
              </section>
            ))}
          </div>
          <p className="mt-8 text-xs text-app-muted" data-print-hide>
            Grounded in your material{doc.model ? ` · drafted by ${doc.model}` : ""}. Review before sharing —
            you&apos;re the author.
          </p>
        </article>
      )}
    </div>
  );
}
