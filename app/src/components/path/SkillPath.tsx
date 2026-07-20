"use client";

/**
 * The winding skill path — Duolingo-roadmap parity pass (D-024, from the four
 * reference screenshots): big 3D OVAL nodes with a ring-plate around the
 * current one, lessons chunked into UNITS with their own accent color
 * (green → purple → teal, cycling), a divider line carrying the unit's goal
 * text between units, a fast-forward "JUMP HERE?" oval opening every future
 * unit, and a cast character sitting beside each unit — full color for the
 * active unit, grayed-out silhouette for locked ones (exactly the reference's
 * treatment). Review gate, reward chests and the section trophy carry over.
 *
 * Gating and scheduling stay upstream (HomeClient); this file owns only
 * layout/visuals. All art is decorative (GATE-002); unit divider text is the
 * unit's first lesson title — real content, never invented copy.
 */

import Image from "next/image";
import Link from "next/link";
import type { Lesson } from "@/lib/engine/types";
import { PathNode } from "./PathNode";
import "./skill-path.css";

export type LessonStatus = "done" | "current" | "locked";

export interface LessonRow {
  lesson: Lesson;
  status: LessonStatus;
  /** human-readable prerequisites for a locked lesson */
  prereqNames: string[];
}

export interface SkillPathProps {
  rows: LessonRow[];
  /** AI-designed units from the ratified plan: goal title + lesson ids.
   *  When present and consistent, they drive the grouping and the banner
   *  text; otherwise the path falls back to fixed-size chunking. */
  units?: { title: string; lessonIds: string[] }[];
  /** reason text for the top due review, or null when nothing is due */
  dueReviewReason: string | null;
  /** the Eco pose beside the current node */
  mascotSrc: string;
}

/** Fallback lessons-per-unit when the plan carries no AI units. */
const UNIT_SIZE = 4;

/** Unit accent cycle from the reference: green → purple → teal. */
const UNIT_THEMES = ["sp-unit--green", "sp-unit--purple", "sp-unit--teal"];

/** Cast scenes sitting beside the path, cycled per unit — Higgsfield cutouts
 *  with transparent backgrounds so they sit directly on the surface like the
 *  reference; the active unit's scene gets the CSS idle bob. */
const UNIT_SCENES = [
  { src: "/art-cast/pip-scene.webp", side: "right" as const },
  { src: "/art-cast/lumi-scene.webp", side: "left" as const },
  { src: "/art-cast/bo-scene.webp", side: "right" as const },
];

// gentle wind: center → right → center → left, repeating
const WIND = [0, 48, 0, -48];

