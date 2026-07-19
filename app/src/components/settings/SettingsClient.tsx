"use client";

/**
 * /settings — the learner's controls in one place (D-020; Duolingo parity:
 * a real settings page instead of scattered editors).
 *
 * - Sound effects: a true switch (role="switch") over the persisted sfx flag.
 *   isSfxEnabled() reads localStorage, which the server render can't see, so
 *   the switch state comes through useSyncExternalStore (the same pattern as
 *   learner-store/SyncBadge): the server snapshot is null → a neutral "…"
 *   first paint, then the real value right after hydration — no mismatch.
 * - Daily goal + exam date: the SAME plan fields the home <details> editor and
 *   onboarding write, through the same updatePlan mutation — one source of
 *   truth, two doors.
 * - About your data: honest description of what is stored where (localStorage
 *   always; Supabase write-through only when the app is configured for it),
 *   with the live sync badge, not a promise.
 */

import { useState, useSyncExternalStore } from "react";
import { isSfxEnabled, playSfx, setSfxEnabled } from "@/lib/sfx";
import { updatePlan } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import { SyncBadge } from "@/components/SyncBadge";

const GOAL_PRESETS = [5, 10, 15, 20] as const;

function Card({ title, why, children }: { title: string; why: string; children: React.ReactNode }) {
  return (
    <section className="card mt-4 p-4">
      <h2 className="text-lg font-extrabold">{title}</h2>
      <p className="mt-0.5 text-sm text-app-muted">{why}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// Tiny external store over the persisted sfx flag: localStorage is the truth,
// these listeners re-render subscribers after a same-tab write (storage events
// only fire cross-tab).
const sfxListeners = new Set<() => void>();
function subscribeSfx(listener: () => void): () => void {
  sfxListeners.add(listener);
  return () => sfxListeners.delete(listener);
}
function notifySfx() {
  for (const l of sfxListeners) l();
}
const getServerSfxSnapshot = () => null;

function SoundCard() {
  // null on the server (localStorage is unreadable there) → neutral "…" first
  // paint; the client snapshot takes over right after hydration.
  const sfxOn = useSyncExternalStore<boolean | null>(subscribeSfx, isSfxEnabled, getServerSfxSnapshot);

  const toggle = () => {
    const next = !(sfxOn ?? isSfxEnabled());
    setSfxEnabled(next);
    notifySfx();
    // instant feedback when turning ON (after the flag flips, so it plays);
    // turning OFF is silent — that's the whole point of turning it off.
    if (next) playSfx("pop");
  };

  return (
    <Card
      title="Sound effects"
      why="Short synthesized blips for answers, lesson completes and rewards. No audio downloads; the preference is saved on this device."
    >
      <button
        type="button"
        role="switch"
        aria-checked={sfxOn === true}
        aria-label="Sound effects"
        className="settings-switch"
        onClick={toggle}
      >
        <span className="settings-switch-track" aria-hidden="true">
          <span className="settings-switch-knob" />
        </span>
        <span className="settings-switch-state">{sfxOn === null ? "…" : sfxOn ? "On" : "Off"}</span>
      </button>
    </Card>
  );
}

export function SettingsClient() {
  const state = useLearnerState();
  // Local draft for the custom minutes field so typing "15" doesn't get
  // clamped mid-keystroke; every commit still goes through updatePlan.
  const [minutesDraft, setMinutesDraft] = useState<string | null>(null);

  if (!state) {
    return (
      <div>
        <h1 className="text-2xl font-black">Settings</h1>
        <p className="mt-1 text-sm text-app-muted">Loading your settings…</p>
      </div>
    );
  }

  const minutes = state.plan.minutesPerDay;
  const setMinutes = (m: number) =>
    mutateLearnerState((s) => updatePlan(s, { ...s.plan, minutesPerDay: Math.max(5, m || 20) }));

  return (
    <div>
      <h1 className="text-2xl font-black">Settings</h1>
      <p className="mt-1 text-app-muted">Your controls — sound, daily goal, exam date, and where your data lives.</p>

      <SoundCard />

      <Card title="Daily goal" why="Why: sizes your daily plan — the scheduler fits lessons and reviews into these minutes.">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Daily goal presets">
          {GOAL_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              className="settings-chip"
              aria-pressed={minutes === m && minutesDraft === null}
              onClick={() => {
                setMinutesDraft(null);
                setMinutes(m);
              }}
            >
              {m} min
            </button>
          ))}
        </div>
        <label className="mt-3 block max-w-xs text-sm">
          Custom minutes per day (5–120)
          <input
            type="number"
            min={5}
            max={120}
            className="settings-input"
            value={minutesDraft ?? String(minutes)}
            onChange={(e) => {
              setMinutesDraft(e.target.value);
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 5 && n <= 120) setMinutes(n);
            }}
            onBlur={(e) => {
              setMinutes(Number(e.target.value));
              setMinutesDraft(null);
            }}
          />
        </label>
        <p className="mt-2 text-sm text-app-muted">
          Current goal: <strong className="text-app">{minutes} min/day</strong>
        </p>
      </Card>

      <Card title="Exam date" why="Why: reviews are back-planned from it — examinable concepts get pulled forward so nothing is met for the first time in exam week.">
        <label className="block max-w-xs text-sm">
          Exam date (optional)
          <input
            type="date"
            className="settings-input"
            value={state.plan.examDateISO?.slice(0, 10) ?? ""}
            onChange={(e) =>
              mutateLearnerState((s) =>
                updatePlan(s, { ...s.plan, examDateISO: e.target.value ? new Date(e.target.value).toISOString() : null })
              )
            }
          />
        </label>
        <p className="mt-2 text-sm text-app-muted">
          {state.plan.examDateISO
            ? `Exam set for ${state.plan.examDateISO.slice(0, 10)}. Clear the field to go back to pure retention timing.`
            : "No exam date set — reviews follow pure retention timing."}
        </p>
      </Card>

      <Card title="About your data" why="What is stored, and where.">
        <ul className="list-disc space-y-2 pl-5 text-sm">
          <li>
            Your progress — profile, plan, mastery, XP and the evidence log — is saved instantly in this
            browser&apos;s local storage. It stays available offline and never leaves this device on its own.
          </li>
          <li>
            When the app is configured with cloud sync (Supabase), changes are also backed up automatically
            under an anonymous session — no account, email or password; the session belongs to this browser.
            Without that configuration the app runs fully local, and if a backup attempt fails your progress
            still stays safe locally.
          </li>
          <li>
            The sound preference above is a device setting: it lives only in this browser and is not synced.
          </li>
          <li>Clearing this site&apos;s browsing data erases the locally stored progress.</li>
        </ul>
        <p className="mt-3 text-sm text-app-muted">
          Live sync status: <SyncBadge />
        </p>
      </Card>
    </div>
  );
}
