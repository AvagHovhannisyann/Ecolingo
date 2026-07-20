"use client";

/**
 * Teacher course compiler (D-020, Wave 2 Stream L).
 *
 * The teacher picks source material — sections they already uploaded on /teach,
 * or fresh pasted text run through the same `sectionize` — and asks the AI to
 * DRAFT a whole course plan (units → lessons + prerequisite edges). The draft is
 * never trusted: the API sanitizes server-side, and this client sanitizes AGAIN
 * with `sanitizeCoursePlan` against the exact section ids it sent, so a
 * fabricated section reference or a cycle-closing prereq can never render. The
 * teacher reviews the sanitized plan (including an honest "dropped by sanitizer"
 * list), unchecks any lesson, and ratifies (GATE-001) — only then does
 * `planToCourseDraft` mint `planned_unverified` concepts that get persisted.
 *
 * No secrets here: the OpenRouter key stays server-side; without it the API
 * returns 503 and this UI shows the honest degrade path (GATE-009).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { sectionize, type DocSection } from "@/lib/engine/ingest";
import {
  sanitizeCoursePlan,
  planToCourseDraft,
  type CoursePlanSanitizeResult,
  type DraftCoursePlan,
  type DroppedPrereqReason,
} from "@/lib/engine/compile-course";
import { useTeacherState } from "@/lib/teacher-store";
import { useTeachingStyle } from "@/lib/teaching-style-store";
import { isDefaultTeachingStyle } from "@/lib/engine/teaching-style";
import { autoCourseIntroVideo } from "@/lib/ai/video";
import { attachCompiledPlan, createCourse } from "@/lib/course";
import {
  loadCompiledPlan,
  saveCompiledPlan,
  type StoredCompiledPlan,
} from "./plan-store";
import { LoadingScreen } from "../LoadingScreen";

const PROVENANCE = "AI drafted, you approve — nothing reaches students without your sign-off.";

const DROP_REASON_LABEL: Record<DroppedPrereqReason, string> = {
  unknown_slug: "unknown concept",
  self_loop: "points at itself",
  duplicate: "duplicate edge",
  cycle: "would create a cycle",
};

type Phase = "input" | "clarify" | "compiling" | "review" | "error";

interface CompileError {
  kind: "no_provider" | "upstream" | "network" | "empty";
  message: string;
}

export function CompileCourseClient() {
  const teacher = useTeacherState();
  // D-029: the teacher's saved voice shapes the drafted course and rides along
  // on the ratified plan so students later hear that same voice from the tutor.
  const teachingStyle = useTeachingStyle();

  // ── source selection ────────────────────────────────────────────────────
  const [mode, setMode] = useState<"docs" | "paste">("docs");
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasted, setPasted] = useState("");

  // ── compile lifecycle ───────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("input");
  // D-022 clarify step: AI questions (optional to answer) + structural context
  const [clarifyQuestions, setClarifyQuestions] = useState<string[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<number, string>>({});
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [targetDifficulty, setTargetDifficulty] = useState(3);
  const [expectedLectures, setExpectedLectures] = useState<string>("");
  const [error, setError] = useState<CompileError | null>(null);
  const [result, setResult] = useState<CoursePlanSanitizeResult | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [compiledTitle, setCompiledTitle] = useState("");

  // ── ratification ────────────────────────────────────────────────────────
  const [approved, setApproved] = useState<StoredCompiledPlan | null>(() => loadCompiledPlan());
  // D-032: an intro clip is rendered automatically on approval (HunyuanVideo);
  // the teacher never writes a prompt. Honest, non-blocking status.
  const [introVideo, setIntroVideo] = useState<IntroVideoState>({ phase: "idle" });

  const docs = useMemo(() => teacher?.docs ?? [], [teacher]);

  // The sections that will actually be sent to the compiler for the current
  // source selection, plus a heading lookup for rendering source chips. All
  // hooks run unconditionally (rules of hooks) — teacher-null is handled below.
  const { sourceTitle, sections } = useMemo(() => {
    if (mode === "paste") {
      const text = pasted.trim();
      if (!text) return { sourceTitle: "", sections: [] as DocSection[] };
      const doc = sectionize(pasteTitle.trim() || "Pasted material", pasted, new Date(0).toISOString());
      return { sourceTitle: doc.title, sections: doc.sections };
    }
    const doc = docs.find((d) => d.id === selectedDocId) ?? docs[0];
    return { sourceTitle: doc?.title ?? "", sections: doc?.sections ?? [] };
  }, [mode, pasted, pasteTitle, docs, selectedDocId]);

  const headingBySection = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sections) m.set(s.id, s.heading);
    return m;
  }, [sections]);

  if (!teacher) {
    return <LoadingScreen label="Loading teacher workspace…" />;
  }

  const canCompile = sections.length > 0 && phase !== "compiling";

  /**
   * D-022: before compiling, ask the AI for clarifying questions about the
   * material and the class. Failure NEVER blocks (GATE-009): the context
   * screen still opens with the structural fields; questions are a bonus.
   */
  const startClarify = async () => {
    setClarifyLoading(true);
    setClarifyQuestions([]);
    setClarifyAnswers({});
    try {
      const res = await fetch("/api/compile-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "clarify",
          sections: sections.map((s) => ({ id: s.id, heading: s.heading, text: s.text })),
          style: teachingStyle,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { questions?: unknown };
        if (Array.isArray(data.questions)) {
          setClarifyQuestions(data.questions.filter((q): q is string => typeof q === "string").slice(0, 5));
        }
      }
    } catch {
      /* questions are optional — the context screen works without them */
    }
    setClarifyLoading(false);
    setPhase("clarify");
  };

  const compile = async () => {
    setPhase("compiling");
    setError(null);
    setResult(null);
    const allowed = new Set(sections.map((s) => s.id));
    try {
      const res = await fetch("/api/compile-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: sections.map((s) => ({ id: s.id, heading: s.heading, text: s.text })),
          context: {
            targetDifficulty,
            expectedLectures: expectedLectures ? Number(expectedLectures) : undefined,
            answers: clarifyQuestions
              .map((q, i) => ({ question: q, answer: (clarifyAnswers[i] ?? "").trim() }))
              .filter((a) => a.answer),
          },
          style: teachingStyle,
        }),
      });
      if (res.status === 503) {
        setError({
          kind: "no_provider",
          message:
            "Live AI unavailable — set OPENROUTER_API_KEY on the server to draft a course plan. Your sections are still here, ready to compile once it is configured.",
        });
        setPhase("error");
        return;
      }
      if (!res.ok) {
        setError({
          kind: "upstream",
          message:
            "The AI provider didn't answer just now — nothing was drafted. Try again in a moment; your sections are unchanged.",
        });
        setPhase("error");
        return;
      }
      const data = (await res.json()) as { plan?: unknown; model?: string };
      // NEVER trust the response: re-sanitize against the real section ids.
      const sanitized = sanitizeCoursePlan(data.plan, allowed);
      if (sanitized.plan.units.length === 0) {
        setError({
          kind: "empty",
          message:
            "The AI returned nothing usable for this material (every unit was dropped by the sanitizer). Try a longer or clearer document.",
        });
        setPhase("error");
        return;
      }
      // default every lesson checked (teacher opts OUT, not in)
      const initChecked: Record<string, boolean> = {};
      for (const u of sanitized.plan.units) for (const l of u.lessons) initChecked[l.conceptSlug] = true;
      setResult(sanitized);
      setModel(typeof data.model === "string" ? data.model : null);
      setChecked(initChecked);
      setCompiledTitle(sourceTitle);
      setPhase("review");
    } catch {
      setError({
        kind: "network",
        message: "Couldn't reach the compiler just now — check your connection and try again.",
      });
      setPhase("error");
    }
  };

  const checkedCount = result
    ? result.plan.units.reduce((n, u) => n + u.lessons.filter((l) => checked[l.conceptSlug]).length, 0)
    : 0;

  const ratify = async () => {
    if (!result) return;
    // Keep only checked lessons; drop units left empty.
    const filtered: DraftCoursePlan = {
      units: result.plan.units
        .map((u) => ({ ...u, lessons: u.lessons.filter((l) => checked[l.conceptSlug]) }))
        .filter((u) => u.lessons.length > 0),
      // an edge survives only if both endpoints are still present
      prereqPairs: result.plan.prereqPairs.filter(([from, to]) => checked[from] && checked[to]),
    };
    if (filtered.units.length === 0) return;
    const draft = planToCourseDraft(filtered, []); // no generated questions yet (future work)
    const stored: StoredCompiledPlan = {
      version: 1,
      approvedAtISO: new Date().toISOString(),
      model,
      sourceTitle: compiledTitle,
      unitCount: filtered.units.length,
      lessonCount: draft.lessons.length,
      draft,
      // D-029: persist the teacher's voice with the course (jsonb, no schema
      // change) so the student-facing tutor speaks in it later. Omit when the
      // teacher hasn't customised it, keeping default plans byte-identical.
      teachingStyle: isDefaultTeachingStyle(teachingStyle) ? undefined : teachingStyle,
    };
    // D-022: bind the ratified plan to a REAL course with its own join code —
    // that code is what the teacher shares; students who join it get this
    // plan. In local-only mode (no Supabase) the plan still saves locally and
    // the confirmation says so honestly (GATE-009).
    const course = await createCourse(compiledTitle || "Untitled course");
    if (course) {
      const bound = await attachCompiledPlan(course.id, stored);
      if (bound) {
        stored.courseId = course.id;
        stored.joinCode = course.joinCode;
      }
    }
    saveCompiledPlan(stored);
    setApproved(stored);

    // D-032: kick off the automatic intro clip — the LLM writes the prompt and
    // HunyuanVideo renders it. Non-blocking and best-effort: approval never
    // waits on it, and it degrades honestly if video isn't configured.
    const unitTitles = filtered.units.map((u) => u.title);
    setIntroVideo({ phase: "generating" });
    void autoCourseIntroVideo(compiledTitle || "this course", unitTitles).then((r) => {
      if (r.ok) setIntroVideo({ phase: "ready", url: r.video, prompt: r.prompt });
      else setIntroVideo({ phase: r.reason === "no_provider" ? "unavailable" : "failed" });
    });

    setPhase("input");
    setResult(null);
  };

  const startOver = () => {
    setPhase("input");
    setResult(null);
    setError(null);
  };

  return (
    <div>
      <Link href="/teach" className="text-sm text-[var(--model-blue-text)] underline">
        ← Back to teacher workspace
      </Link>

      <h1 className="mt-2 text-2xl font-bold">Compile a course</h1>
      <p className="mt-1 text-sm text-app">
        Turn your uploaded material into a draft course — units, lessons, and the order to learn them in. The AI
        writes the draft; you review and approve it.
      </p>
      <p className="mt-2 rounded-xl bg-[color:rgba(177,140,255,0.16)] p-3 text-sm text-[var(--lavender-text)]">
        ✦ {PROVENANCE}
      </p>

      {approved && phase !== "review" && <ApprovedBanner plan={approved} introVideo={introVideo} />}

      {phase === "clarify" && (
        <section className="card mt-4 p-4" aria-label="Tell the AI about your class">
          <h2 className="text-lg font-extrabold">Tell the AI about your class</h2>
          <p className="mt-1 text-sm text-app-muted">
            Everything here shapes the course structure. Every field is optional except the difficulty target.
          </p>

          <fieldset className="mt-4">
            <legend className="text-sm font-bold">
              Target difficulty — how strong must students be by the END of the course?
            </legend>
            <p className="text-xs text-app-muted">
              Students always start accessible and ramp up; this sets where the ramp must arrive.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                [1, "Familiarity"],
                [2, "Comfortable"],
                [3, "Solid"],
                [4, "Strong"],
                [5, "Mastery-grade"],
              ].map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={targetDifficulty === v}
                  onClick={() => setTargetDifficulty(v as number)}
                  className={`min-h-11 rounded-xl border-2 px-3 text-sm font-bold ${
                    targetDifficulty === v
                      ? "border-[var(--model-blue)] bg-[var(--model-blue-tint)]"
                      : "border-[color:var(--app-border)]"
                  }`}
                >
                  {v} · {label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 block max-w-xs text-sm font-bold" htmlFor="expected-lectures">
            Roughly how many classes does this course span? <span className="font-normal text-app-muted">(optional)</span>
            <input
              id="expected-lectures"
              type="number"
              min={1}
              max={60}
              value={expectedLectures}
              onChange={(e) => setExpectedLectures(e.target.value)}
              className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 font-normal"
            />
          </label>

          {clarifyQuestions.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-extrabold">The AI read your material and asks:</h3>
              <ul className="mt-2 space-y-3">
                {clarifyQuestions.map((q, i) => (
                  <li key={i}>
                    <label className="block text-sm font-bold" htmlFor={`clarify-${i}`}>
                      {q} <span className="font-normal text-app-muted">(optional)</span>
                    </label>
                    <textarea
                      id={`clarify-${i}`}
                      rows={2}
                      value={clarifyAnswers[i] ?? ""}
                      onChange={(e) => setClarifyAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                      className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm font-normal"
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={compile} className="btn-primary min-h-12 px-5 text-white">
              Compile course plan
            </button>
            <button type="button" onClick={() => setPhase("input")} className="btn-secondary min-h-12 px-4 text-sm">
              Back
            </button>
          </div>
        </section>
      )}

      {/* ── INPUT ──────────────────────────────────────────────────────── */}
      {phase !== "review" && phase !== "clarify" && (
        <section className="card mt-4 p-4" aria-labelledby="compile-source-heading">
          <h2 id="compile-source-heading" className="font-bold">
            1 · Choose source material
          </h2>

          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Source of material to compile">
            <button
              type="button"
              onClick={() => setMode("docs")}
              aria-pressed={mode === "docs"}
              className={`min-h-12 rounded-xl px-4 text-sm ${
                mode === "docs" ? "btn-primary text-white" : "btn-secondary"
              }`}
            >
              Compile from your uploaded sections
            </button>
            <button
              type="button"
              onClick={() => setMode("paste")}
              aria-pressed={mode === "paste"}
              className={`min-h-12 rounded-xl px-4 text-sm ${
                mode === "paste" ? "btn-primary text-white" : "btn-secondary"
              }`}
            >
              Paste fresh text
            </button>
          </div>

          {mode === "docs" &&
            (docs.length === 0 ? (
              <p className="mt-3 rounded-xl bg-[var(--coral-tint)] p-3 text-sm text-[var(--deep-ink)]">
                No uploaded materials yet.{" "}
                <Link href="/teach" className="underline">
                  Upload a document on the teacher workspace
                </Link>{" "}
                first, or paste fresh text above.
              </p>
            ) : (
              <div className="mt-3">
                <label htmlFor="compile-doc" className="block text-sm font-medium">
                  Document
                </label>
                <select
                  id="compile-doc"
                  className="mt-1 min-h-12 w-full rounded-xl border border-[color:var(--app-border)] bg-app p-2 text-sm text-app"
                  value={selectedDocId || docs[0].id}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                >
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} — {d.sections.length} sections
                    </option>
                  ))}
                </select>
              </div>
            ))}

          {mode === "paste" && (
            <div className="mt-3">
              <label htmlFor="compile-paste-title" className="block text-sm font-medium">
                Title
              </label>
              <input
                id="compile-paste-title"
                type="text"
                placeholder="e.g. Lecture 4 — Solow growth"
                className="mt-1 block w-full rounded-xl border border-[color:var(--app-border)] bg-app p-3 text-sm text-app"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
              />
              <label htmlFor="compile-paste-body" className="mt-3 block text-sm font-medium">
                Material
              </label>
              <textarea
                id="compile-paste-body"
                placeholder="Paste lecture notes or a syllabus here…"
                className="mt-1 block h-40 w-full rounded-xl border border-[color:var(--app-border)] bg-app p-3 text-sm text-app"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
            </div>
          )}

          {/* section preview: id, heading, chars */}
          {sections.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">
                Sections to compile{" "}
                <span className="stat-chip ml-1 align-middle text-xs">{sections.length}</span>
              </h3>
              <ul className="mt-2 space-y-1">
                {sections.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-[color:var(--app-border)] px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-app">§ {s.heading}</span>
                    <span className="text-xs text-app-muted">
                      <code className="rounded bg-[var(--mist-gray)] px-1">{s.id}</code> · {s.text.length} chars
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => void startClarify()}
              disabled={!canCompile || clarifyLoading}
              className="btn-primary min-h-12 px-5 text-white disabled:opacity-50"
            >
              {clarifyLoading
                ? "Reading your material…"
                : phase === "compiling"
                  ? "Asking the AI to draft a course plan…"
                  : "Continue — tell the AI about your class"}
            </button>
            {phase === "compiling" && (
              <p className="mt-2 text-xs text-app-muted" role="status">
                Asking the AI to draft a course plan from {sections.length} section
                {sections.length === 1 ? "" : "s"}…
              </p>
            )}
          </div>

          {phase === "error" && error && (
            <p
              className="mt-3 rounded-xl bg-[var(--coral-tint)] p-3 text-sm text-[var(--deep-ink)]"
              role="alert"
            >
              {error.message}
            </p>
          )}
        </section>
      )}

      {/* ── REVIEW ─────────────────────────────────────────────────────── */}
      {phase === "review" && result && (
        <ReviewPlan
          result={result}
          model={model}
          sourceTitle={compiledTitle}
          headingBySection={headingBySection}
          checked={checked}
          onToggle={(slug) => setChecked((c) => ({ ...c, [slug]: !c[slug] }))}
          checkedCount={checkedCount}
          onApprove={ratify}
          onCancel={startOver}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function ApprovedBanner({ plan, introVideo }: { plan: StoredCompiledPlan; introVideo: IntroVideoState }) {
  return (
    <div
      className="mt-4 rounded-2xl border border-[var(--growth-green)] bg-[var(--growth-green-tint)] p-4"
      role="status"
    >
      <p className="font-bold text-[var(--growth-green-text)]">✅ Course plan approved</p>
      <p className="mt-1 text-sm text-app">
        {plan.unitCount} unit{plan.unitCount === 1 ? "" : "s"} · {plan.lessonCount} lesson
        {plan.lessonCount === 1 ? "" : "s"} approved, marked <strong>planned_unverified</strong> until sources
        attach.
      </p>
      {plan.joinCode ? (
        <p className="mt-2 rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm">
          Share this join code with your students:{" "}
          <code className="text-base font-extrabold tracking-widest text-[var(--growth-green-text)]">{plan.joinCode}</code>
          <span className="block text-xs text-app-muted">
            Students sign up, enter the code, and receive this course on their learning path.
          </span>
        </p>
      ) : (
        <p className="mt-2 text-xs text-app-muted" role="note">
          Cloud unavailable — the plan is saved on this device only; no join code could be created yet.
        </p>
      )}
      <p className="mt-1 text-xs text-app-muted">
        From “{plan.sourceTitle}”{plan.model ? ` · drafted by ${plan.model}` : ""}. Saved to your workspace;
        no student sees it until sources are attached and you sign off.
      </p>

      {/* D-032: the automatic intro clip (HunyuanVideo). The teacher writes
          nothing — it's generated for them and shown here when ready. */}
      <IntroVideoBlock state={introVideo} title={plan.sourceTitle} />
    </div>
  );
}

/** Discriminated status for the auto-generated intro clip (D-032). */
type IntroVideoState =
  | { phase: "idle" }
  | { phase: "generating" }
  | { phase: "ready"; url: string; prompt?: string }
  | { phase: "unavailable" }
  | { phase: "failed" };

function IntroVideoBlock({ state, title }: { state: IntroVideoState; title: string }) {
  if (state.phase === "idle") return null;
  return (
    <div className="mt-3 rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3">
      <p className="text-sm font-bold">
        <span aria-hidden>🎬</span> Intro clip
        <span className="ml-2 rounded-full bg-[color:rgba(177,140,255,0.16)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--lavender-text)]">
          Auto · Illustrative
        </span>
      </p>
      {state.phase === "generating" && (
        <p className="mt-1 flex items-center gap-2 text-sm text-app-muted" role="status">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--app-border)] border-t-[var(--lavender)]" aria-hidden />
          Rendering a short intro for “{title}” with HunyuanVideo — this keeps going in the background.
        </p>
      )}
      {state.phase === "ready" && (
        <div className="mt-2">
          <video controls src={state.url} className="w-full rounded-lg border border-[color:var(--app-border)]" />
          <a href={state.url} download="ecolingo-intro.mp4" className="btn-secondary mt-2 inline-block min-h-11 px-4 py-2 text-sm">
            Download clip
          </a>
          <p className="mt-1 text-xs text-app-muted">Illustrative motion — never a factual source.</p>
        </div>
      )}
      {state.phase === "unavailable" && (
        <p className="mt-1 text-xs text-app-muted">
          Auto-video isn&apos;t configured on the server (needs HF_TOKEN) — your course is fully approved without it.
        </p>
      )}
      {state.phase === "failed" && (
        <p className="mt-1 text-xs text-app-muted">
          The intro clip couldn&apos;t render this time — no problem, your course is approved regardless.
        </p>
      )}
    </div>
  );
}

function ReviewPlan({
  result,
  model,
  sourceTitle,
  headingBySection,
  checked,
  onToggle,
  checkedCount,
  onApprove,
  onCancel,
}: {
  result: CoursePlanSanitizeResult;
  model: string | null;
  sourceTitle: string;
  headingBySection: Map<string, string>;
  checked: Record<string, boolean>;
  onToggle: (slug: string) => void;
  checkedCount: number;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const { plan, droppedUnits, droppedLessons, droppedPrereqPairs } = result;
  const anyDropped = droppedUnits > 0 || droppedLessons > 0 || droppedPrereqPairs.length > 0;

  return (
    <section className="mt-4" aria-labelledby="compile-review-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="compile-review-heading" className="font-bold">
          2 · Review the drafted plan
        </h2>
        <span className="text-xs text-app-muted">
          from “{sourceTitle}”{model ? ` · ${model}` : ""}
        </span>
      </div>
      <p className="mt-1 text-sm text-app-muted">
        Every lesson below is checked by default. Uncheck any you don&apos;t want, then approve. Nothing is shown
        to students yet — approving saves it as a <strong>planned_unverified</strong> draft.
      </p>

      {plan.units.map((unit, ui) => (
        <div key={ui} className="card mt-3 p-4">
          <h3 className="font-bold">
            <span className="text-app-muted">Unit {ui + 1}</span> · {unit.title}
          </h3>
          <ul className="mt-3 space-y-2">
            {unit.lessons.map((l) => (
              <li key={l.conceptSlug} className="rounded-xl border border-[color:var(--app-border)] p-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0"
                    checked={!!checked[l.conceptSlug]}
                    onChange={() => onToggle(l.conceptSlug)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold text-app">{l.title}</span>
                      <code className="rounded bg-[var(--mist-gray)] px-1 text-xs text-[var(--deep-ink)]">
                        {l.conceptSlug}
                      </code>
                      <span className="text-xs text-app-muted">~{l.estimatedMinutes} min</span>
                    </span>
                    <span className="mt-1 block text-sm text-app">{l.coreIdea}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-1">
                      {l.sourceSectionIds.length === 0 ? (
                        <span className="text-xs text-app-muted">no source section matched</span>
                      ) : (
                        l.sourceSectionIds.map((sid) => (
                          <span key={sid} className="stat-chip text-xs" title={sid}>
                            § {headingBySection.get(sid) ?? sid}
                          </span>
                        ))
                      )}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* prerequisite edges */}
      <div className="card mt-3 p-4">
        <h3 className="font-bold">Prerequisites (learn-before order)</h3>
        {plan.prereqPairs.length === 0 ? (
          <p className="mt-2 text-sm text-app-muted">
            No prerequisite edges — the sanitizer kept none (every lesson stands alone).
          </p>
        ) : (
          <ol className="mt-2 space-y-1 text-sm">
            {plan.prereqPairs.map(([from, to], i) => (
              <li key={i} className="flex items-center gap-2">
                <code className="rounded bg-[var(--mist-gray)] px-1 text-xs text-[var(--deep-ink)]">{from}</code>
                <span aria-hidden>→</span>
                <code className="rounded bg-[var(--mist-gray)] px-1 text-xs text-[var(--deep-ink)]">{to}</code>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* sanitizer honesty */}
      {anyDropped && (
        <div className="mt-3 rounded-2xl border border-[color:var(--app-border)] bg-[var(--coral-tint)] p-4">
          <h3 className="font-bold text-[var(--deep-ink)]">Dropped by the sanitizer</h3>
          <p className="mt-1 text-xs text-[var(--deep-ink)]">
            Shown for transparency — these were removed so the plan stays honest.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--deep-ink)]">
            {droppedUnits > 0 && <li>{droppedUnits} unit(s) dropped (empty or malformed).</li>}
            {droppedLessons > 0 && <li>{droppedLessons} lesson(s) dropped (missing fields or duplicate).</li>}
            {droppedPrereqPairs.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1">
                <code className="rounded bg-white/50 px-1 text-xs">
                  {d.pair[0]} → {d.pair[1]}
                </code>
                <span>— {DROP_REASON_LABEL[d.reason]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ratify */}
      <div className="card mt-4 p-4">
        <p className="text-sm text-app">
          <span className="font-semibold">{checkedCount}</span> lesson{checkedCount === 1 ? "" : "s"} selected.
          Approving saves them to your workspace, each concept <strong>planned_unverified</strong> — no student
          sees them until sources attach and you sign off.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={checkedCount === 0}
            className="btn-primary min-h-12 px-5 text-white disabled:opacity-50"
          >
            Approve course plan
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary min-h-12 px-4 text-sm">
            Discard draft
          </button>
        </div>
      </div>
    </section>
  );
}
