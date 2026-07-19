"use client";

/**
 * Mobile bottom tab bar (<880px) — five thumb-friendly tabs (D-020). LEARN /
 * QUESTS / SHOP / PROFILE and a MORE tab that opens a bottom sheet with the
 * secondary destinations (Teach / Review / Labs / Bank / Exam). Same active
 * treatment as the desktop rail (blue tint + blue label). Icons carry a small
 * visible label so meaning is never icon-only.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LearnIcon, QuestsIcon, ProfileIcon, TeachIcon,
  ReviewIcon, LabsIcon, BankIcon, ExamIcon, SettingsIcon, MoreIcon,
} from "./icons";
import { isNavActive } from "./Sidebar";

const TABS = [
  { href: "/learn", label: "Learn", icon: LearnIcon },
  { href: "/quests", label: "Quests", icon: QuestsIcon },
  { href: "/progress", label: "Profile", icon: ProfileIcon },
];

const SHEET = [
  { href: "/teach", label: "Teach", icon: TeachIcon },
  { href: "/review", label: "Review", icon: ReviewIcon },
  { href: "/lab", label: "Labs", icon: LabsIcon },
  { href: "/bank", label: "Bank", icon: BankIcon },
  { href: "/exam", label: "Exam", icon: ExamIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function tabClass(active: boolean): string {
  return [
    "nav-pop flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1 py-1 text-[11px] font-extrabold uppercase tracking-wide",
    active
      ? "border-[color:var(--duo-blue)] bg-[color:rgba(28,176,246,0.15)] text-[color:var(--duo-blue-text)]"
      : "border-transparent text-[color:rgba(220,230,236,0.82)]",
  ].join(" ");
}

export function MobileTabBar() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetActive = SHEET.some((s) => isNavActive(pathname, s.href));

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  return (
    <>
      {sheetOpen && (
        <div className="fixed inset-0 z-40 min-[880px]:hidden" aria-hidden onClick={() => setSheetOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}
      {sheetOpen && (
        <div
          role="menu"
          aria-label="More destinations"
          className="fixed inset-x-0 bottom-[68px] z-50 mx-2 rounded-3xl border-2 border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-2 min-[880px]:hidden"
        >
          {SHEET.map((n) => {
            const active = isNavActive(pathname, n.href);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                role="menuitem"
                onClick={() => setSheetOpen(false)}
                aria-current={active ? "page" : undefined}
                className={
                  "nav-pop flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-extrabold uppercase tracking-wide " +
                  (active ? "text-[color:var(--duo-blue-text)]" : "text-[color:rgba(220,230,236,0.9)] hover:bg-[color:var(--app-surface-2)]")
                }
              >
                <Icon className="h-8 w-8 shrink-0" />
                {n.label}
              </Link>
            );
          })}
        </div>
      )}
      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-50 flex justify-around gap-1 border-t-2 border-[color:var(--app-border)] bg-[color:var(--app-bg)] px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 min-[880px]:hidden"
      >
        {TABS.map((n) => {
          const active = isNavActive(pathname, n.href);
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
              <Icon className="h-7 w-7" />
              {n.label}
            </Link>
          );
        })}
        <button
          type="button"
          aria-expanded={sheetOpen}
          aria-haspopup="menu"
          onClick={() => setSheetOpen((v) => !v)}
          className={tabClass(sheetActive)}
        >
          <MoreIcon className="h-7 w-7" />
          More
        </button>
      </nav>
    </>
  );
}
