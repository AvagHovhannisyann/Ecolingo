import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found — Ecolingo" };

/**
 * App-wide 404 (D-020 Wave 2 Stream X). A Server Component (the default for
 * `not-found.tsx` — see node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/not-found.md: "not-found.js or global-not-found.js
 * components do not accept any props"). It renders as a normal route segment
 * inside the root layout (src/app/layout.tsx), so the Sidebar / AppStatBar /
 * MobileTabBar shell still surrounds it — a wrong URL still feels like part
 * of the game world instead of a bare framework page.
 */
export default function NotFound() {
  return (
    <section className="mt-6 flex flex-col items-center gap-5 text-center">
      <div className="card flex w-full flex-col items-center gap-5 p-8 sm:p-12">
        <Image
          src="/art-v2/eco-shrug.webp"
          alt=""
          width={320}
          height={320}
          priority
          className="art-enter h-36 w-36 sm:h-44 sm:w-44"
        />
        <div className="max-w-sm">
          <h1 className="text-2xl font-black sm:text-3xl">This page wandered off the path.</h1>
          <p className="mt-3 text-app-muted">
            We couldn&apos;t find what you were looking for. It might have moved, or maybe it never existed.
          </p>
        </div>
        <div className="mt-2 flex flex-col items-center gap-3">
          <Link href="/learn" className="btn-primary min-h-12 px-6 py-3 text-white">
            Back to learning
          </Link>
          <Link
            href="/"
            className="text-sm text-app-muted underline underline-offset-2 hover:text-app"
          >
            or go home
          </Link>
        </div>
      </div>
    </section>
  );
}
