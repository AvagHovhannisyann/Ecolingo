import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SyncBadge } from "@/components/SyncBadge";
import { DesktopNav, MobileNav } from "@/components/NavLinks";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ecolingo — hard ideas. made intuitive.",
  description:
    "An AI course compiler that turns a teacher's materials into a personalized, visual, game-like learning path. Vertical-slice demo: ECON 13210, Solow growth.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#35C46A",
};

/**
 * App shell on the spec §14 system: Cloud White surfaces, Deep Ink text,
 * Growth Green identity. IA per docs/02-prd.md §6: full nav on wide screens,
 * four one-thumb icon tabs on mobile. (Final art direction: Fabel, D-001.)
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const navDesktop = [
    { href: "/", label: "Path" },
    { href: "/review", label: "Review" },
    { href: "/lab", label: "Visual Lab" },
    { href: "/bank", label: "Question Bank" },
    { href: "/exam", label: "Exam Plan" },
    { href: "/progress", label: "Progress" },
    { href: "/teach", label: "Teach" },
  ];
  const navMobile = [
    { href: "/", label: "Path" },
    { href: "/review", label: "Review" },
    { href: "/lab", label: "Labs" },
    { href: "/progress", label: "Progress" },
  ];
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b-2 border-[var(--mist-gray)] bg-[var(--cloud-white)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2">
            <div className="flex items-baseline gap-2">
              <Link href="/" className="text-lg font-extrabold tracking-tight text-[var(--growth-green-deep)]">
                ecolingo
              </Link>
              <SyncBadge />
            </div>
            <DesktopNav items={navDesktop} />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-3xl p-4 pb-28 sm:pb-10">
          {children}
        </main>
        <MobileNav items={navMobile} />
      </body>
    </html>
  );
}
