"use client";

/**
 * A single node on the skill path — Duolingo-roadmap parity (D-024). Big 3D
 * OVAL node (~92×74) with a chunky bottom edge that collapses on :active.
 * Node color comes from the unit theme (green/purple/teal CSS vars set by
 * the `sp-unit--*` class on the row); glyphs are inline SVG UI, never raster
 * art (GATE-002). Every node keeps ≥44px targets, focus rings, and an
 * accessible name; the current node carries aria-current="step".
 *
 * Node type → visual (matching the reference screenshots):
 *   done    → unit-color oval + white star (link back to the lesson)
 *   current → unit-color oval + white star, dark RING-PLATE around it,
 *             floating START tooltip, optional mascot on a shadow disc
 *   locked  → dark gray oval + gray star, NOT interactive, caption explains
 *   review  → blue oval + ⟳ glyph, links to /review
 *   jump    → unit-color oval + fast-forward glyph and the floating
 *             "JUMP HERE?" pill — the entry of a future unit
 */

import Image from "next/image";
import Link from "next/link";

function StarIcon({ dim = false }: { dim?: boolean }) {
  return (
    <svg className="sp-node__icon" viewBox="0 0 24 24" fill={dim ? "var(--app-border)" : "#fff"} aria-hidden="true">
      <path d="M12 2.6l2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 17l-5.6 3.1 1.3-6.3-4.8-4.3 6.4-.7z" />
    </svg>
  );
}

function FastForwardIcon() {
  return (
    <svg className="sp-node__icon" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
      <path d="M4.5 5.5v13l8-6.5zM12.5 5.5v13l8-6.5z" />
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
  kind: "done" | "current" | "locked" | "review" | "jump";
  /** unit theme class (sp-unit--green / --purple / --teal) */
  theme?: string;
  offsetX: number;
  ariaLabel: string;
  href?: string;
  /** locked-lesson caption: the lesson title + what unlocks it */
  captionTitle?: string;
  captionHint?: string;
  /** current node extras */
  mascotSrc?: string;
  mascotSide?: "left" | "right";
  /** extra row content (the unit's path-side character scene) */
  children?: React.ReactNode;
}

export function PathNode({
  kind,
  theme = "",
  offsetX,
  ariaLabel,
  href,
  captionTitle,
  captionHint,
  mascotSrc,
  mascotSide = "right",
  children,
}: PathNodeProps) {
  const rowStyle = { "--sp-x": `${offsetX}px` } as React.CSSProperties;
  const isCurrent = kind === "current";

  const glyph =
    kind === "locked" ? (
      <StarIcon dim />
    ) : kind === "review" ? (
      <ReviewIcon />
    ) : kind === "jump" ? (
      <FastForwardIcon />
    ) : (
      <StarIcon />
    );

  return (
    <li className={`sp-row ${theme}`} style={rowStyle}>
      {mascotSrc && (
        <span className={`sp-mascot sp-mascot--${mascotSide}`} aria-hidden="true">
          <Image src={mascotSrc} alt="" role="presentation" width={118} height={118} />
        </span>
      )}

      {kind === "locked" ? (
        <button type="button" className="sp-node sp-node--locked" aria-label={ariaLabel} disabled>
          {glyph}
        </button>
      ) : (
        <span className="sp-node-wrap">
          {isCurrent && <span className="sp-ring" aria-hidden="true" />}
          {isCurrent && (
            <span className="sp-tip" aria-hidden="true">
              Start
            </span>
          )}
          {kind === "jump" && (
            <span className="sp-tip sp-tip--jump" aria-hidden="true">
              Jump here?
            </span>
          )}
          <Link
            href={href ?? "#"}
            className={`sp-node sp-node--${kind}`}
            aria-label={ariaLabel}
            aria-current={isCurrent ? "step" : undefined}
          >
            {glyph}
          </Link>
        </span>
      )}

      {(captionTitle || captionHint) && (
        <span className="sp-caption">
          {captionTitle && <span className="sp-caption__title">{captionTitle}</span>}
          {captionHint && <span className="sp-caption__hint">{captionHint}</span>}
        </span>
      )}

      {children}
    </li>
  );
}
