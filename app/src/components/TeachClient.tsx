"use client";

/**
 * Teacher ingestion & review queue (Phase 2, docs/06 roadmap).
 * The honesty contract (GATE-001) is visible in the UI itself: proposals show
 * the exact matched terms and a source preview, and nothing becomes a learner-
 * facing citation until the teacher presses Approve. Deterministic matching —
 * the AI extraction agents of docs/04 layer on top later, behind this same
 * approval gate.
 */

import Image from "next/image";
import { useRef, useState } from "react";
import { concepts } from "@/content/econ13210";
import { SAMPLE_LECTURE_MD, SAMPLE_LECTURE_TITLE } from "@/content/econ13210/sample-lecture";
import { proposeLinks, sectionize, type ProposedLink, type TeacherDoc } from "@/lib/engine/ingest";
import { extractPdfText } from "@/lib/pdf-text";
import { linkKey } from "@/lib/teacher-state";
import { addDoc, approveLink, rejectLink, removeDoc } from "@/lib/teacher-state";
import { mutateTeacherState, useTeacherState } from "@/lib/teacher-store";

function ProposalCard({
  doc,
  link,
  onApprove,
  onReject,
}: {
  doc: TeacherDoc;
  link: ProposedLink;
  onApprove: () => void;
  onReject: () => void;
}) {
  const concept = concepts.find((c) => c.slug === link.conceptSlug);
  const section = doc.sections.find((s) => s.id === link.sectionId);
  if (!concept || !section) return null;
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">
          {concept.name} <span aria-hidden>→</span>{" "}
          <span className="text-[var(--model-blue-deep)]">§ {section.heading}</span>
        </p>
        <span className="stat-chip text-xs" title="Fraction of the concept's key terms found in this section">
          match {Math.round(link.score * 100)}%
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">
        Matched terms: {link.matchedTerms.map((t) => (
          <code key={t} className="mr-1 rounded bg-[var(--mist-gray)] px-1">
            {t}
          </code>
        ))}
        · est. p. {section.pageStart}
        {section.pageEnd !== section.pageStart ? `–${section.pageEnd}` : ""}
      </p>
      <blockquote className="mt-2 border-l-4 border-[var(--mist-gray-deep)] pl-3 text-sm text-gray-700">
        {section.text.slice(0, 240)}
        {section.text.length > 240 ? "…" : ""}
      </blockquote>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onApprove} className="btn-primary min-h-12 px-5 text-white">
          Approve as source
        </button>
        <button type="button" onClick={onReject} className="btn-secondary min-h-12 px-4 text-sm">
          Not a match
        </button>
      </div>
    </li>
  );
}

