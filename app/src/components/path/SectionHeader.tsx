"use client";

/**
 * Sticky section header for the skill path (D-020). A filled green card with an
 * eyebrow ("SECTION 1 · SOLOW GROWTH"), the current lesson title (a link to that
 * lesson — the primary "start" affordance and the smoke test's click target),
 * and a guidebook icon linking to course progress.
 *
 * Text is deep-navy on green (AA ~9:1), not white — the white-on-green pairing
 * is reserved for .btn-primary (D-013). Nothing truth-critical here (GATE-002).
 */

import Link from "next/link";

export function SectionHeader({
  eyebrow,
  title,
  href,
}: {
  eyebrow: string;
  title: string;
  href: string | null;
}) {
  return (
    <div className="sp-header">
      <div className="sp-header__body">
        <span className="sp-header__eyebrow">{eyebrow}</span>
        {href ? (
          <Link href={href} className="sp-header__title">
            {title}
          </Link>
        ) : (
          <span className="sp-header__title">{title}</span>
        )}
      </div>
      <Link href="/guidebook" className="sp-header__guide" aria-label="Open the guidebook — this section's key ideas">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M12 6.5C10.5 5 8.4 4.5 6 4.5c-.8 0-1.5.1-2 .2V18c.5-.1 1.2-.2 2-.2 2.4 0 4.5.5 6 2 1.5-1.5 3.6-2 6-2 .8 0 1.5.1 2 .2V4.7c-.5-.1-1.2-.2-2-.2-2.4 0-4.5.5-6 2z" />
          <path d="M12 6.5v13.3" strokeLinecap="round" />
        </svg>
      </Link>
      <Link href="/sections" className="sp-header__guide" aria-label="Course sections and roadmap">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19a1 1 0 0 1 1 1v13.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5z" />
          <path d="M8 8.5h8M8 12h8M8 15.5h5" strokeLinecap="round" />
        </svg>
      </Link>
    </div>
  );
}
