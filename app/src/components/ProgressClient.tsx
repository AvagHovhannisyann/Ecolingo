"use client";

/**
 * Progress — the learner's trophy room (D-020 dark game restyle).
 *
 * Mastery stays multi-dimensional (§22): every concept card shows the five
 * engine dimensions as separate labeled bars — never one blended number.
 * Concepts with zero evidence get an explicit "Not started" state instead of
 * empty bars pretending to be zeros. The audit trail (GATE-006 made visible),
 * class enrollment (D-012) and the personalization reset control (IDEA-024)
 * all carry over from the flat UI, restyled onto the dark surface.
 */

import Image from "next/image";
import { useEffect, useState } from "react";
import { concepts } from "@/content/active-course";
import { resetLearnerState, updateProfile } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { computeStreak } from "@/lib/stats";
import { fetchMyEnrollment, joinCourseByCode, type EnrollmentSummary } from "@/lib/course";
import { getSupabase } from "@/lib/supabase";
import { Achievements } from "./Achievements";
import { MasteryCard } from "./progress/MasteryCard";
import { ProgressHero } from "./progress/ProgressHero";
import { ReviewForecast } from "./progress/ReviewForecast";
import "./progress/progress.css";

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
      <section aria-label="Your class" className="card mt-6 p-4">
        <h2 className="text-base font-bold">Your class</h2>
        <p className="mt-1 text-sm text-app-muted" role="status">
          Checking your enrollment…
        </p>
      </section>
    );
  }

  if (phase === "unavailable") {
    return (
      <section aria-label="Your class" className="card mt-6 p-4">
        <h2 className="text-base font-bold">Your class</h2>
        <p className="mt-1 text-sm text-app-muted">
          Class features need the cloud connection — join with your class code once you&apos;re online.
        </p>
      </section>
    );
  }

  if (enrollment) {
    return (
      <section aria-label="Your class" className="card mt-6 p-4">
        <h2 className="text-base font-bold">Your class</h2>
        <p className="mt-2 rounded-xl bg-[var(--growth-green-tint)] p-3 text-sm" role="status">
          ✅ Enrolled in <strong>{enrollment.title}</strong>
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Join your class" className="card mt-6 p-4">
      <h2 className="text-base font-bold">Join your class</h2>
      <p className="mt-1 text-sm text-app-muted">
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
          className="min-h-12 w-40 rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 font-mono text-sm uppercase tracking-widest"
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
        <p className="mt-2 rounded-xl bg-[var(--coral-tint)] p-3 text-sm text-[var(--duo-red-text)]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function ProgressClient() {
  const state = useLearnerState();
  if (!state) return <p className="p-4 text-sm text-app-muted">Loading progress…</p>;

  const nowISO = new Date().toISOString();
  const streak = computeStreak(state.auditLog.map((a) => a.at), nowISO);
  const started = concepts.filter((c) => (state.masteryBySlug[c.slug]?.evidenceCount ?? 0) > 0);
  const notStarted = concepts.filter((c) => !(state.masteryBySlug[c.slug]?.evidenceCount ?? 0));

  return (
    <div>
      <ProgressHero streak={streak} xp={state.xp} />

      <section aria-label="Concept mastery" className="mt-8">
        <h2 className="text-lg font-bold">Concept mastery</h2>
        <p className="mt-1 text-sm text-app-muted">
          Five dimensions per concept, each estimated separately from real evidence — never one blended score.
        </p>

        {started.length === 0 ? (
          <div className="card mt-4 flex items-center gap-4 p-5">
            {/* Eco shrugging — honest empty state, no fake zero bars (§17.2 decorative) */}
            <Image
              src="/art-v2/eco-shrug.webp"
              alt=""
              role="presentation"
              width={512}
              height={512}
              className="art-enter h-20 w-20 shrink-0 rounded-2xl border-2 border-[color:var(--app-border)] object-cover"
            />
            <p className="text-sm text-app-muted">
              No evidence yet — mastery bars appear here as you learn and practice. Every concept below starts
              honestly at &quot;not started&quot;.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {started.map((c) => (
              <MasteryCard key={c.slug} concept={c} mastery={state.masteryBySlug[c.slug]} nowISO={nowISO} />
            ))}
          </ul>
        )}

        {notStarted.length > 0 && (
          <>
            <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-app-muted">Not started yet</h3>
            <ul className="pg-ns-grid">
              {notStarted.map((c) => (
                <li key={c.slug} className="card pg-ns">
                  <div className="pg-card-head">
                    <span className="font-bold">{c.name}</span>
                    <span className="pg-ns-chip">Not started</span>
                  </div>
                  <p className="mt-1 text-sm text-app-muted">
                    No evidence yet — bars appear once you practice this concept.
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* read-only scheduler forecast with §22 reasons */}
      <ReviewForecast state={state} nowISO={nowISO} />

      <Achievements state={state} />

      {state.auditLog.length > 0 && (
        <details className="card mt-8 p-4">
          <summary className="cursor-pointer text-sm font-bold">
            Evidence audit trail ({state.auditLog.length}) — every mastery change is explainable
          </summary>
          <ul className="pg-audit-list">
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

      {/* join your class (D-012) */}
      <JoinClassCard />

      <section aria-label="Personalization" className="card mt-6 p-4">
        <h2 className="text-base font-bold">Personalization — you&apos;re in control (edit anytime)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Explanation order (changes lesson step order only)
            <select
              className="mt-1 block w-full rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3"
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
          <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-[color:var(--app-border)] p-3 text-sm">
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

      <DangerZone />
    </div>
  );
}

/**
 * Guarded destruction (D-022): resetting personalization and progress wipes
 * streak, mastery, and plan — a one-tap confirm was far too easy to trigger
 * by accident. The control is collapsed by default and arms only after the
 * learner types RESET, with the full cost spelled out first (IDEA-024).
 */
function DangerZone() {
  const [confirmText, setConfirmText] = useState("");
  const armed = confirmText.trim().toUpperCase() === "RESET";
  return (
    <details className="mt-8 rounded-2xl border-2 border-[color:var(--app-border)] p-4">
      <summary className="cursor-pointer text-sm font-bold text-app-muted">Danger zone</summary>
      <div className="mt-3">
        <p className="text-sm text-app">
          <strong>Reset personalization &amp; progress.</strong> This erases your streak, every mastery
          record, your plan, and your survey answers on this device. There is no undo.
        </p>
        <label className="mt-3 block text-sm font-bold text-app-muted" htmlFor="reset-confirm">
          Type <code className="font-extrabold">RESET</code> to enable the button
        </label>
        <input
          id="reset-confirm"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          className="mt-1 block w-full max-w-xs rounded-xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface-2)] p-3 text-sm font-bold tracking-widest"
        />
        <button
          type="button"
          disabled={!armed}
          className="btn-danger mt-3 min-h-12 px-4 text-sm disabled:opacity-40"
          onClick={() => {
            if (!armed) return;
            mutateLearnerState(() => resetLearnerState());
            setConfirmText("");
          }}
        >
          Erase everything on this device
        </button>
        <p className="mt-1 text-xs text-app-muted">You control your data — this clears everything stored locally (IDEA-024).</p>
      </div>
    </details>
  );
}
