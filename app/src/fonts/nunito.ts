import localFont from "next/font/local";

/**
 * Nunito — the rounded, friendly display face closest to Duolingo's din-round
 * (product-owner direction, decision D-020). Licensed under the SIL Open Font
 * License 1.1 (https://openfontlicense.org); the committed woff2 is the Latin
 * *variable* instance (weight 400–900) pulled from Google Fonts' gstatic CDN so
 * the sandbox build needs no network at build time. next/font/local self-hosts
 * it (no external request at runtime either).
 */
export const nunito = localFont({
  src: [{ path: "./Nunito-latin-variable.woff2", weight: "400 900", style: "normal" }],
  variable: "--font-nunito",
  display: "swap",
  fallback: ["ui-rounded", "Nunito", "Segoe UI", "system-ui", "sans-serif"],
});
