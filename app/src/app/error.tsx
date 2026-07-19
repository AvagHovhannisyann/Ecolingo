"use client"; // Error boundaries must be Client Components — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * Route-segment error boundary (D-020 Wave 2 Stream X). Catches uncaught
 * exceptions thrown while rendering anywhere under the root layout and shows
 * an honest, on-brand fallback instead of the Next.js default overlay/page.
 *
 * Props per the current contract (error.md → "Props"): `error` (forwarded
 * Error, message redacted in production for Server Component errors — see
 * `error.message` in the same doc) and `reset()` ("if you have a specific
 * reason to clear the error state and re-render the error boundary's
 * children without re-fetching the contents, you can use the reset()
 * function" — exactly this case, since we don't want to trigger a refetch,
 * just let the learner retry rendering). `unstable_retry()` also exists on
 * this build (re-fetches + re-renders) but `reset()` is the documented fit
 * here.
 *
 * No error internals are ever rendered — only logged via console.error, so
 * nothing about the failure (message, stack, digest) leaks into the UI.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mt-6 flex flex-col items-center gap-5 text-center">
      <div className="card flex w-full flex-col items-center gap-5 p-8 sm:p-12">
        <Image
          src="/art-v2/eco-sad.webp"
          alt=""
          width={320}
          height={320}
          priority
          className="art-enter h-36 w-36 sm:h-44 sm:w-44"
        />
        <div className="max-w-sm">
          <h1 className="text-2xl font-black sm:text-3xl">Something broke on our side.</h1>
          <p className="mt-3 text-app-muted">
            Your progress is saved locally, so nothing you&apos;ve done is lost. Give it another try.
          </p>
        </div>
        <div className="mt-2 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="btn-primary min-h-12 px-6 py-3 text-white"
          >
            Try again
          </button>
          <Link
            href="/learn"
            className="text-sm text-app-muted underline underline-offset-2 hover:text-app"
          >
            back to learning
          </Link>
        </div>
      </div>
    </section>
  );
}
