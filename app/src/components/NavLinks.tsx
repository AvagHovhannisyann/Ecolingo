"use client";

/**
 * Navigation with active-state pills (desktop) and icon tabs (mobile).
 * Icons are inline SVG — thick, friendly, simple (spec §14) — with text
 * labels always present (never icon-only meaning).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/lesson");
  return pathname === href || pathname.startsWith(href + "/");
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const ICONS: Record<string, React.ReactNode> = {
  "/": (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden {...stroke}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13v-9.5" />
    </svg>
  ),
  "/review": (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden {...stroke}>
      <path d="M4 12a8 8 0 1 0 2.3-5.6" />
      <path d="M4 4v4h4" />
      <path d="M12 8v4l3 2" />
    </svg>
  ),
  "/lab": (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden {...stroke}>
      <path d="M9 3h6" />
      <path d="M10 3v5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8V3" />
      <path d="M7.5 14h9" />
    </svg>
  ),
  "/bank": (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden {...stroke}>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v14H6.5A2.5 2.5 0 0 0 4 20.5v-14Z" />
      <path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" />
    </svg>
  ),
  "/exam": (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden {...stroke}>
      <path d="M5 21V4" />
      <path d="M5 4h13l-2.5 4L18 12H5" />
    </svg>
  ),
  "/progress": (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden {...stroke}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </svg>
  ),
};

export function DesktopNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="hidden gap-1 sm:flex">
      {items.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`min-h-12 rounded-2xl px-3 py-3 text-sm font-bold ${
              active
                ? "bg-[var(--growth-green-tint)] text-[var(--growth-green-text)]"
                : "text-[var(--deep-ink)] hover:bg-[var(--mist-gray)]"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 flex justify-around border-t-2 border-[var(--mist-gray)] bg-white p-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:hidden"
    >
      {items.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl p-1.5 text-[11px] font-bold ${
              active ? "bg-[var(--growth-green-tint)] text-[var(--growth-green-text)]" : "text-gray-500"
            }`}
          >
            {ICONS[n.href]}
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
