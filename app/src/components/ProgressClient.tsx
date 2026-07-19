"use client";

/**
 * Progress — mastery is multi-dimensional (§22): the learner is never
 * reduced to one number. Includes the audit trail (GATE-006 made visible)
 * and the personalization reset control (IDEA-024).
 */

import { useEffect, useState } from "react";
import { concepts, misconceptions } from "@/content/econ13210";
import { dominantMisconception, retentionAt } from "@/lib/engine/mastery";
import { resetLearnerState, updateProfile } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { fetchMyEnrollment, joinCourseByCode, type EnrollmentSummary } from "@/lib/course";
import { getSupabase } from "@/lib/supabase";
import { Achievements } from "./Achievements";

/**
 * "Join your class" — a student enters the teacher's join code to enroll; once
 * enrolled (now or already) the card shows the class they belong to. Degrades
 * quietly when Supabase is unconfigured or unreachable (GATE-009).
 */
function JoinClassCard() {
  const [phase, setPhase] = useState<"loading" | "unavailable" | "ready">("loading");
  const [enrollment, setEnrollment] = useState<EnrollmentSummary | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // no client configured at all → nothing cloud can do here
      if (!getSupabase()) {
        if (alive) setPhase("unavailable");
        return;
      }
      const e = await fetchMyEnrollment();
      if (!alive) return;
      setEnrollment(e);
      setPhase("ready");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const join = async () => {
    setBusy(true);
    setError(null);
    const res = await joinCourseByCode(code);
    if (res.ok) {
      const e = await fetchMyEnrollment();
      setEnrollment(e ?? { courseId: res.courseId!, title: "Your class" });
      setCode("");
    } else if (res.error === "not_found") {
      setError("No class found for that code — double-check it with your teacher.");
    } else {
      setError("Class features need the cloud connection — try again once you're online.");
    }
    setBusy(false);
  };

  if (phase === "loading") {
    return (
      <section aria-label="Your class" className="mt-4 rounded-2xl border border-[color:var(--app-border)] p-4">
        <h2 className="text-sm font-medium">Your class</h2>
        <p className="mt-1 text-sm text-app-muted" role="status">
          Checking your enrollment…
        </p>
      </section>
    );
  }

  if (phase === "unavailable") {
    return (
      <section aria-label="Your class" className="mt-4 rounded-2xl border border-[color:var(--app-border)] p-4">
        <h2 className="text-sm font-medium">Your class</h2>
        <p className="mt-1 text-sm text-app-muted">
          Class features need the cloud connection — join with your class code once you&apos;re online.
        </p>
      </section>
    );
  }

  if (enrollment) {
    return (
      <section aria-label="Your class" className="mt-4 rounded-2xl border border-[color:var(--app-border)] p-4">
        <h2 className="text-sm font-medium">Your class</h2>
        <p className="mt-1 rounded-xl bg-[var(--growth-green-tint)] p-3 text-sm" role="status">
          ✅ Enrolled in <strong>{enrollment.title}</strong>
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Join your class" className="mt-4 rounded-2xl border border-[color:var(--app-border)] p-4">
      <h2 className="text-sm font-medium">Join your class</h2>
      <p className="mt-1 text-xs text-app-muted">
        Have a class join code from your teacher? Enter it to connect your progress to the class.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          aria-label="Class join code"
          placeholder="e.g. K7QMP2"
          maxLength={8}
          className="min-h-12 w-40 rounded-xl border border-[color:var(--app-border)] p-3 font-mono text-sm uppercase tracking-widest"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button
          type="button"
          onClick={join}
          disabled={busy || code.trim().length < 6}
          className="btn-primary min-h-12 px-5 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Joining…" : "Join class"}
        </button>
      </div>
      {error && (
        <p className="mt-2 rounded-xl bg-[var(--coral-tint)] p-3 text-sm text-[var(--deep-ink)]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

const DIMENSIONS = [
  ["conceptual", "Conceptual"],
  ["procedural", "Procedural"],
  ["graphInterpretation", "Graph reading"],
  ["formulaRecall", "Formula recall"],
  ["transfer", "Transfer"],
] as const;

export function ProgressClient() {
  const state = useLearnerState();
  if (!state) return <p className="p-4 text-sm text-app-muted">Loading progress…</p>;

  const nowISO = new Date().toISOString();
  const studied = concepts.filter((c) => state.masteryBySlug[c.slug]?.evidenceCount);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Progress</h1>
        <p className="text-sm text-app-muted">XP: {state.xp}</p>
      </div>
      <p className="mt-1 text-sm text-app-muted">
        Mastery, not completion — each dimension is estimated separately from real evidence.
      </p>

      {/* join your class (D-012) */}
      <JoinClassCard />

      {studied.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-[color:var(--app-border)] p-4 text-sm text-app-muted">
          No evidence yet. Mastery appears here as you learn and practice.
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {studied.map((c) => {
            const m = state.masteryBySlug[c.slug];
            const retention = retentionAt(m, nowISO);
            const mc = dominantMisconception(m);
            const mcInfo = mc ? misconceptions.find((x) => x.slug === mc.slug) : null;
            return (
              <li key={c.slug} className="rounded-2xl border border-[color:var(--app-border)] p-4">
                <h2 className="font-medium">{c.name}</h2>
                <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {DIMENSIONS.map(([key, label]) => (
                    <div key={key}>
                      <dt className="text-xs text-app-muted">{label}</dt>
                      <dd>
                        <div className="mt-1 h-2 w-full rounded-full bg-[color:var(--app-surface-2)]" role="img" aria-label={`${label} ${Math.round(m[key] * 100)}%`}>
                          <div className="h-2 rounded-full bg-[color:var(--duo-green)]" style={{ width: `${Math.round(m[key] * 100)}%` }} />
                        </div>
                        <span className="text-xs">{Math.round(m[key] * 100)}%</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-app-muted">
                  Retention estimate now: {Math.round(retention * 100)}% · Confidence: {Math.round(m.confidence * 100)}% ·
                  Evidence events: {m.evidenceCount}
                </p>
                {mcInfo && (
                  <p className="mt-2 rounded-xl bg-[color:rgba(255,150,0,0.12)] p-2 text-xs text-[color:#ffb060]">
                    Active mix-up to clear: {mcInfo.description}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Achievements state={state} />

      {state.auditLog.length > 0 && (
        <details className="mt-6 rounded-2xl border border-[color:var(--app-border)] p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Evidence audit trail ({state.auditLog.length}) — every mastery change is explainable
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-app">
            {[...state.auditLog].reverse().slice(0, 30).map((a, i) => (
              <li key={i}>
                {new Date(a.at).toLocaleString()} · {a.conceptSlug} · {a.correct ? "correct" : "incorrect"} · signal{" "}
                {a.signalQuality.toFixed(2)}
                {a.guessLikelihood > 0 ? ` · guess-risk ${a.guessLikelihood.toFixed(2)}` : ""} ·{" "}
                {Object.entries(a.dimensionDeltas)
                  .map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}`)
                  .join(", ")}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section aria-label="Personalization" className="mt-6 rounded-2xl border border-[color:var(--app-border)] p-4">
        <h2 className="text-sm font-medium">Personalization — you&apos;re in control (edit anytime)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Explanation order (changes lesson step order only)
            <select
              className="mt-1 block w-full rounded-xl border border-[color:var(--app-border)] p-3"
              value={state.profile.explanationOrder}
              onChange={(e) =>
                mutateLearnerState((s) =>
                  updateProfile(s, { explanationOrder: e.target.value as typeof s.profile.explanationOrder })
                )
              }
            >
              <option value="visual_first">Picture first</option>
              <option value="math_first">Mathematics first</option>
              <option value="text_first">Plain words first</option>
            </select>
          </label>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-[color:var(--app-border)] p-3 text-sm">
            <input
              type="checkbox"
              checked={state.profile.readingLevel === "simpler"}
              onChange={(e) =>
                mutateLearnerState((s) =>
                  updateProfile(s, { readingLevel: e.target.checked ? "simpler" : "standard" })
                )
              }
            />
            Prefer simpler wording where available
          </label>
        </div>
      </section>

      <div className="mt-6">
        <button
          type="button"
          className="btn-danger min-h-12 px-4 text-sm"
          onClick={() => {
            if (window.confirm("Reset all personalization and progress? This cannot be undone.")) {
              mutateLearnerState(() => resetLearnerState());
            }
          }}
        >
          Reset my personalization &amp; progress
        </button>
        <p className="mt-1 text-xs text-app-muted">You control your data — this clears everything stored locally (IDEA-024).</p>
      </div>
    </div>
  );
}
