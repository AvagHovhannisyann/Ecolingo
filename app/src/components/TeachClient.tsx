"use client";

/**
 * Teacher workspace (D-022 platform pivot).
 *
 * The platform ships with NO built-in course. A teacher starts from zero:
 * upload materials → the AI drafts a whole course (units, lessons, order) →
 * the teacher reviews and ratifies it (GATE-001), which mints a real course
 * with a join code to share with students. This screen is the front door to
 * that flow — add materials, open the compiler, and see the courses you've
 * created with their join codes.
 */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createCourse,
  deleteCourse,
  listMyCourses,
  renameCourse,
  type OwnedCourse,
} from "@/lib/course";
import { getSupabase } from "@/lib/supabase";
import { SAMPLE_MATERIAL_MD, SAMPLE_MATERIAL_TITLE } from "@/content/sample-material";
import { sectionize, type TeacherDoc } from "@/lib/engine/ingest";
import { extractPdfText } from "@/lib/pdf-text";
import { addDoc, removeDoc } from "@/lib/teacher-state";
import { mutateTeacherState, useTeacherState } from "@/lib/teacher-store";
import { TeachingStyleCard } from "./teach/TeachingStyleCard";
import { AiToolkitCard } from "./teach/AiToolkitCard";
import { LoadingScreen } from "./LoadingScreen";

/** "N students enrolled", pluralized. */
function enrolledLabel(n: number): string {
  return `${n} student${n === 1 ? "" : "s"} enrolled`;
}

/**
 * One course card: title (inline-editable via renameCourse), its join code and
 * live roster count, and a link into per-section analytics.
 */
function SectionCard({
  course,
  onRenamed,
  onDeleted,
}: {
  course: OwnedCourse;
  onRenamed: (id: string, title: string) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(course.title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    const ok = await deleteCourse(course.id);
    setDeleting(false);
    if (!ok) {
      setError("Couldn't delete just now — try again when you're online.");
      setConfirmingDelete(false);
      return;
    }
    onDeleted(course.id);
  };

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
              aria-label="Course title"
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
            <span className="flex gap-2">
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
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="btn-danger min-h-12 px-4 text-sm"
                aria-label={`Delete ${course.title}`}
              >
                Delete
              </button>
            </span>
          </>
        )}
      </div>

      {confirmingDelete && (
        <div className="mt-3 rounded-xl border-2 border-[var(--coral)] bg-[var(--coral-tint)] p-3">
          <p className="text-sm font-bold text-[var(--deep-ink)]">
            Delete “{course.title}”?
          </p>
          <p className="mt-1 text-xs text-[var(--deep-ink)]">
            Its join code stops working and enrolled students lose access. This can&apos;t be undone.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleting}
              className="btn-danger min-h-12 px-4 text-sm disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete course"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="btn-secondary min-h-12 px-4 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
        View analytics for this course <span aria-hidden>→</span>
      </Link>
    </li>
  );
}

