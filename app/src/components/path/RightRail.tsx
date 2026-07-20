"use client";

/**
 * Desktop right rail beside the skill path (from the Duolingo iPad reference):
 * a stack of bordered cards — daily quests with live progress, the learner's
 * real stats, and the teacher promo slot. Hidden below the desktop breakpoint;
 * the mobile experience keeps its dedicated /quests and /progress routes.
 *
 * Every number here is a pure read of the same engine state those routes use
 * (questProgress / EconomyState / xp) — the rail invents nothing.
 */

import Image from "next/image";
import Link from "next/link";
import { DAILY_QUESTS, questProgress } from "@/lib/engine/economy";
import type { LearnerState } from "@/lib/learner-state";

export function RightRail({ state }: { state: LearnerState }) {
  const nowISO = new Date().toISOString();
  const quests = DAILY_QUESTS.slice(0, 2).map((q) => ({
    quest: q,
    progress: questProgress(state.economy, q, nowISO),
  }));

  return (
    <aside className="hidden w-80 shrink-0 space-y-4 xl:block" aria-label="Your day at a glance">
      {/* daily quests preview */}
      <section className="rounded-2xl border-2 border-[color:var(--app-border)] p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-black">Daily Quests</h2>
          <Link href="/quests" className="text-xs font-extrabold uppercase tracking-wide text-[color:var(--duo-blue,#1cb0f6)]">
            View all
          </Link>
        </div>
        <ul className="mt-3 space-y-3">
          {quests.map(({ quest, progress }) => {
            const pct = Math.round(progress.fraction * 100);
            return (
              <li key={quest.id} className="flex items-center gap-3">
                <Image
                  src={progress.claimable || progress.claimed ? "/art-v2/chest-open.webp" : "/art-v2/chest-closed.webp"}
                  alt=""
                  width={80}
                  height={80}
                  className="h-10 w-10 shrink-0 object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{quest.name}</p>
                  <div
                    className="mt-1 h-3 overflow-hidden rounded-full bg-[color:var(--app-surface-2)]"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={progress.target}
                    aria-valuenow={progress.current}
                    aria-label={`${quest.name}: ${progress.current} of ${progress.target}`}
                  >
                    <div className="h-full rounded-full bg-[var(--duo-gold)]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className="shrink-0 text-xs font-bold text-app-muted" aria-hidden="true">
                  {progress.current}/{progress.target}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* real stats — same numbers as /progress */}
      <section className="rounded-2xl border-2 border-[color:var(--app-border)] p-4">
        <h2 className="text-base font-black">Your stats</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[color:var(--app-surface-2)] p-2">
            <dt className="text-[0.65rem] font-extrabold uppercase tracking-wide text-app-muted">Streak</dt>
            <dd className="mt-1 text-lg font-black text-[color:#ff9600]">{state.economy.streakCount}</dd>
          </div>
          <div className="rounded-xl bg-[color:var(--app-surface-2)] p-2">
            <dt className="text-[0.65rem] font-extrabold uppercase tracking-wide text-app-muted">XP</dt>
            <dd className="mt-1 text-lg font-black text-[color:var(--duo-gold)]">{state.xp}</dd>
          </div>
          <div className="rounded-xl bg-[color:var(--app-surface-2)] p-2">
            <dt className="text-[0.65rem] font-extrabold uppercase tracking-wide text-app-muted">Gems</dt>
            <dd className="mt-1 text-lg font-black text-[color:var(--duo-blue,#1cb0f6)]">{state.economy.gems}</dd>
          </div>
        </dl>
        <Link href="/progress" className="mt-3 block text-center text-xs font-extrabold uppercase tracking-wide text-[color:var(--duo-blue,#1cb0f6)]">
          See full progress
        </Link>
      </section>

      {/* promo slot — the teacher entry point */}
      <section className="rounded-2xl border-2 border-[color:var(--app-border)] p-4">
        <div className="flex items-center gap-3">
          <Image src="/art-v2/eco-books.webp" alt="" width={96} height={96} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
          <div>
            <h2 className="text-base font-black">Teach a course</h2>
            <p className="mt-0.5 text-xs text-app-muted">
              Upload your materials and Ecolingo compiles them into a path like this one.
            </p>
          </div>
        </div>
        <Link href="/teach" className="btn-secondary mt-3 block min-h-10 py-2 text-center text-sm font-extrabold uppercase">
          Open teacher workspace
        </Link>
      </section>
    </aside>
  );
}
