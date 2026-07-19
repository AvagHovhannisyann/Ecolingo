import type { NextConfig } from "next";

/**
 * Production security headers (D-020 Wave 2 Stream AE).
 *
 * Applied via next.config's `headers()` — the Next.js 16 docs (see
 * node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md
 * and .../01-app/02-guides/content-security-policy.md) recommend `headers()`
 * for static, per-route-pattern headers, reserving proxy/middleware-based
 * nonces for apps that need a fresh CSP value per request. This app has no
 * such need (see CSP rationale below), and adding a proxy.ts would force
 * every page into dynamic rendering (no ISR/static optimization) purely to
 * mint nonces — a real cost with no corresponding benefit here. `headers()`
 * is therefore the docs' own recommended, lower-cost path for this app.
 *
 * Every directive below is measured against this codebase, not assumed:
 *
 * - script-src/style-src 'unsafe-inline': Next.js's App Router streams RSC
 *   payloads via inline `<script>self.__next_f.push(...)</script>` tags on
 *   every page (verified in the prod build output), and KaTeX
 *   (src/components/MathTex.tsx) renders math via `katex.renderToString`
 *   injected with dangerouslySetInnerHTML — KaTeX's HTML output relies
 *   extensively on inline `style="..."` attributes for glyph-level
 *   positioning (this is inherent to how KaTeX works, not optional). A
 *   handful of components also set dynamic inline styles directly
 *   (src/components/QuestionCard.tsx particle offsets, src/components/
 *   ClassAnalyticsClient.tsx and ProgressClient.tsx progress-bar widths).
 *   None of this content is nonce-able without adding a proxy (ruled out
 *   above) or hashable (the content is per-render/dynamic). Per the Next.js
 *   docs' own "Without Nonces" example, 'unsafe-inline' on both directives
 *   is the documented, supported pattern for a static next.config CSP.
 *   'unsafe-eval' is added ONLY in development (React's eval-based dev
 *   error reconstruction) — never in the production header, matching the
 *   docs' explicit guidance that eval is not needed in production builds.
 * - connect-src 'self' https://*.supabase.co wss://*.supabase.co: the
 *   browser Supabase client (src/lib/supabase.ts) calls Supabase's REST/auth
 *   endpoints over https; the SDK also provisions a realtime client that
 *   opens over wss even though no .channel()/.subscribe() call exists in
 *   this codebase today — kept so the SDK's own handshake isn't silently
 *   broken by future realtime use. OpenRouter (openrouter.ai) is called
 *   ONLY from server-side route handlers (src/app/api/explain,
 *   suggest-links, compile-course, draft-questions — all `runtime =
 *   "nodejs"`), never from the browser, so it does not belong in connect-src.
 * - img-src 'self' data: blob:: every image is a same-origin asset under
 *   public/ via next/image (no remote patterns configured); data:/blob: are
 *   kept for next/image's blur placeholders and pdf.js's canvas rendering.
 * - font-src 'self': Nunito is self-hosted via next/font/local
 *   (src/fonts/nunito.ts, woff2 committed in-repo) — verified no runtime
 *   fetch to Google Fonts or any other font host.
 * - worker-src 'self': pdf.js (src/lib/pdf-text.ts, PDF ingestion in the
 *   teacher workspace) loads its worker from the same-origin static asset
 *   public/pdf.worker.min.mjs — no CDN worker.
 * - object-src 'none', base-uri 'self', form-action 'self': no plugins, no
 *   base-tag injection, no cross-origin form submission anywhere in the app.
 * - frame-ancestors 'none': belt-and-suspenders with X-Frame-Options DENY
 *   below (CSP's frame-ancestors supersedes X-Frame-Options in modern
 *   browsers; X-Frame-Options is kept for older-browser defense in depth).
 * - No 'upgrade-insecure-requests': tested and dropped. Chromium applies it
 *   to top-level navigations, not just subresources, which broke in-app
 *   `<a href>` navigation entirely when verifying against a plain-http
 *   `next start` (every internal link attempted to upgrade to a https:
 *   origin that doesn't exist locally). The app has no hardcoded http: URLs
 *   to protect against (every asset is a relative same-origin path or an
 *   explicit https:// server-side fetch), so the directive's only real job
 *   here — CDN/host-level HTTPS termination — is already covered by
 *   Strict-Transport-Security once deployed. Not worth the navigation risk.
 * - vercel.live (Vercel preview-comments widget): deliberately NOT allowed.
 *   It is injected by Vercel's edge only on Preview deployments, never
 *   Production, and this policy is scoped to production hardening; nothing
 *   in the app code references it (verified). If preview-only relaxation is
 *   ever wanted, gate it on `process.env.VERCEL_ENV === "preview"` the same
 *   way `isDev` is gated below — deliberately not done here to keep the
 *   production policy the strict, measured one this task asked for.
 */
const isDev = process.env.NODE_ENV === "development";

const cspDirectives = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`,
  `font-src 'self'`,
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co`,
  `worker-src 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
];

const contentSecurityPolicy = cspDirectives.join("; ") + ";";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Production HTTPS hardening (Vercel terminates TLS; safe no-op over
          // local http during verification since browsers only act on this
          // header when the page itself was already loaded over https).
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