/**
 * "Your courses" — every course the teacher owns, each with its own join code
 * and roster. A brand-new teacher owns NOTHING and gets an honest empty state
 * that points at the compiler (never a fabricated demo course, D-027). A "+
 * New blank course" escape hatch mints a bare join code for teachers who don't
 * want the AI draft. Degrades quietly when Supabase is unconfigured (GATE-009).
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
    setCourses(list);
    setPhase("ready");
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // No backend configured → the honest "class features need the cloud"
      // state (GATE-009). Otherwise show whatever this teacher actually owns —
      // a brand-new teacher legitimately owns NOTHING and gets an empty state,
      // never a fabricated demo course (D-027).
      if (getSupabase() === null) {
        if (alive) setPhase("unavailable");
        return;
      }
      const list = await listMyCourses();
      if (!alive) return;
      setCourses(list);
      setPhase("ready");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onRenamed = useCallback((id: string, title: string) => {
    setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
  }, []);

  const onDeleted = useCallback((id: string) => {
    setCourses((cs) => cs.filter((c) => c.id !== id));
  }, []);

  const createSection = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    setCreateError(null);
    const created = await createCourse(title);
    setCreating(false);
    if (!created) {
      setCreateError("Couldn't create a course just now — try again when you're online.");
      return;
    }
    setCourses((cs) => [...cs, { ...created, studentCount: 0 }]);
    setNewTitle("");
    setAdding(false);
  };

  if (phase === "loading") {
    return (
      <div className="card mt-4 p-4">
        <h2 className="font-bold">Your courses</h2>
        <p className="mt-1 text-sm text-app-muted" role="status">
          Loading your courses…
        </p>
      </div>
    );
  }

  if (phase === "unavailable") {
    return (
      <div className="card mt-4 p-4">
        <h2 className="font-bold">Your courses</h2>
        <p className="mt-1 text-sm text-app-muted">
          Class features need the cloud connection — your courses, join codes, and rosters appear here once
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
            Your courses
          </h2>
          <p className="text-xs text-app-muted">
            Every course you create shows up here with its own join code and roster.
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

      {courses.length === 0 && !adding && (
        <div className="card mt-3 flex items-start gap-3 p-4">
          <Image
            src="/art-v2/eco-books.webp"
            alt=""
            width={96}
            height={96}
            className="h-14 w-14 shrink-0 rounded-xl object-cover"
          />
          <div>
            <p className="text-sm font-bold">No courses yet — this is your workspace.</p>
            <p className="mt-1 text-sm text-app-muted">
              Build your first course with the AI compiler above. When you approve the draft, it becomes a real
              course with a join code you can share with your students.
            </p>
          </div>
        </div>
      )}

      <ul className="mt-3 space-y-3">
        {courses.map((c) => (
          <SectionCard key={c.id} course={c} onRenamed={onRenamed} onDeleted={onDeleted} />
        ))}
      </ul>

      <div className="mt-3">
        {adding ? (
          <div className="card p-4">
            <label htmlFor="new-section-title" className="block text-sm font-medium">
              New course title
            </label>
            <input
              id="new-section-title"
              type="text"
              className="mt-2 block w-full rounded-xl border border-[color:var(--app-border)] p-3 text-sm"
              placeholder="e.g. Intro to Biology — Fall 2026"
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
                {creating ? "Creating…" : "Create course"}
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
            + New blank course (skip the AI draft)
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

  if (!teacher) return <LoadingScreen label="Loading teacher workspace…" />;

  /** Sectionize + store one document. Returns an error message, or null on success. */
  const addDocFromText = (title: string, raw: string): string | null => {
    const doc = sectionize(title.trim() || "Untitled upload", raw, new Date().toISOString());
    if (doc.sections.length === 0) return "looks empty — nothing to sectionize";
    mutateTeacherState((s) => addDoc(s, doc));
    return null;
  };

  // Text ingestion for the sample / paste buttons (single, with its own error UI).
  const ingest = (title: string, raw: string) => {
    setUploadError(null);
    const err = addDocFromText(title, raw);
    if (err) setUploadError(`That file ${err}.`);
  };

  /** Read one uploaded file into a document. Returns an error message or null. */
  const readOneFile = async (file: File): Promise<string | null> => {
    const baseTitle = file.name.replace(/\.(md|txt|markdown|pdf)$/i, "");
    if (/\.pdf$/i.test(file.name)) {
      try {
        const text = await extractPdfText(file);
        if (!text.trim()) return `${file.name}: no selectable text (a scan?) — paste it instead`;
        return addDocFromText(baseTitle, text) ? `${file.name}: looks empty` : null;
      } catch {
        return `${file.name}: couldn't read that PDF`;
      }
    }
    if (!/\.(md|txt|markdown)$/i.test(file.name)) {
      return `${file.name}: only .pdf, .md, or .txt`;
    }
    return addDocFromText(baseTitle, await file.text()) ? `${file.name}: looks empty` : null;
  };

  /** Ingest one OR several files picked at once, with progress + a combined report. */
  const onFiles = async (files: File[]) => {
    setUploadError(null);
    const errors: string[] = [];
    for (let i = 0; i < files.length; i++) {
      setBusy(files.length > 1 ? `Reading ${i + 1} of ${files.length}…` : "Reading…");
      const err = await readOneFile(files[i]);
      if (err) errors.push(err);
    }
    setBusy(null);
    if (errors.length) {
      const ok = files.length - errors.length;
      setUploadError(
        (ok > 0 ? `Added ${ok} of ${files.length}. ` : "") + `Couldn't add: ${errors.join("; ")}.`,
      );
    }
  };

  const docs: TeacherDoc[] = teacher.docs;
  const sectionCount = docs.reduce((n, d) => n + d.sections.length, 0);

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
          <p className="text-sm opacity-90">Start from zero — your materials in, a real course out.</p>
        </div>
      </div>

      <p className="text-sm text-app">
        Build a course from scratch in three steps: <strong>add your materials</strong>, let the AI{" "}
        <strong>draft the course</strong> (units, lessons and the order to learn them), then{" "}
        <strong>approve it</strong> to get a join code you share with your students. Set your teaching voice once
        and the AI drafts and tutors in it everywhere. Nothing reaches students until you sign off.
      </p>

      {/* ── STEP 1 · add materials ─────────────────────────────────────────── */}
      <div className="card mt-4 p-4">
        <h2 className="font-bold">
          <span className="text-app-muted">Step 1 ·</span> Add your materials
        </h2>
        <p className="mt-1 text-sm text-app-muted">
          Upload lecture notes, a syllabus, or readings (PDF, .md, or .txt) — pick several at once. Ecolingo splits
          each into sections the compiler can build from.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.md,.txt,.markdown"
            multiple
            aria-label="Upload course documents (PDF, .md, or .txt) — you can select several at once"
            className="sr-only"
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              if (files.length) void onFiles(files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="btn-primary min-h-12 px-5 text-white disabled:opacity-50"
          >
            {busy ?? "Upload files — PDF / .md / .txt"}
          </button>
          <button
            type="button"
            onClick={() => ingest(SAMPLE_MATERIAL_TITLE, SAMPLE_MATERIAL_MD)}
            className="btn-secondary min-h-12 px-4 text-sm"
          >
            Try a sample document
          </button>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">Or paste text</summary>
          <input
            type="text"
            aria-label="Title for the pasted material"
            placeholder="Title, e.g. Week 1 — Introduction"
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

        {docs.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold">
              Your materials{" "}
              <span className="stat-chip ml-1 align-middle text-xs">
                {docs.length} file{docs.length === 1 ? "" : "s"} · {sectionCount} sections
              </span>
            </h3>
            <ul className="mt-2 space-y-2">
              {docs.map((doc) => (
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[color:var(--app-border)] p-3 text-sm">
                  <span>
                    📄 <strong>{doc.title}</strong> — {doc.sections.length} sections, ~
                    {Math.max(1, Math.round(doc.charCount / 2800))} pages
                  </span>
                  <button
                    type="button"
                    onClick={() => mutateTeacherState((s) => removeDoc(s, doc.id))}
                    className="btn-danger min-h-12 px-4 text-sm"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── "Teach like you" · the AI persona the teacher instructs (D-029) ── */}
      <TeachingStyleCard />

      {/* ── STEP 2 · compile with AI (the from-zero course builder) ────────── */}
      <Link
        href="/teach/compile"
        className="group mt-4 block rounded-2xl border-2 border-[var(--lavender)] bg-[color:rgba(177,140,255,0.10)] p-5 transition hover:bg-[color:rgba(177,140,255,0.18)]"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold text-app">
              <span className="text-app-muted">Step 2 ·</span> ✦ Build your course with AI
            </p>
            <p className="mt-1 text-sm text-app">
              The AI drafts units, lessons and prerequisites from your materials. You review and approve — then it
              becomes a real course with a join code.
            </p>
          </div>
          <span aria-hidden className="text-2xl text-[var(--lavender-text)] transition group-hover:translate-x-1">
            →
          </span>
        </div>
      </Link>

      {/* ── AI toolkit · everything the AI can make from your material ─────── */}
      <AiToolkitCard />

      {/* ── STEP 3 · the courses you've built ──────────────────────────────── */}
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
    </div>
  );
}
