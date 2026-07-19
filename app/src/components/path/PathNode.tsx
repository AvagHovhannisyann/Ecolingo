"use client";

/**
 * A single node on the skill path (D-020). Big circular 3D node (~70px) with a
 * chunky bottom edge that collapses on :active — the .btn-primary press
 * technique. Node glyphs (star / lock / review) are inline SVG UI, never raster
 * art (GATE-002). Every node has ≥44px target, a focus-visible ring, and an
 * accessible name; the current node carries aria-current="step".
 *
 * Node type → visual:
 *   done    → gold circle + white star (link back to the lesson)
 *   current → green circle + white star, pulsing halo, floating START tooltip
 *   locked  → gray circle + lock glyph, NOT interactive, caption explains unlock
 *   review  → blue circle + ⟳ glyph, links to /review, reason in its label
 */

import Image from "next/image";
import Link from "next/link";

function StarIcon() {
  return (
    <svg className="sp-node__icon" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <path d="M12 2.6l2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 17l-5.6 3.1 1.3-6.3-4.8-4.3 6.4-.7z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="sp-node__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" strokeLinecap="round" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg className="sp-node__icon" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-.6 3" strokeLinecap="round" />
      <path d="M20 5v6h-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface PathNodeProps {
  kind: "done" | "current" | "locked" | "review";
  offsetX: number;
  ariaLabel: string;
  href?: string;
  /** locked-lesson caption: the lesson title + what unlocks it */
  captionTitle?: string;
  captionHint?: string;
  /** current node extras */
  mascotSrc?: string;
  mascotSide?: "left" | "right";
}

export function PathNode({
  kind,
  offsetX,
  ariaLabel,
  href,
  captionTitle,
  captionHint,
  mascotSrc,
  mascotSide = "right",
}: PathNodeProps) {
  const rowStyle = { "--sp-x": `${offsetX}px` } as React.CSSProperties;
  const isCurrent = kind === "current";

  const glyph =
    kind === "locked" ? <LockIcon /> : kind === "review" ? <ReviewIcon /> : <StarIcon />;

  const nodeInner = (
    <>
      {isCurrent && <span className="sp-halo" aria-hidden="true" />}
      {isCurrent && (
        <span className="sp-tip" aria-hidden="true">
          Start
        </span>
      )}
      {glyph}
    </>
  );

  return (
    <li className="sp-row" style={rowStyle}>
      {mascotSrc && (
        <Image
          src={mascotSrc}
          alt=""
          role="presentation"
          width={118}
          height={118}
          className={`sp-mascot sp-mascot--${mascotSide}`}
        />
      )}

      {kind === "locked" ? (
        <button type="button" className="sp-node sp-node--locked" aria-label={ariaLabel} disabled>
          {glyph}
        </button>
      ) : (
        <Link
          href={href ?? "#"}
          className={`sp-node sp-node--${kind}`}
          aria-label={ariaLabel}
          aria-current={isCurrent ? "step" : undefined}
        >
          {nodeInner}
        </Link>
      )}

      {(captionTitle || captionHint) && (
        <span className="sp-caption">
          {captionTitle && <span className="sp-caption__title">{captionTitle}</span>}
          {captionHint && <span className="sp-caption__hint">{captionHint}</span>}
        </span>
      )}
    </li>
  );
}
