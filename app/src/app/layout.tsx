import type { Metadata, Viewport } from "next";
import { nunito } from "@/fonts/nunito";
import { Sidebar } from "@/components/Sidebar";
import { MobileTabBar } from "@/components/MobileTabBar";
import { AppStatBar } from "@/components/AppStatBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ecolingo — hard ideas. made intuitive.",
  description:
    "An AI course compiler that turns a teacher's materials into a personalized, visual, game-like learning path. Vertical-slice demo: ECON 13210, Solow growth.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#131f24",
};

/**
 * App shell on the dark game surface (product-owner direction D-020): a fixed
 * left icon rail on desktop (≥880px), a bottom tab bar on mobile, and a fixed
 * top stat strip (streak / gems / hearts) in both. Nunito everywhere. The
 * marketing landing page is a separate stream; this shell wraps the app.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body className="min-h-dvh bg-app text-app antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:rounded-lg focus:bg-[color:var(--app-surface)] focus:p-3 focus:text-app"
        >
          Skip to content
        </a>
        <Sidebar />
        <AppStatBar />
        <div className="min-[880px]:pl-[240px]">
          <main id="main" className="mx-auto max-w-3xl px-4 pb-28 pt-16 min-[880px]:pb-12">
            <AuthGuard>{children}</AuthGuard>
          </main>
        </div>
        <MobileTabBar />
      </body>
    </html>
  );
}
