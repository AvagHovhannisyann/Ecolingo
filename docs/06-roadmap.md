# Ecolingo — Roadmap, Deployment Plan, Operations Runbook (v1)

## 1. MVP (spec §27 — 12 commitments)

1. ECON 13210 course path · 2. Student onboarding + diagnostic · 3. Daily personalized lesson queue · 4. AI Explain button · 5. Source-grounded answers · 6. Six practice formats (IDEA-085..090) · 7. Solow visual lab · 8. Intertemporal budget visual lab · 9. Exam-date scheduler · 10. Teacher upload + concept-map review · 11. Basic mastery dashboard · 12. Responsive phone/tablet/desktop.

Explicitly out of MVP (spec §28): native apps, public marketplace, worldwide leaderboards, avatar sets, live multiplayer, thirty subjects, automatic public publishing, cinematic per-lesson video, school billing, full LMS replacement.

## 2. Phases & exit criteria (spec §35; no phase advances with unresolved blocker defects)

| Phase | Content | Exit criteria |
|---|---|---|
| **0 Discovery/spec** | coverage matrix, PRD, personas, journeys, course map, risks | ✅ this delivery: all §31 artifacts exist; 216/216 items classified |
| **1 Foundation** | Supabase project, auth, migrations from `docs/03`, RLS, CI (vitest/playwright/axe), Sentry, analytics, design-token integration point for Fabel | RLS test suite green for the §4 matrix; CI required checks on; deploy pipeline to staging |
| **2 Course ingestion** | uploads, parsing, citations, ingestion+curriculum agents, teacher review queue | a real ECON 13210 lecture PDF round-trips to a teacher-approved concept map with page-level citations; TEST-ECON-013 harness live |
| **3 Student vertical slice (prod-grade)** | port slice onto Phase 1/2 infra: diagnostic, lesson, six question formats, feedback, Explain (live provider + deterministic fallback), mastery, review | E2E loop green on 3 breakpoints (GATE-010); tutor evals pass incl. 0 fabricated citations |
| **4 Visual labs** | Solow (harden), Intertemporal Budget, lab a11y (keyboard/touch/reduced-motion), misconception feedback | TEST-ECON-001..008 automated + green; axe clean on labs |
| **5 Teacher dashboard** | mastery heatmap, misconception clusters, course management | teacher can answer "what do I reteach Thursday?" from live data |
| **6 Retention & exam planning** | scheduler hardening, spaced review, catch-up, exam back-planning, readiness | property tests green; review reasons rendered; plan respects no-study days |
| **7 Hardening** | security review, perf budgets, AI evals expansion, visual regression, load tests | all 12 GATEs enforced in CI/process; p95 lesson-step < 200 ms server time |
| **8 Pilot** | one real cohort, instrumentation, interviews | §29 answered with data (below) |
| **9 Generalization** | course templates, teacher self-serve, second subject | second course compiled without engineering involvement |

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
