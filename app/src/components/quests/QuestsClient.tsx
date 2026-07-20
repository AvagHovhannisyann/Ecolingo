"use client";

/**
 * Quests view (D-020, Wave 2 Stream K). A Duolingo-style daily/monthly quest
 * board. Every number rendered here comes from the pure economy engine
 * (questProgress) — there are no fabricated values. Claiming goes through
 * claimQuestOnState, which guards double-claims per period.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { AmbientArt } from "../AmbientHero";
import {
  DAILY_QUESTS,
  MONTHLY_QUESTS,
  msUntilNextUTCMidnight,
  questProgress,
  type Quest,
  type QuestProgress,
} from "@/lib/engine/economy";
import { claimQuestOnState } from "@/lib/learner-state";
import { mutateLearnerState, useLearnerState } from "@/lib/learner-store";
import "./quests.css";
import { LoadingScreen } from "../LoadingScreen";

/** Live H:MM:SS countdown to the next UTC midnight (when daily quests reset). */
function useMidnightCountdown(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const ms = msUntilNextUTCMidnight(new Date().toISOString());
      const total = Math.floor(ms / 1000);
      const hh = Math.floor(total / 3600);
      const mm = Math.floor((total % 3600) / 60);
      const ss = total % 60;
      const pad = (n: number) => String(n).padStart(2, "0");
      setLabel(`${pad(hh)}:${pad(mm)}:${pad(ss)}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return label;
}

function QuestCard({ quest, progress }: { quest: Quest; progress: QuestProgress }) {
  const { current, target, claimable, claimed, fraction } = progress;
  const pct = Math.round(fraction * 100);

  const onClaim = () => {
    const nowISO = new Date().toISOString();
    mutateLearnerState((s) => claimQuestOnState(s, quest.id, nowISO));
  };

  return (
    <li className="card flex items-center gap-4 p-4">
      {/* chunky reward chest — closed until the quest is claimable/claimed */}
      <Image
        src={claimable || claimed ? "/art-v2/chest-open.webp" : "/art-v2/chest-closed.webp"}
        alt=""
        width={128}
        height={128}
        className={`h-16 w-16 shrink-0 object-contain ${claimable ? "chest-claimable" : ""}`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-base font-black text-app">{quest.name}</h3>
          <span className="shrink-0 text-sm font-bold text-app-muted" aria-hidden>
            {current} / {target}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <div
            className="quest-bar-track flex-1"
            role="progressbar"
            aria-valuenow={current}
            aria-valuemin={0}
            aria-valuemax={target}
            aria-label={`${quest.name}: ${current} of ${target}`}
          >
            <div className="quest-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-xs font-bold text-[color:var(--duo-gold)]" title="Gem reward">
            +{quest.reward}
          </span>
        </div>
      </div>

      {claimed ? (
        <span className="btn-primary shrink-0 opacity-70" aria-disabled="true" role="status">
          Claimed
        </span>
      ) : claimable ? (
        <button type="button" className="btn-primary btn-press shrink-0" onClick={onClaim}>
          CLAIM
        </button>
      ) : (
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled
          aria-disabled="true"
          title="Finish the quest to claim its reward"
        >
          CLAIM
        </button>
      )}
    </li>
  );
}

export function QuestsClient() {
  const state = useLearnerState();
  const countdown = useMidnightCountdown();
  // nowISO is recomputed each render; quest progress is a pure read of it.
  const nowISO = new Date().toISOString();

  if (!state) return <LoadingScreen label="Loading your quests…" />;

  return (
    <section className="mt-2 pb-10">
      {/* hero row — Pip on its book stack (Higgsfield loop) + reset countdown */}
      <div className="flex items-center gap-4">
        <AmbientArt
          videoSrc="/art-cast/pip-sitting-loop.mp4"
          imageSrc="/art-cast/pip-sitting.webp"
          width={480}
          height={480}
          className="art-enter h-20 w-20 shrink-0 rounded-2xl object-cover"
        />
        <div>
          <h1 className="text-2xl font-black text-app">Daily quests</h1>
          <p className="mt-1 text-sm text-app-muted">
            Resets in{" "}
            <span className="font-bold tabular-nums text-app" suppressHydrationWarning>
              {countdown ?? "—:—:—"}
            </span>
          </p>
        </div>
      </div>

      <ul className="mt-6 space-y-3">
        {DAILY_QUESTS.map((q) => (
          <QuestCard key={q.id} quest={q} progress={questProgress(state.economy, q, nowISO)} />
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-black text-app">Monthly</h2>
      <ul className="mt-4 space-y-3">
        {MONTHLY_QUESTS.map((q) => (
          <QuestCard key={q.id} quest={q} progress={questProgress(state.economy, q, nowISO)} />
        ))}
      </ul>
    </section>
  );
}
