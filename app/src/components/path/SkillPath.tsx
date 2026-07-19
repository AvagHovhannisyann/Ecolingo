"use client";

/**
 * The winding skill path (D-020). Renders the ordered lessons as big circular
 * nodes that gently wind left/center/right down the page, with a review gate
 * node after the current lesson (when the scheduler has due reviews), a reward
 * chest milestone after every two completed lessons, the Eco mascot beside the
 * current node, and a trophy medal at the end.
 *
 * Gating and scheduling are decided upstream (HomeClient); this component owns
 * only the layout/visuals. Chest, mascot and medal are decorative art (art-v2)
 * — never truth-critical (GATE-002). The medal is desaturated until every
 * lesson is complete.
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
  /** reason text for the top due review, or null when nothing is due */
  dueReviewReason: string | null;
  /** the Eco pose beside the current node */
  mascotSrc: string;
}

// gentle wind: center → right → center → left, repeating
const WIND = [0, 48, 0, -48];

export function SkillPath({ rows, dueReviewReason, mascotSrc }: SkillPathProps) {
  const completedCount = rows.filter((r) => r.status === "done").length;
  const allComplete = rows.length > 0 && rows.every((r) => r.status === "done");

  // Fast-forward target (the Duolingo "JUMP HERE?" pill): the first locked
  // lesson at least two steps past the current one. The node stays visually
  // locked — the pill is an explicit, labeled shortcut for confident learners
  // (the adaptive engine absorbs the harder entry).
  const currentIdx = rows.findIndex((r) => r.status === "current");
  const jumpLessonId =
    currentIdx >= 0
      ? rows.find((r, i) => i >= currentIdx + 2 && r.status === "locked")?.lesson.id ?? null
      : null;

  // Build the visual sequence: lesson (+ review after current) with a chest
  // milestone after every two lessons (not at the very end), then the medal.
  type Item =
    | { kind: "lesson"; row: LessonRow }
    | { kind: "review" }
    | { kind: "chest"; earned: boolean }
    | { kind: "medal" };
  const items: Item[] = [];
  rows.forEach((row, i) => {
    items.push({ kind: "lesson", row });
    if (row.status === "current" && dueReviewReason) items.push({ kind: "review" });
    if ((i + 1) % 2 === 0 && i < rows.length - 1) {
      items.push({ kind: "chest", earned: completedCount >= i + 1 });
    }
  });
  items.push({ kind: "medal" });

  return (
    <ol className="sp-path" aria-label="Your learning path">
      {items.map((item, idx) => {
        const offsetX = WIND[idx % WIND.length];

        if (item.kind === "review") {
          return (
            <PathNode
              key={`review-${idx}`}
              kind="review"
              offsetX={offsetX}
              href="/review"
              ariaLabel={`Review due. ${dueReviewReason ?? ""}`}
            />
          );
        }

        if (item.kind === "chest") {
          const src = item.earned ? "/art-v2/chest-open.webp" : "/art-v2/chest-closed.webp";
          const label = item.earned
            ? "Reward chest earned — open your quests"
            : "Reward chest — complete the next lessons to earn it";
          return (
            <li className="sp-row" style={{ "--sp-x": `${offsetX}px` } as React.CSSProperties} key={`chest-${idx}`}>
              <Link href="/quests" className="sp-chest" aria-label={label}>
                <Image src={src} alt="" role="presentation" width={54} height={54} />
              </Link>
            </li>
          );
        }

        if (item.kind === "medal") {
          return (
            <li className="sp-row" style={{ "--sp-x": `${offsetX}px` } as React.CSSProperties} key="medal">
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
          );
        }

        // lesson node
        const { lesson, status, prereqNames } = item.row;
        const href = `/lesson/${lesson.id}`;

        if (status === "locked") {
          const hint =
            prereqNames.length > 0 ? `Unlocks after: ${prereqNames.join(", ")}` : "Locked";
          const isJump = lesson.id === jumpLessonId;
          return (
            <PathNode
              key={lesson.id}
              kind="locked"
              offsetX={offsetX}
              ariaLabel={`${lesson.title} — locked. ${hint}`}
              captionTitle={lesson.title}
              captionHint={hint}
              jumpHref={isJump ? `/lesson/${lesson.id}` : undefined}
              jumpLabel={isJump ? `Jump ahead to ${lesson.title}` : undefined}
              mascotSrc={isJump ? "/art-v2/eco-think.webp" : undefined}
              mascotSide={offsetX > 0 ? "left" : "right"}
            />
          );
        }

        if (status === "current") {
          const mascotSide = offsetX > 0 ? "left" : "right";
          return (
            <PathNode
              key={lesson.id}
              kind="current"
              offsetX={offsetX}
              href={href}
              ariaLabel={`Start lesson: ${lesson.title}`}
              mascotSrc={mascotSrc}
              mascotSide={mascotSide}
            />
          );
        }

        // done — gold node, links back to replay the lesson
        return (
          <PathNode
            key={lesson.id}
            kind="done"
            offsetX={offsetX}
            href={href}
            ariaLabel={`${lesson.title} — completed. Review lesson`}
          />
        );
      })}
    </ol>
  );
}
