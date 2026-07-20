"use client";

/**
 * Desktop left rail (≥880px) — the app shell's primary navigation (D-020).
 * Wordmark at top, then chunky rounded nav rows (32px filled icon + UPPERCASE
 * bold label). Active row = blue-tinted translucent fill + 2px blue border.
 * Secondary destinations (Review / Labs / Bank / Exam) live behind a "MORE"
 * popover, Duolingo's ЕЩЁ pattern.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hasTeacherAccess, useAccountInfo } from "@/lib/use-account";
import {
  LearnIcon, QuestsIcon, ProfileIcon, TeachIcon,
  ReviewIcon, LabsIcon, BankIcon, ExamIcon, SettingsIcon, MoreIcon,
} from "./icons";

type Item = { href: string; label: string; icon: (p: { className?: string }) => React.ReactNode };

const PRIMARY: Item[] = [
  { href: "/learn", label: "Learn", icon: LearnIcon },
  { href: "/quests", label: "Quests", icon: QuestsIcon },
  { href: "/progress", label: "Profile", icon: ProfileIcon },
  { href: "/teach", label: "Teach", icon: TeachIcon },
];

const MORE: Item[] = [
  { href: "/review", label: "Review", icon: ReviewIcon },
  { href: "/lab", label: "Labs", icon: LabsIcon },
  { href: "/bank", label: "Bank", icon: BankIcon },
  { href: "/exam", label: "Exam", icon: ExamIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/learn") return pathname === "/learn" || pathname.startsWith("/lesson") || pathname === "/";
  if (href === "/progress") return pathname === "/progress" || pathname === "/onboarding";
  return pathname === href || pathname.startsWith(href + "/");
}

function rowClass(active: boolean): string {
  return [
    "nav-pop flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-[15px] font-extrabold uppercase tracking-wide",
    active
      ? "border-[color:var(--duo-blue)] bg-[color:rgba(28,176,246,0.15)] text-[color:var(--duo-blue-text)]"
      : "border-transparent text-[color:rgba(220,230,236,0.82)] hover:bg-[color:var(--app-surface-2)]",
  ].join(" ");
}

export function Sidebar() {
  const pathname = usePathname();
  const account = useAccountInfo();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreActive = MORE.some((m) => isNavActive(pathname, m.href));
  // Teacher-only tab (D-023); designated testers see everything too.
  const primary = PRIMARY.filter((n) => n.href !== "/teach" || hasTeacherAccess(account));

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col border-r-2 border-[color:var(--app-border)] bg-[color:var(--app-bg)] px-4 py-5 min-[880px]:flex">
      <Link href="/learn" className="mb-6 px-2 text-2xl font-black lowercase tracking-tight text-[color:var(--duo-green)]">
        ecolingo
      </Link>
      <nav aria-label="Primary" className="flex flex-col gap-1.5">
        {primary.map((n) => {
          const active = isNavActive(pathname, n.href);
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={rowClass(active)}>
              <Icon className="h-8 w-8 shrink-0" />
              {n.label}
            </Link>
          );
        })}

        <div className="relative" ref={moreRef}>
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((v) => !v)}
            className={rowClass(moreActive) + " w-full"}
          >
            <MoreIcon className="h-8 w-8 shrink-0" />
            More
          </button>
          {moreOpen && (
            <div
              role="menu"
              aria-label="More destinations"
              className="absolute left-0 top-full z-50 mt-1 w-[220px] rounded-2xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-2"
            >
              {MORE.map((n) => {
                const active = isNavActive(pathname, n.href);
                const Icon = n.icon;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    role="menuitem"
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={
                      "nav-pop flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-extrabold uppercase tracking-wide " +
                      (active
                        ? "text-[color:var(--duo-blue-text)]"
                        : "text-[color:rgba(220,230,236,0.82)] hover:bg-[color:var(--app-surface-2)]")
                    }
                  >
                    <Icon className="h-7 w-7 shrink-0" />
                    {n.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