export function SkillPath({ rows, units: planUnits, dueReviewReason, mascotSrc }: SkillPathProps) {
  const allComplete = rows.length > 0 && rows.every((r) => r.status === "done");

  // Group lessons into units. The AI-designed units from the ratified plan
  // win when they cover the rows; otherwise fixed-size chunking. A unit is
  // "active" if it holds the current lesson, "done" when all done, else locked.
  const rowById = new Map(rows.map((r) => [r.lesson.id, r]));
  const units: { label: string | null; rows: LessonRow[] }[] = [];
  if (planUnits && planUnits.length > 0) {
    const grouped = new Set<string>();
    for (const u of planUnits) {
      const unitRows = u.lessonIds.map((id) => rowById.get(id)).filter((r): r is LessonRow => !!r);
      unitRows.forEach((r) => grouped.add(r.lesson.id));
      if (unitRows.length > 0) units.push({ label: u.title, rows: unitRows });
    }
    // Any lesson the plan's units missed still belongs on the path.
    const leftovers = rows.filter((r) => !grouped.has(r.lesson.id));
    if (leftovers.length > 0) units.push({ label: null, rows: leftovers });
  }
  if (units.length === 0) {
    for (let i = 0; i < rows.length; i += UNIT_SIZE)
      units.push({ label: null, rows: rows.slice(i, i + UNIT_SIZE) });
  }

  let globalIdx = 0; // continues the wind across units
  const windX = () => WIND[globalIdx++ % WIND.length];

  return (
    <ol className="sp-path" aria-label="Your learning path">
      {units.map((unit, u) => {
        const theme = UNIT_THEMES[u % UNIT_THEMES.length];
        const unitDone = unit.rows.every((r) => r.status === "done");
        const unitActive = unit.rows.some((r) => r.status === "current");
        const unitLocked = !unitDone && !unitActive;
        const scene = UNIT_SCENES[u % UNIT_SCENES.length];
        const bannerTitle = unit.label ?? unit.rows[0].lesson.title;

        const items: React.ReactNode[] = [];

        // Unit banner (skip before the first unit): a filled, unit-colored
        // card carrying "UNIT N" and the AI-designed goal for this stretch.
        if (u > 0) {
          items.push(
            <li key={`banner-${u}`} className={`sp-banner ${theme}${unitLocked ? " sp-banner--locked" : ""}`}>
              <span className="sp-banner__eyebrow">Unit {u + 1}</span>
              <span className="sp-banner__title">{bannerTitle}</span>
            </li>
          );
        }

        unit.rows.forEach((row, i) => {
          const { lesson, status, prereqNames } = row;
          const offsetX = windX();
          const href = `/lesson/${lesson.id}`;
          // The character scene sits beside the unit's second node.
          const sceneHere = i === Math.min(1, unit.rows.length - 1);

          const sceneEl = sceneHere ? (
            <span
              className={`sp-scene sp-scene--${scene.side}${unitLocked ? " sp-scene--locked" : ""}${
                unitActive ? " sp-scene--active" : ""
              }`}
              aria-hidden="true"
            >
              <Image src={scene.src} alt="" role="presentation" width={200} height={200} />
            </span>
          ) : null;

          if (status === "locked" && i === 0 && u > 0) {
            // Fast-forward entry of a future unit (the reference's "JUMP
            // HERE?" oval) — unit-colored, links straight into the lesson.
            items.push(
              <PathNode
                key={lesson.id}
                kind="jump"
                theme={theme}
                offsetX={offsetX}
                href={href}
                ariaLabel={`Jump ahead to ${lesson.title}`}
              >
                {sceneEl}
              </PathNode>
            );
            return;
          }

          if (status === "locked") {
            const hint = prereqNames.length > 0 ? `Unlocks after: ${prereqNames.join(", ")}` : "Locked";
            items.push(
              <PathNode
                key={lesson.id}
                kind="locked"
                theme={theme}
                offsetX={offsetX}
                ariaLabel={`${lesson.title} — locked. ${hint}`}
                captionTitle={lesson.title}
                captionHint={hint}
              >
                {sceneEl}
              </PathNode>
            );
            return;
          }

          if (status === "current") {
            items.push(
              <PathNode
                key={lesson.id}
                kind="current"
                theme={theme}
                offsetX={offsetX}
                href={href}
                ariaLabel={`Start lesson: ${lesson.title}`}
                mascotSrc={mascotSrc}
                mascotSide={offsetX > 0 ? "left" : "right"}
              >
                {sceneEl}
              </PathNode>
            );
            // Review gate right after the current node when reviews are due.
            if (dueReviewReason) {
              items.push(
                <PathNode
                  key={`review-${u}-${i}`}
                  kind="review"
                  theme={theme}
                  offsetX={windX()}
                  href="/review"
                  ariaLabel={`Review due. ${dueReviewReason}`}
                />
              );
            }
            return;
          }

          // done — unit-colored node linking back to replay
          items.push(
            <PathNode
              key={lesson.id}
              kind="done"
              theme={theme}
              offsetX={offsetX}
              href={href}
              ariaLabel={`${lesson.title} — completed. Review lesson`}
            >
              {sceneEl}
            </PathNode>
          );
        });

        // Reward chest closing each unit except the last (earned once the
        // unit is complete) — same economy semantics as before.
        if (u < units.length - 1) {
          const earned = unitDone;
          items.push(
            <li
              className={`sp-row ${theme}`}
              style={{ "--sp-x": `${windX()}px` } as React.CSSProperties}
              key={`chest-${u}`}
            >
              <Link href="/quests" className={`sp-chest${earned ? "" : " sp-chest--locked"}`} aria-label={
                earned ? "Reward chest earned — open your quests" : "Reward chest — complete this unit to earn it"
              }>
                <Image
                  src={earned ? "/art-v2/chest-open.webp" : "/art-v2/chest-closed.webp"}
                  alt=""
                  role="presentation"
                  width={72}
                  height={72}
                />
              </Link>
            </li>
          );
        }

        return items;
      })}

      {/* section trophy */}
      <li className="sp-row" style={{ "--sp-x": `${windX()}px` } as React.CSSProperties} key="medal">
        <span
          className={`sp-medal${allComplete ? "" : " sp-medal--locked"}`}
          role="img"
          aria-label={
            allComplete
              ? "Trophy earned — you completed every lesson in this section"
              : "Section trophy — locked until every lesson is complete"
          }
        >
          <Image src="/art-v2/medal-gold.webp" alt="" role="presentation" width={72} height={72} />
        </span>
      </li>
    </ol>
  );
}
