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
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { concepts } from "@/content/econ13210";
import {
  createCourse,
  ensureMyCourse,
  listMyCourses,
  renameCourse,
  type OwnedCourse,
} from "@/lib/course";
import { SAMPLE_LECTURE_MD, SAMPLE_LECTURE_TITLE } from "@/content/econ13210/sample-lecture";
import { proposeLinks, sectionize, type ProposedLink, type TeacherDoc } from "@/lib/engine/ingest";
import { toAuthoredQuestion, type DraftQuestion } from "@/lib/engine/authored";
import { extractPdfText } from "@/lib/pdf-text";
import { suggestLinksForDoc } from "@/lib/ai/suggest-links";
import { draftQuestionsForConcept } from "@/lib/ai/draft-questions";
import { linkKey, type TeacherState } from "@/lib/teacher-state";
import { addAuthoredQuestion, addDoc, approveLink, rejectLink, removeAuthoredQuestion, removeDoc } from "@/lib/teacher-state";
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
  const isAi = link.origin === "ai";
  return (
    <li className={`card p-4 ${isAi ? "border-[var(--lavender)]" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">
          {concept.name} <span aria-hidden>→</span>{" "}
          <span className="text-[var(--model-blue-text)]">§ {section.heading}</span>
        </p>
        {isAi ? (
          <span
            className="rounded-full bg-[color:rgba(177,140,255,0.16)] px-2 py-0.5 text-[11px] font-semibold text-[var(--lavender-text)]"
            title="Suggested by the AI curriculum assistant — approve to make it a real source"
          >
            ✦ AI-suggested
          </span>
        ) : (
          <span className="stat-chip text-xs" title="Fraction of the concept's key terms found in this section">
            match {Math.round(link.score * 100)}%
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-app-muted">
        {isAi ? (
          <>Why: {link.reason || "the section explains this concept"}</>
        ) : (
          <>
            Matched terms: {link.matchedTerms.map((t) => (
              <code key={t} className="mr-1 rounded bg-[var(--mist-gray)] px-1">
                {t}
              </code>
            ))}
          </>
        )}
        {" · "}est. p. {section.pageStart}
        {section.pageEnd !== section.pageStart ? `–${section.pageEnd}` : ""}
      </p>
      <blockquote className="mt-2 border-l-4 border-[var(--mist-gray-deep)] pl-3 text-sm text-app">
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

const DEFAULT_COURSE_TITLE = "ECON 13210 — Intro to Macroeconomic Models";

/** "N students enrolled", pluralized. */
function enrolledLabel(n: number): string {
  return `${n} student${n === 1 ? "" : "s"} enrolled`;
}

/**
 * One course/section card: title (inline-editable via renameCourse), join code
 * and live roster count, and a link into per-section analytics. Because a
 * teacher's grounding and question bank are owner-scoped (not course-scoped),
 * every section here already shares the same approved sources — a reusable
 * course template (IDEA-205).
 */
function SectionCard({
  course,
  onRenamed,
}: {
  course: OwnedCourse;
  onRenamed: (id: string, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(course.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const title = draft.trim();
    if (!title || title === course.title) {
      setEditing(false);
      setDraft(course.title);
      return;
    }
    setSaving(true);
    setError(null);
    const ok = await renameCourse(course.id, title);
    setSaving(false);
    if (!ok) {
      setError("Couldn't rename just now — try again when you're online.");
      return;
    }
    onRenamed(course.id, title);
    setEditing(false);
  };

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {editing ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              type="text"
              aria-label="Section title"
              className="min-w-0 flex-1 rounded-xl border border-[color:var(--app-border)] p-2 text-sm"
              value={draft}
              disabled={saving}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                if (e.key === "Escape") {
                  setEditing(false);
                  setDraft(course.title);
                }
              }}
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="btn-primary min-h-12 px-4 text-sm text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(course.title);
                setError(null);
              }}
              disabled={saving}
              className="btn-secondary min-h-12 px-4 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <h3 className="font-bold">{course.title}</h3>
            <button
              type="button"
              onClick={() => {
                setDraft(course.title);
                setEditing(true);
              }}
              className="btn-secondary min-h-12 px-4 text-sm"
              aria-label={`Rename ${course.title}`}
            >
              Rename
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="mt-2 rounded-xl bg-[var(--coral-tint)] p-2 text-xs text-[var(--deep-ink)]" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="rounded-xl bg-[var(--growth-green-tint)] px-4 py-3">
          <p className="text-xs text-app-muted">Join code — learners enter this to enroll</p>
          <p className="font-mono text-2xl font-bold tracking-[0.3em] text-[var(--growth-green-text)]">
            {course.joinCode}
          </p>
        </div>
        <p className="text-sm text-app">{enrolledLabel(course.studentCount)}</p>
      </div>
      <Link
        href={`/teach/analytics?course=${course.id}`}
        className="mt-3 inline-flex items-center gap-1 text-sm text-[var(--model-blue-text)] underline"
      >
        View analytics for this section <span aria-hidden>→</span>
      </Link>
    </li>
  );
}

/**
 * "Your sections" — every course the teacher owns, each an independent section
 * (own join code + roster) that reuses the same grounded sources and question
 * bank. Zero-state lazily creates the teacher's first course (unchanged D-012
 * UX). A "+ New section" inline form creates additional sections (IDEA-205).
 * Degrades quietly when Supabase is unconfigured or unreachable: no crash, no
 * infinite spinner — just an honest "needs the cloud connection".
 */
function ClassSections() {
  const [phase, setPhase] = useState<"loading" | "unavailable" | "ready">("loading");
  const [courses, setCourses] = useState<OwnedCourse[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await listMyCourses();
    if (list.length > 0) {
      setCourses(list);
      setPhase("ready");
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const list = await listMyCourses();
      if (!alive) return;
      if (list.length > 0) {
        setCourses(list);
        setPhase("ready");
        return;
      }
      // zero-state: lazily create the teacher's first course (unchanged UX).
      // A null here means Supabase is unconfigured/unreachable (GATE-009).
      const first = await ensureMyCourse(DEFAULT_COURSE_TITLE);
      if (!alive) return;
      if (!first) {
        setPhase("unavailable");
        return;
      }
      setCourses([{ ...first, studentCount: 0 }]);
      setPhase("ready");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onRenamed = useCallback((id: string, title: string) => {
    setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
  }, []);

  const createSection = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    setCreateError(null);
    const created = await createCourse(title);
    setCreating(false);
    if (!created) {
      setCreateError("Couldn't create a section just now — try again when you're online.");
      return;
    }
    setCourses((cs) => [...cs, { ...created, studentCount: 0 }]);
    setNewTitle("");
    setAdding(false);
  };

  if (phase === "loading") {
    return (
      <div className="card mt-4 p-4">
        <h2 className="font-bold">Your sections</h2>
        <p className="mt-1 text-sm text-app-muted" role="status">
          Setting up your sections…
        </p>
      </div>
    );
  }

  if (phase === "unavailable") {
    return (
      <div className="card mt-4 p-4">
        <h2 className="font-bold">Your sections</h2>
        <p className="mt-1 text-sm text-app-muted">
          Class features need the cloud connection — your sections, join codes, and rosters appear here once
          you&apos;re online.
        </p>
      </div>
    );
  }

  return (
    <section className="mt-4" aria-labelledby="sections-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="sections-heading" className="font-bold">
            Your sections
          </h2>
          <p className="text-xs text-app-muted">
            Each section has its own join code and roster, and reuses the same grounded sources and question bank.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          disabled={refreshing}
          className="btn-secondary min-h-12 px-4 text-sm disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <ul className="mt-3 space-y-3">
        {courses.map((c) => (
          <SectionCard key={c.id} course={c} onRenamed={onRenamed} />
        ))}
      </ul>

      <div className="mt-3">
        {adding ? (
          <div className="card p-4">
            <label htmlFor="new-section-title" className="block text-sm font-medium">
              New section title
            </label>
            <input
              id="new-section-title"
              type="text"
              className="mt-2 block w-full rounded-xl border border-[color:var(--app-border)] p-3 text-sm"
              placeholder="e.g. ECON 13210 — Fall 2026, Section B"
              value={newTitle}
              disabled={creating}
              autoFocus
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createSection();
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewTitle("");
                }
              }}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void createSection()}
                disabled={creating || !newTitle.trim()}
                className="btn-primary min-h-12 px-5 text-sm text-white disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create section"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewTitle("");
                  setCreateError(null);
                }}
                disabled={creating}
                className="btn-secondary min-h-12 px-4 text-sm disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            {createError && (
              <p className="mt-2 rounded-xl bg-[var(--coral-tint)] p-2 text-xs text-[var(--deep-ink)]" role="alert">
                {createError}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn-secondary min-h-12 px-4 text-sm"
          >
            + New section
          </button>
        )}
      </div>
    </section>
  );
}

export function TeachClient() {
  const teacher = useTeacherState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // AI-suggested links, keyed by doc id (session-only; approving persists them)
  const [aiByDoc, setAiByDoc] = useState<Record<string, ProposedLink[]>>({});
  const [aiBusyDoc, setAiBusyDoc] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  if (!teacher) return <p className="p-4 text-sm text-app-muted">Loading teacher workspace…</p>;

  const runAiSuggest = async (doc: TeacherDoc) => {
    setAiBusyDoc(doc.id);
    setAiNote(null);
    try {
      const suggestions = await suggestLinksForDoc(doc);
      setAiByDoc((m) => ({ ...m, [doc.id]: suggestions }));
      // count only the ones that add something new to the queue (not already a
      // keyword proposal, not already approved/rejected) so the note is honest
      const keywordKeys = new Set(proposeLinks(doc, concepts).map((p) => linkKey(p, doc.id)));
      const approvedKeys = new Set(teacher.approvedLinks.map((l) => linkKey(l)));
      const fresh = suggestions.filter((p) => {
        const k = linkKey(p, doc.id);
        return !keywordKeys.has(k) && !approvedKeys.has(k) && !teacher.rejectedKeys.includes(k);
      });
      if (suggestions.length === 0) {
        setAiNote("The AI found no additional links beyond the keyword matches.");
      } else if (fresh.length === 0) {
        setAiNote("The AI agreed with the keyword matches — no new links to add.");
      } else {
        setAiNote(`The AI added ${fresh.length} new suggestion${fresh.length === 1 ? "" : "s"} to the queue below.`);
      }
    } catch {
      setAiNote("Couldn't reach the AI assistant just now — the keyword proposals are still here.");
    } finally {
      setAiBusyDoc(null);
    }
  };

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
    const keyword = proposeLinks(doc, concepts);
    const keywordKeys = new Set(keyword.map((p) => linkKey(p, doc.id)));
    // merge AI suggestions, skipping any the keyword matcher already found
    const ai = (aiByDoc[doc.id] ?? []).filter((p) => !keywordKeys.has(linkKey(p, doc.id)));
    const proposals = [...keyword, ...ai].filter((p) => {
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
      <div className="relative mb-4 overflow-hidden rounded-2xl border border-[color:var(--app-border)]">
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

      <p className="text-sm text-app">
        Upload lecture notes or a syllabus. Ecolingo splits it into sections, then <em>proposes</em> which
        section grounds which concept — with the matched terms shown. Nothing is cited to students until{" "}
        <strong>you approve it</strong>; unmatched concepts stay honestly marked as unverified.
      </p>

      {/* your sections: each an independent join code + roster, sharing the same
          grounded sources & question bank (IDEA-205 reusable course template) */}
      <ClassSections />

      {/* class analytics entry point (Phase 5) */}
      <Link
        href="/teach/analytics"
        className="card mt-3 flex items-center justify-between gap-2 p-4 hover:border-[var(--model-blue)]"
      >
        <span>
          <span className="font-bold">Class analytics</span>
          <span className="block text-xs text-app-muted">
            See what your class has mastered and what to reteach next
          </span>
        </span>
        <span aria-hidden className="text-[var(--model-blue-text)]">
          →
        </span>
      </Link>

      {/* AI course compiler entry point (D-020) — AI drafts a whole course plan
          from uploaded material; the teacher reviews and ratifies (GATE-001) */}
      <Link
        href="/teach/compile"
        className="card mt-3 flex items-center justify-between gap-2 p-4 hover:border-[var(--lavender)]"
      >
        <span>
          <span className="font-bold">✦ Compile a course</span>
          <span className="block text-xs text-app-muted">
            Draft units, lessons &amp; prerequisites from your materials — you review and approve before anything
            reaches students
          </span>
        </span>
        <span aria-hidden className="text-[var(--lavender-text)]">
          →
        </span>
      </Link>

      {/* upload */}
      <div className="card mt-4 p-4">
        <h2 className="font-bold">Add course material</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.md,.txt,.markdown"
            aria-label="Upload a course document (PDF, .md, or .txt)"
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
            aria-label="Title for the pasted material"
            placeholder="Title, e.g. Lecture 4 — Solow"
            className="mt-2 block w-full rounded-xl border border-[color:var(--app-border)] p-3 text-sm"
            value={pasteTitle}
            onChange={(e) => setPasteTitle(e.target.value)}
          />
          <textarea
            aria-label="Paste lecture notes"
            placeholder="Paste lecture notes here…"
            className="mt-2 block h-40 w-full rounded-xl border border-[color:var(--app-border)] p-3 text-sm"
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
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={aiBusyDoc !== null}
                    onClick={() => runAiSuggest(doc)}
                    className="btn-secondary min-h-12 px-4 text-sm disabled:opacity-50"
                    title="Ask the AI curriculum assistant for semantic matches the keyword matcher misses"
                  >
                    {aiBusyDoc === doc.id ? "Thinking…" : "✦ Suggest links with AI"}
                  </button>
                  <button
                    type="button"
                    onClick={() => mutateTeacherState((s) => removeDoc(s, doc.id))}
                    className="btn-danger min-h-12 px-4 text-sm"
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {aiNote && (
            <p className="mt-2 text-xs text-app-muted" role="status">
              {aiNote}
            </p>
          )}
          <p className="mt-1 text-xs text-app-muted">
            AI suggestions are advisory — they enter the review queue and still need your approval to become a source.
          </p>
        </div>
      )}

      {/* review queue */}
      <div className="mt-5">
        <h2 className="font-bold">
          Review queue{" "}
          <span className="stat-chip ml-1 align-middle text-xs">{pendingCount} pending</span>
        </h2>
        {teacher.docs.length === 0 && (
          <p className="mt-2 text-sm text-app-muted">Upload a document to see proposed concept links here.</p>
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
                    <span className="block text-xs text-app-muted">
                      {links.length} approved source{links.length === 1 ? "" : "s"} — students now see real
                      citations
                    </span>
                  )}
                  {!grounded && (
                    <span className="block text-xs text-app-muted">still planned &amp; unverified</span>
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

      {/* AI-drafted practice questions (D-014) */}
      <AuthoredQuestionsSection />
    </div>
  );
}

function sectionTextForConcept(teacher: TeacherState, conceptSlug: string): { text: string; citationIds: string[] } {
  const link = teacher.approvedLinks.find((l) => l.conceptSlug === conceptSlug);
  if (!link) return { text: "", citationIds: [] };
  const doc = teacher.docs.find((d) => d.id === link.docId);
  const section = doc?.sections.find((s) => s.id === link.sectionId);
  return { text: section?.text ?? "", citationIds: [] };
}

/**
 * Draft → review → approve practice questions. The AI writes the prose and a
 * *suggested* answer; the teacher confirms the correct option before approving,
 * and the live question is scored deterministically against that key (GATE-002).
 */
function AuthoredQuestionsSection() {
  const teacher = useTeacherState();
  const [draftsByConcept, setDraftsByConcept] = useState<Record<string, DraftQuestion[]>>({});
  const [pick, setPick] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!teacher) return null;
  const groundedSlugs = [...new Set(teacher.approvedLinks.map((l) => l.conceptSlug))];
  if (groundedSlugs.length === 0) return null;

  const draft = async (c: { slug: string; name: string; definition: string }) => {
    setBusy(c.slug);
    setNote(null);
    const { text } = sectionTextForConcept(teacher, c.slug);
    try {
      const drafts = await draftQuestionsForConcept({ conceptName: c.name, definition: c.definition, sectionText: text, count: 3 });
      setDraftsByConcept((m) => ({ ...m, [c.slug]: drafts }));
      if (drafts.length === 0) setNote("Couldn't draft questions just now — try again in a moment.");
    } catch {
      setNote("Couldn't reach the AI item-writer just now.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-5">
      <h2 className="font-bold">Practice questions (AI-drafted)</h2>
      <p className="mt-1 text-xs text-app-muted">
        The AI drafts questions from your approved sources. Confirm the correct answer, then approve — approved
        questions are scored by the deterministic engine, never by the AI.
      </p>
      <ul className="mt-2 space-y-3">
        {concepts
          .filter((c) => groundedSlugs.includes(c.slug))
          .map((c) => {
            const drafts = draftsByConcept[c.slug] ?? [];
            const authored = teacher.authoredQuestions.filter((q) => q.conceptSlug === c.slug);
            return (
              <li key={c.slug} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">{c.name}</strong>
                  <span className="flex items-center gap-2">
                    {authored.length > 0 && (
                      <span className="stat-chip text-xs">{authored.length} in bank</span>
                    )}
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => draft(c)}
                      className="btn-secondary min-h-12 px-4 text-sm disabled:opacity-50"
                    >
                      {busy === c.slug ? "Drafting…" : "✦ Draft questions"}
                    </button>
                  </span>
                </div>

                {drafts.map((d, di) => {
                  const key = `${c.slug}#${di}`;
                  const chosen = pick[key] ?? d.suggestedIndex;
                  return (
                    <div key={key} className="mt-3 rounded-xl border border-[var(--lavender)] p-3">
                      <p className="text-sm font-medium">{d.stem}</p>
                      <p className="mt-1 text-xs text-app-muted">Pick the correct answer (AI suggested one — confirm or change it):</p>
                      <div className="mt-2 space-y-1">
                        {d.options.map((opt, oi) => (
                          <label key={oi} className="flex cursor-pointer items-start gap-2 text-sm">
                            <input
                              type="radio"
                              name={key}
                              checked={chosen === oi}
                              onChange={() => setPick((p) => ({ ...p, [key]: oi }))}
                              className="mt-1"
                            />
                            <span>{opt}</span>
                          </label>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const q = toAuthoredQuestion(d, c.slug, chosen, []);
                            mutateTeacherState((s) => addAuthoredQuestion(s, q));
                            setDraftsByConcept((m) => ({ ...m, [c.slug]: (m[c.slug] ?? []).filter((_, i) => i !== di) }));
                          }}
                          className="btn-primary min-h-12 px-4 text-sm text-white"
                        >
                          Approve to bank
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraftsByConcept((m) => ({ ...m, [c.slug]: (m[c.slug] ?? []).filter((_, i) => i !== di) }))}
                          className="btn-secondary min-h-12 px-4 text-sm"
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  );
                })}

                {authored.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {authored.map((q) => (
                      <li key={q.id} className="flex items-center justify-between gap-2 text-xs text-app-muted">
                        <span>✓ {q.stem.length > 60 ? q.stem.slice(0, 57) + "…" : q.stem}</span>
                        <button
                          type="button"
                          onClick={() => mutateTeacherState((s) => removeAuthoredQuestion(s, q.id))}
                          className="underline"
                        >
                          remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
      </ul>
      {note && (
        <p className="mt-2 text-xs text-app-muted" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
