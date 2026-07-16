import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ecolingo — hard ideas. made intuitive.",
  description:
    "An AI course compiler that turns a teacher's materials into a personalized, visual, game-like learning path. Vertical-slice demo: ECON 13210, Solow growth.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Functional shell only — the visual design system (identity, type, color,
 * motion) is delivered by Fabel (decision D-001). Navigation follows the IA
 * in docs/02-prd.md §6: top nav on wide screens, bottom nav on mobile.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nav = [
    { href: "/", label: "Path" },
    { href: "/review", label: "Review" },
    { href: "/lab/solow", label: "Visual Lab" },
    { href: "/progress", label: "Progress" },
  ];
  return (
    <html lang="en">
      <body className="min-h-dvh bg-white text-gray-900 antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">
          Skip to content
        </a>
        <header className="border-b border-gray-200">
          <div className="mx-auto flex max-w-3xl items-center justify-between p-4">
            <Link href="/" className="font-semibold">
              Ecolingo <span className="font-normal text-gray-500">· ECON 13210 demo</span>
            </Link>
            <nav aria-label="Primary" className="hidden gap-2 sm:flex">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="min-h-12 rounded-xl px-3 py-3 text-sm hover:bg-gray-100">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-3xl p-4 pb-24 sm:pb-8">
          {children}
        </main>
        {/* mobile bottom nav — one-thumb reach, ≥48px targets (spec §8.2) */}
        <nav
          aria-label="Primary mobile"
          className="fixed inset-x-0 bottom-0 flex justify-around border-t border-gray-200 bg-white p-1 sm:hidden"
        >
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="min-h-12 flex-1 rounded-xl p-3 text-center text-sm">
              {n.label}
            </Link>
          ))}
        </nav>
      </body>
    </html>
  );
}
