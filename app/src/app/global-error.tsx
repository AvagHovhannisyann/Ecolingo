"use client"; // Error boundaries must be Client Components — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md

import { useEffect } from "react";

/**
 * Root error boundary (D-020 Wave 2 Stream X). Only fires when the root
 * layout itself (src/app/layout.tsx) throws while rendering, which means it
 * REPLACES that layout — per the docs: "Global error UI must define its own
 * <html> and <body> tags, since it is replacing the root layout or template
 * when active" (error.md, "Global errors" / "Global Error" sections). It
 * must ship its own inline styling: `./globals.css` is imported by the very
 * layout this file stands in for, so it cannot be assumed to have loaded.
 *
 * A plain <img> is used instead of next/image so this page has zero
 * dependency on any part of the render pipeline beyond React itself — this
 * is the last line of defense and should stay renderable even if something
 * deeper than a route segment is broken.
 *
 * Props match error.tsx (see that file for the reset()-vs-unstable_retry()
 * rationale): `error` and `reset()`.
 */
export default function GlobalError({
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
    // global-error must include its own html and body tags.
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Something went wrong — Ecolingo</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#131f24",
          color: "#f1f7fb",
          fontFamily: 'ui-rounded, "Segoe UI", system-ui, -apple-system, sans-serif',
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <img
            src="/art-v2/eco-sad.webp"
            alt=""
            width={160}
            height={160}
            style={{ margin: "0 auto 20px", display: "block", width: 160, height: 160 }}
          />
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 12px", letterSpacing: "-0.01em" }}>
            Something broke on our side.
          </h1>
          <p style={{ color: "#b3c2cd", margin: "0 0 24px", lineHeight: 1.55 }}>
            Your progress is saved locally, so nothing you&apos;ve done is lost. Try reloading the page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#58cc02",
              color: "#ffffff",
              border: "none",
              borderRadius: 14,
              boxShadow: "0 4px 0 #58a700",
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              padding: "12px 24px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
