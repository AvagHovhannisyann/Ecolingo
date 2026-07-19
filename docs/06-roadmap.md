# Ecolingo — Roadmap, Deployment Plan, Operations Runbook (v1)

## 1. MVP (spec §27 — 12 commitments)

1. ECON 13210 course path · 2. Student onboarding + diagnostic · 3. Daily personalized lesson queue · 4. AI Explain button · 5. Source-grounded answers · 6. Six practice formats (IDEA-085..090) · 7. Solow visual lab · 8. Intertemporal budget visual lab · 9. Exam-date scheduler · 10. Teacher upload + concept-map review · 11. Basic mastery dashboard · 12. Responsive phone/tablet/desktop.

Explicitly out of MVP (spec §28): native apps, public marketplace, worldwide leaderboards, avatar sets, live multiplayer, thirty subjects, automatic public publishing, cinematic per-lesson video, school billing, full LMS replacement.

**Status at Wave 2 (D-020/D-021, verified against commit `d3a6d27`):** 1 **shipped** for World 2 only — `app/src/content/econ13210/` (World 1 and Worlds 3–7 remain `available: false` in `worlds.ts`, no lessons). 2 **shipped**, functionally — `OnboardingClient.tsx` + `DiagnosticStep.tsx` — but still the pre-D-020 grouped-step visual format, not the mascot-led one-question-per-screen survey (Wave 2 "survey" stream). 3 **shipped** — `HomeClient.tsx` + `engine/scheduler.ts`'s `planToday`. 4 **shipped** — `ExplainPanel.tsx` + `/api/explain` (D-010). 5 **shipped** — `grounding.ts`/`CitationChips.tsx` (GATE-001 chain, §4 of `docs/09-wave2-architecture.md`). 6 **shipped** — all six formats (`mc_single`, `mc_multi`, `numeric`, `equation_assembly`, `diagram_label`, `causal_order`) are both scored (`engine/scoring.ts`) and hand-authored in `content/econ13210/index.ts`; only `mc_single`/`mc_multi` are AI-factory-generated at scale so far (the numeric anti-hallucination validator shipped in `engine/authored.ts` but generation was deliberately left unwired per D-021). 7 **shipped** — `SolowLab.tsx`/`engine/solow.ts`. 8 **shipped** — `BudgetLab.tsx`/`engine/budget.ts`/`engine/euler.ts`. 9 **shipped**, hardened — `engine/scheduler.ts` back-planning + D-017 property tests. 10 **partially shipped** — per-concept upload/sectionize/link-approve/question-approve is live in `TeachClient.tsx`; the newer whole-course AI compiler (`engine/compile-course.ts` + `/api/compile-course`) has zero UI wiring (Wave 2 "teacher compiler UI" stream, see `docs/09-wave2-architecture.md` §2b/§3). 11 **shipped** — `ClassAnalyticsClient.tsx` + `ProgressClient.tsx`. 12 **shipped** — 880px breakpoint shell (`Sidebar.tsx`/`MobileTabBar.tsx`), a11y gate runs mobile (390×844) + desktop (1280×900); no dedicated tablet breakpoint is asserted anywhere.

## 2. Phases & exit criteria (spec §35; no phase advances with unresolved blocker defects)

