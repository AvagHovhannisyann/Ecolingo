"use client";

/**
 * Progress — mastery is multi-dimensional (§22): the learner is never
 * reduced to one number. Includes the audit trail (GATE-006 made visible)
 * and the personalization reset control (IDEA-024).
 */

import { concepts, misconceptions } from "@/content/econ13210";
import { dominantMisconception, retentionAt } from "@/lib/engine/mastery";
import { resetLearnerState, updateProfile } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { Achievements } from "./Achievements";

const DIMENSIONS = [
  ["conceptual", "Conceptual"],
  ["procedural", "Procedural"],
  ["graphInterpretation", "Graph reading"],
  ["formulaRecall", "Formula recall"],
  ["transfer", "Transfer"],
] as const;

export function ProgressClient() {
  const state = useLearnerState();
  if (!state) return <p className="p-4 text-sm text-gray-500">Loading progress…</p>;

  const nowISO = new Date().toISOString();
  const studied = concepts.filter((c) => state.masteryBySlug[c.slug]?.evidenceCount);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Progress</h1>
        <p className="text-sm text-gray-600">XP: {state.xp}</p>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Mastery, not completion — each dimension is estimated separately from real evidence.
      </p>

      {studied.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-gray-200 p-4 text-sm text-gray-600">
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
              <li key={c.slug} className="rounded-2xl border border-gray-300 p-4">
                <h2 className="font-medium">{c.name}</h2>
                <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {DIMENSIONS.map(([key, label]) => (
                    <div key={key}>
                      <dt className="text-xs text-gray-600">{label}</dt>
                      <dd>
                        <div className="mt-1 h-2 w-full rounded-full bg-gray-200" role="img" aria-label={`${label} ${Math.round(m[key] * 100)}%`}>
                          <div className="h-2 rounded-full bg-gray-900" style={{ width: `${Math.round(m[key] * 100)}%` }} />
                        </div>
                        <span className="text-xs">{Math.round(m[key] * 100)}%</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-gray-600">
                  Retention estimate now: {Math.round(retention * 100)}% · Confidence: {Math.round(m.confidence * 100)}% ·
                  Evidence events: {m.evidenceCount}
                </p>
                {mcInfo && (
                  <p className="mt-2 rounded-xl bg-orange-50 p-2 text-xs text-orange-900">
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
        <details className="mt-6 rounded-2xl border border-gray-200 p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Evidence audit trail ({state.auditLog.length}) — every mastery change is explainable
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-gray-700">
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

      <section aria-label="Personalization" className="mt-6 rounded-2xl border border-gray-200 p-4">
        <h2 className="text-sm font-medium">Personalization — you&apos;re in control (edit anytime)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Explanation order (changes lesson step order only)
            <select
              className="mt-1 block w-full rounded-xl border border-gray-400 p-3"
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
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-gray-300 p-3 text-sm">
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
          className="min-h-12 rounded-xl border border-red-300 px-4 text-sm text-red-700"
          onClick={() => {
            if (window.confirm("Reset all personalization and progress? This cannot be undone.")) {
              mutateLearnerState(() => resetLearnerState());
            }
          }}
        >
          Reset my personalization &amp; progress
        </button>
        <p className="mt-1 text-xs text-gray-500">You control your data — this clears everything stored locally (IDEA-024).</p>
      </div>
    </div>
  );
}