export function TeachClient() {
  const teacher = useTeacherState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!teacher) return <p className="p-4 text-sm text-gray-500">Loading teacher workspace…</p>;

  const ingest = (title: string, raw: string) => {
    setUploadError(null);
    const doc = sectionize(title.trim() || "Untitled upload", raw, new Date().toISOString());
    if (doc.sections.length === 0) {
      setUploadError("That file looks empty — nothing to sectionize.");
      return;
    }
    mutateTeacherState((s) => addDoc(s, doc));
  };

  const onFile = async (file: File) => {
    setUploadError(null);
    const baseTitle = file.name.replace(/\.(md|txt|markdown|pdf)$/i, "");
    if (/\.pdf$/i.test(file.name)) {
      setBusy("Reading PDF…");
      try {
        const text = await extractPdfText(file);
        if (!text.trim()) {
          setUploadError("No selectable text found in that PDF — it may be a scan. Try an OCR'd file or paste the text.");
          return;
        }
        ingest(baseTitle, text);
      } catch {
        setUploadError("Couldn't read that PDF. Try re-exporting it, or paste the text instead.");
      } finally {
        setBusy(null);
      }
      return;
    }
    if (!/\.(md|txt|markdown)$/i.test(file.name)) {
      setUploadError("Uploads are .pdf, .md, or .txt. For a scanned PDF, paste the text instead.");
      return;
    }
    ingest(baseTitle, await file.text());
  };

  const pendingByDoc = teacher.docs.map((doc) => {
    const approvedKeys = new Set(teacher.approvedLinks.map((l) => linkKey(l)));
    const proposals = proposeLinks(doc, concepts).filter((p) => {
      const key = linkKey(p, doc.id);
      return !approvedKeys.has(key) && !teacher.rejectedKeys.includes(key);
    });
    return { doc, proposals };
  });
  const pendingCount = pendingByDoc.reduce((n, d) => n + d.proposals.length, 0);
  const groundedSlugs = [...new Set(teacher.approvedLinks.map((l) => l.conceptSlug))];

  return (
    <div>
      {/* Higgsfield teacher-desk art (approved decorative slot §17.2) */}
      <div className="relative mb-4 overflow-hidden rounded-2xl border border-gray-200">
        <Image
          src="/art/teach-header.webp"
          alt=""
          role="presentation"
          width={1344}
          height={768}
          priority
          className="art-enter h-32 w-full object-cover sm:h-40"
        />
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 to-transparent p-4 text-white">
          <h1 className="text-xl font-semibold">Teacher workspace</h1>
          <p className="text-sm opacity-90">Your materials in, a grounded course out.</p>
        </div>
      </div>

      <p className="text-sm text-gray-700">
        Upload lecture notes or a syllabus. Ecolingo splits it into sections, then <em>proposes</em> which
        section grounds which concept — with the matched terms shown. Nothing is cited to students until{" "}
        <strong>you approve it</strong>; unmatched concepts stay honestly marked as unverified.
      </p>

      {/* upload */}
      <div className="card mt-4 p-4">
        <h2 className="font-bold">Add course material</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.md,.txt,.markdown"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="btn-primary min-h-12 px-5 text-white disabled:opacity-50"
          >
            {busy ?? "Upload PDF / .md / .txt"}
          </button>
          <button
            type="button"
            onClick={() => ingest(SAMPLE_LECTURE_TITLE, SAMPLE_LECTURE_MD)}
            className="btn-secondary min-h-12 px-4 text-sm"
          >
            Try the sample lecture
          </button>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">Or paste text</summary>
          <input
            type="text"
            placeholder="Title, e.g. Lecture 4 — Solow"
            className="mt-2 block w-full rounded-xl border border-gray-400 p-3 text-sm"
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
          />
          <textarea
            placeholder="Paste lecture notes here…"
            className="mt-2 block h-40 w-full rounded-xl border border-gray-400 p-3 text-sm"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
          <button
            type="button"
            disabled={!pasted.trim()}
            onClick={() => {
              ingest(pasteTitle || "Pasted notes", pasted);
              setPasted("");
              setPasteTitle("");
            }}
            className="mt-2 btn-secondary min-h-12 px-4 text-sm disabled:opacity-40"
          >
            Ingest pasted text
          </button>
        </details>
        {uploadError && (
          <p className="mt-2 rounded-xl bg-[var(--coral-tint)] p-3 text-sm text-[var(--deep-ink)]" role="alert">
            {uploadError}
          </p>
        )}
      </div>

      {/* documents */}
      {teacher.docs.length > 0 && (
        <div className="mt-5">
          <h2 className="font-bold">Uploaded materials</h2>
          <ul className="mt-2 space-y-2">
            {teacher.docs.map((doc) => (
              <li key={doc.id} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  📄 <strong>{doc.title}</strong> — {doc.sections.length} sections, ~
                  {Math.max(1, Math.round(doc.charCount / 2800))} pages
                </span>
                <button
                  type="button"
                  onClick={() => mutateTeacherState((s) => removeDoc(s, doc.id))}
                  className="btn-danger min-h-12 px-4 text-sm text-white"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* review queue */}
      <div className="mt-5">
        <h2 className="font-bold">
          Review queue{" "}
          <span className="stat-chip ml-1 align-middle text-xs">{pendingCount} pending</span>
        </h2>
        {teacher.docs.length === 0 && (
          <p className="mt-2 text-sm text-gray-600">Upload a document to see proposed concept links here.</p>
        )}
        {teacher.docs.length > 0 && pendingCount === 0 && (
          <p className="mt-2 rounded-xl bg-[var(--growth-green-tint)] p-3 text-sm" role="status">
            Queue clear — every proposal has been reviewed.
          </p>
        )}
        {pendingByDoc.map(({ doc, proposals }) =>
          proposals.length > 0 ? (
            <ul key={doc.id} className="mt-3 space-y-3">
              {proposals.map((p) => (
                <ProposalCard
                  key={linkKey(p, doc.id)}
                  doc={doc}
                  link={p}
                  onApprove={() =>
                    mutateTeacherState((s) => approveLink(s, doc.id, p, new Date().toISOString()))
                  }
                  onReject={() => mutateTeacherState((s) => rejectLink(s, doc.id, p))}
                />
              ))}
            </ul>
          ) : null
        )}
      </div>

      {/* grounding status */}
      <div className="mt-5">
        <h2 className="font-bold">Grounding status</h2>
        <ul className="mt-2 space-y-2">
          {concepts.map((c) => {
            const grounded = groundedSlugs.includes(c.slug);
            const links = teacher.approvedLinks.filter((l) => l.conceptSlug === c.slug);
            return (
              <li key={c.slug} className="card flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  {grounded ? "✅" : "⚠️"} <strong>{c.name}</strong>
                  {grounded && (
                    <span className="block text-xs text-gray-600">
                      {links.length} approved source{links.length === 1 ? "" : "s"} — students now see real
                      citations
                    </span>
                  )}
                  {!grounded && (
                    <span className="block text-xs text-gray-600">still planned &amp; unverified</span>
                  )}
                </span>
                {grounded && (
                  <button
                    type="button"
                    onClick={() =>
                      mutateTeacherState((s) =>
                        links.reduce((acc, l) => rejectLink(acc, l.docId, l), s)
                      )
                    }
                    className="btn-secondary min-h-12 px-4 text-xs"
                  >
                    Revoke
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
