"use client";

/**
 * Course map (IDEA-135 visible progress) — all eight worlds with their
 * Higgsfield-generated art. Unavailable worlds are honestly labelled as
 * awaiting teacher materials; nothing pretends to be playable.
 */

import Image from "next/image";
import Link from "next/link";
import { worlds } from "@/content/econ13210/worlds";
import { concepts } from "@/content/econ13210";
import type { LearnerState } from "@/lib/learner-state";

export function WorldMap({ state }: { state: LearnerState }) {
  const masteredIn = (worldNumber: number) =>
    concepts.filter(
      (c) => c.world === worldNumber && (state.masteryBySlug[c.slug]?.conceptual ?? 0) >= 0.6
    ).length;
  const totalIn = (worldNumber: number) => concepts.filter((c) => c.world === worldNumber).length;

  return (
    <section aria-label="Course map" className="mt-8">
      <h2 className="text-lg font-semibold">Course map — ECON 13210</h2>
      <p className="mt-1 text-sm text-gray-600">
        Eight worlds. World 2 is playable in this demo; the rest unlock as your teacher&apos;s materials are
        compiled into lessons.
      </p>
      <ol className="mt-3 grid gap-4 sm:grid-cols-2">
        {worlds.map((w) => {
          const total = totalIn(w.number);
          const mastered = masteredIn(w.number);
          const card = (
            <div
              className={`relative overflow-hidden rounded-2xl border ${
                w.available ? "border-gray-900" : "border-gray-200"
              }`}
            >
              <Image
                src={w.art}
                alt=""
                role="presentation"
                width={1344}
                height={768}
                className={`h-32 w-full object-cover ${w.available ? "" : "opacity-60 grayscale-[35%]"}`}
              />
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/75 via-black/20 to-transparent p-3 text-white">
                <p className="text-[11px] uppercase tracking-wide opacity-80">
                  World {w.number}
                  {w.available
                    ? total > 0
                      ? ` · ${mastered}/${total} concepts strong`
                      : ""
                    : " · awaiting course upload"}
                </p>
                <p className="font-semibold leading-tight">{w.title}</p>
                <p className="text-xs opacity-90">{w.tagline}</p>
              </div>
              {!w.available && (
                <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[11px] text-gray-700">
                  🔒 Planned
                </span>
              )}
            </div>
          );
          return (
            <li key={w.slug}>
              {w.available ? (
                <Link href="/" aria-label={`World ${w.number}: ${w.title} (available)`} className="block focus:outline-2">
                  {card}
                </Link>
              ) : (
                card
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
