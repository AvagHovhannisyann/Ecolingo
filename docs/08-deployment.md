# 08 — Deployment (Phase 8)

Status: **ready to deploy** — the app builds green with zero secrets (proven on
every CI run), degrades cleanly without them, and lights up feature-by-feature
as env vars are added. The one step that requires a human is connecting the
GitHub repo to Vercel (the account is provisioned; no projects exist yet).

## One-time setup (~2 minutes, in the Vercel dashboard)

1. **Import the repo**: vercel.com → Add New → Project → import
   `AvagHovhannisyann/Ecolingo`.
2. **Root Directory**: set to `app` (the Next.js app lives in the `app/`
   subdirectory — this is the only non-default setting). Framework preset:
   Next.js (auto-detected). Build/install commands: leave default.
3. **Environment variables** (Settings → Environment Variables). All optional —
   see the degrade matrix below:

   | Name | Value | Scope | Sensitivity |
   |---|---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://gucwcjsvuuoytzptoqdk.supabase.co` | All | Public by design |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key (Supabase dashboard → Settings → API) | All | Public by design (RLS guards all data) |
   | `OPENROUTER_API_KEY` | your OpenRouter key | All | **Secret** — server-only (read exclusively by `/api/*` routes; never `NEXT_PUBLIC_`) |
   | `OPENROUTER_MODEL` | `google/gemma-4-26b-a4b-it:free` (optional override; this is the D-010 default) | All | Public |

4. Deploy. Every later push to `main` auto-deploys; PR branches get preview
   URLs. CI (`.github/workflows/ci.yml`) runs the full gate battery
   independently of Vercel on every PR.

## Degrade matrix (what works with which env vars)

| Configuration | Learner loop | Sync/enrollment/analytics | AI tutor & AI drafting |
|---|---|---|---|
| No env vars | ✅ full, local-only (localStorage) | shows "local only" / "cloud connection needed" states | deterministic Offline tutor |
| Supabase vars only | ✅ | ✅ full (RLS-guarded) | deterministic Offline tutor |
| \+ OpenRouter key | ✅ | ✅ | ✅ live tutor, link suggestions, question drafting (free-tier models; `/api/*` routes fall back deterministically on 429/timeouts — GATE-009) |

## Notes

- **Supabase**: migrations are already applied to the live project (D-008…
  D-015); nothing to run at deploy time. Anonymous sign-ins must remain enabled
  (they are). If you later add real auth, review the published-content policies
  (D-012) whose predicate is deliberately the single seam to narrow.
- **Why not deployed from the build session**: the session's Vercel MCP deploy
  tool requires inlining the entire file tree through the model context; with
  ~9 MB of generated media that is not feasible, and a git-connected project is
  the correct long-term setup anyway (auto-deploys, preview URLs, rollbacks).
- **Perf budgets (Phase 7 residual)**: once a production URL exists, wire
  Lighthouse CI or Vercel Speed Insights against it; the p95 lesson-step
  < 200 ms server-time budget (docs/06 §Phase 7) becomes measurable then.
