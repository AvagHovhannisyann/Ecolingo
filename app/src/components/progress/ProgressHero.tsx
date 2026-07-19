"use client";

/**
 * Trophy-room hero (D-020): Eco cheering the learner on, the page title, and
 * the streak flame + XP chips wired to real learner state. Artwork is
 * decorative (alt="", §17.2) — the numbers next to it carry the meaning.
 */

import Image from "next/image";

export function ProgressHero({ streak, xp }: { streak: number; xp: number }) {
  return (
    <header className="pg-hero mt-2">
      <Image
        src="/art-v2/eco-encourage.webp"
        alt=""
        role="presentation"
        width={512}
        height={512}
        className="pg-hero-art art-enter"
      />
      <div>
        <h1 className="text-2xl font-black">Your progress</h1>
        <p className="mt-1 text-sm text-app-muted">
          Your trophy room — every bar and medal here is earned from real evidence, never from taps.
        </p>
        <div className="pg-hero-chips">
          <span className={`pg-chip${streak === 0 ? " pg-chip-cold" : ""}`} title="Study streak">
            <Image
              src="/art-v2/streak-flame.webp"
              alt=""
              role="presentation"
              width={128}
              height={128}
              className="pg-chip-img"
            />
            <span className="pg-gold">{streak}</span>
            <span className="pg-chip-unit">day streak</span>
          </span>
          <span className="pg-chip" title="XP earned from mastery evidence">
            <span className="pg-blue">{xp}</span>
            <span className="pg-chip-unit">XP</span>
          </span>
        </div>
      </div>
    </header>
  );
}