| Phase | Content | Exit criteria | Status (Wave 2) |
|---|---|---|---|
| **0 Discovery/spec** | coverage matrix, PRD, personas, journeys, course map, risks | ✅ this delivery: all §31 artifacts exist; 216/216 items classified | ✅ shipped |
| **1 Foundation** | Supabase project, auth, migrations from `docs/03`, RLS, CI (vitest/playwright/axe), Sentry, analytics, design-token integration point for Fabel | RLS test suite green for the §4 matrix; CI required checks on; deploy pipeline to staging | ✅ shipped (7 migrations, `.github/workflows/ci.yml`); no Sentry/analytics wiring found in-tree |
| **2 Course ingestion** | uploads, parsing, citations, ingestion+curriculum agents, teacher review queue | a real ECON 13210 lecture PDF round-trips to a teacher-approved concept map with page-level citations; TEST-ECON-013 harness live | 🔶 partial — per-concept ingestion/review shipped; whole-course AI compiler built but unwired to any UI |
| **3 Student vertical slice (prod-grade)** | port slice onto Phase 1/2 infra: diagnostic, lesson, six question formats, feedback, Explain (live provider + deterministic fallback), mastery, review | E2E loop green on 3 breakpoints (GATE-010); tutor evals pass incl. 0 fabricated citations | 🔶 mostly shipped — loop is green, but the a11y gate (`app/scripts/a11y-audit.mjs`) only asserts 2 breakpoints, not 3 |
| **4 Visual labs** | Solow (harden), Intertemporal Budget, lab a11y (keyboard/touch/reduced-motion), misconception feedback | TEST-ECON-001..008 automated + green; axe clean on labs | ✅ shipped for the two live labs; 5 further labs still listed "planned" in `app/src/app/lab/page.tsx` |
| **5 Teacher dashboard** | mastery heatmap, misconception clusters, course management | teacher can answer "what do I reteach Thursday?" from live data | ✅ shipped — `ClassAnalyticsClient.tsx`, `engine/class-analytics.ts`, D-019 course management |
| **6 Retention & exam planning** | scheduler hardening, spaced review, catch-up, exam back-planning, readiness | property tests green; review reasons rendered; plan respects no-study days | ✅ shipped (D-017) |
| **7 Hardening** | security review, perf budgets, AI evals expansion, visual regression, load tests | all 12 GATEs enforced in CI/process; p95 lesson-step < 200 ms server time | 🔶 partial — CI gates (lint/vitest/build/3 smokes/a11y) all wired; no perf-budget tooling, no visual-regression tooling, and no load tests exist in-tree (Wave 2 "perf budget" stream) |
| **8 Pilot** | one real cohort, instrumentation, interviews | §29 answered with data (below) | not started |
| **9 Generalization** | course templates, teacher self-serve, second subject | second course compiled without engineering involvement | 🔶 partial — IDEA-205 course templates shipped (D-019, `course.ts`'s `createCourse`/`listMyCourses`); "second course compiled without engineering involvement" unproven since the compiler has no teacher-facing UI |

## 3. Post-MVP roadmap (by theme, from matrix classifications)

Remaining Explain modes & analogy personalization (IDEA-016/019/059/066–068/070/072) → remaining labs 13.2/13.4–13.7 (IDEA-194/198/199/201–204) → question formats 91–95 → exam mode & readiness (115/116/120) → weekly reports & comeback flows (136/137) → teacher copilot & analytics depth (147–156) → accessibility/language expansion (169/170/176/177/179/180) → classroom features (161/162/168) → experiments per flag (021/022/117/125/127/131/140/144/160/164) → platform tier (Phase 9: 205–216).

## 4. Pilot design — answering §29

**Question:** does this beat lecture notes + an ordinary chatbot for understanding and retention?
**Design:** within-course pilot, ~30 students; primary outcomes: (a) transfer-question success on Solow after 72h+ (the §29 prototype outcome, instrumented in-product), (b) delayed retention at 7 days vs baseline quiz cohort, (c) review-on-time rate; secondary: confidence calibration shift, teacher-rated dashboard usefulness, explanation report rate. Success bar: meaningful lift on (a) and (b) with no trust incidents (fabricated citation = incident).

## 5. Deployment plan

Environments: local (supabase cli) → staging → production (Vercel + Supabase, EU region). Trunk-based; PRs require CI (unit, e2e-smoke, axe, evals-on-touched-prompts) + preview deploy. Migrations forward-only via supabase migration files, applied staging-first. Secrets in platform vaults; no keys in repo. Rollback: redeploy previous build + `content_versions` rollback for content incidents. Release cadence: continuous to staging, weekly to prod during pilot with GATE checklist sign-off.

## 6. Operations runbook

- **AI provider outage:** providers behind `ExplainProvider`; automatic fallback to deterministic grounded panel (degraded banner). Alert: Sentry rule on `agent_call.degraded` spike.
- **Fabricated-citation report:** treat as SEV-2 trust incident — pull affected explanation from cache, add probe to golden set, block prompt version, notify teacher.
- **Wrong-answer-key report:** assessment-locked? notify teacher + lock question; else auto-unpublish question version, restore prior via `content_versions`.
- **Teacher deletes a source file:** job re-indexes, invalidates dependent citations, flags orphaned content into the teacher review queue (spec §25).
- **Data export/deletion request:** run documented workflow — export user rows (responses, mastery, profile) to signed URL; anonymize evidence, delete profile; log in `audit_events`.
- **Stuck ingestion job:** jobs idempotent by sha256; re-run step; dead-letter after 3; teacher sees "processing failed — retry" (never silent).
- **On-call dashboards:** error rate, agent latency/degrade rate, job queue depth, RLS-denial anomalies (possible probing), eval drift.

## 7. Wave 3 (proposed next slice, added post D-020/D-021 — see `docs/09-wave2-architecture.md`)

Scoped after Wave 2's surface map made the real gaps visible (`docs/09-wave2-architecture.md` §2b/§3).
Not yet committed as decision-log entries — this is the engineering proposal for what comes after
Wave 2 lands, surfaced here for planning, same spirit as D-019's platform-tier gating list.

- **Leaderboards need real identity — flag the gate.** Spec §28 explicitly excludes "worldwide
  leaderboards" from MVP, and today's auth is anonymous-only (D-008's "anonymous sign-in as demo
  auth," unchanged through D-015's enrollment model). A leaderboard — even a friends/class-scoped one
  — requires learners to have durable, recognizable identity (a display name, at minimum) and a policy
  for what's shown to whom. This is the same category of external gate D-019 flagged for the
  platform-tier backlog (pricing, IRB, LMS target): **do not build a leaderboard against anonymous
  auth**; it either leaks study behavior across pseudonymous sessions or requires the identity system
  to land first. Treat as blocked until a product decision on real identity is made.
- **New exercise formats.** All six MVP formats are scored (`engine/scoring.ts`) and hand-authored,
  but the AI factory (`engine/authored.ts`) only mints `mc_single`/`mc_multi` at scale; numeric
  generation is validated but deliberately unwired (D-021); `equation_assembly`/`diagram_label`/
  `causal_order` have no AI-drafting path at all. Wave 3 should extend the factory to these formats
  using the same draft → sanitize → teacher-ratify pattern `toAuthoredQuestion` already establishes,
  not a new pattern.
- **Teacher uploads binding compiled plans to real courses.** `engine/compile-course.ts` produces a
  `CourseDraft` with no `courseId` anywhere in its output shape, and nothing persists a compiled draft
  against a specific `courses` row (the D-015 enrollment model). Wave 3 needs the compiled plan to
  bind to the teacher's actual course (so publish flows through the same `join_course`/enrollment RLS
  that already gates citations and authored questions), not float as a standalone artifact.
- **Mobile polish.** The 880px breakpoint shell (`Sidebar.tsx`/`MobileTabBar.tsx`) and the a11y gate's
  mobile viewport (390×844) are the only mobile-specific verification today; there is no tablet
  breakpoint anywhere in `app/scripts/a11y-audit.mjs` despite Phase 3's exit criterion naming three
  breakpoints, and the AAA touch-target sizing on lab sliders remains explicitly deferred (D-016).
  Wave 3 should close both gaps.
