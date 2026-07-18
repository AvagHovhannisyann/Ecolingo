# Ecolingo — Testing Strategy, Evaluation Framework, Quality Gates (v1)

Philosophy (spec §26): we do not promise zero bugs; we build a system that **detects, contains, reports, and repairs** defects.

## 1. Definition of Done (applies to every backlog item — encodes the 5 common acceptance criteria + 4 edge cases)

An item is Done only when: (1) it is reachable in a testable user flow; (2) ≥1 automated happy-path test; (3) ≥1 error/edge-case test; (4) its analytics events (`idea{NNN}_viewed/started/completed/abandoned/errored/outcome`) fire and are asserted in tests where meaningful; (5) it provably cannot silently alter teacher-approved content (lock tests); and its handling of the four standard edge cases is decided and tested where applicable: missing profile data (safe defaults), missing/ambiguous source material (uncertainty surfaced, never invented), slow/unavailable AI provider (typed degrade path, GATE-009), offline/unstable connectivity (retry/queue or explicit failure).

## 2. Test pyramid

| Layer | Tooling | Scope |
|---|---|---|
| Unit | Vitest | engine math (Solow, mastery, scheduler, equivalence), schema validation, RLS helper logic |
| Property | Vitest + fast-check (Phase 1) | scheduler monotonicity, mastery bounds [0,1], equivalence symmetry/transitivity, DAG invariants |
| Component | Storybook + interaction tests (Phase 1) | question cards, lesson steps, labs (keyboard + touch) |
| E2E | Playwright | the vertical loop: onboarding → lesson → practice → feedback → review; teacher upload → review → publish (Phase 2) |
| AI evals | golden datasets + scorers (see §5) | per-agent, CI-gated |
| Visual regression | Playwright screenshots on target breakpoints | GATE-011 |
| Device matrix | phone/tablet/desktop breakpoints in CI; real-device pass before pilot | GATE-008 |

## 3. Course-specific acceptance tests (spec §33) — status

| ID | Assertion | Automated where |
|---|---|---|
| TEST-ECON-001 | Solow equation components labelled correctly | `solow.test.ts` (component labels from equation registry) |
| TEST-ECON-002 | Changing s shifts sf(k), does not rotate break-even | `solow.test.ts` |
| TEST-ECON-003 | Changing n or δ changes break-even slope | `solow.test.ts` |
| TEST-ECON-004 | Steady state satisfies s·f(k*)=(n+δ)·k* | `solow.test.ts` |
| TEST-ECON-005 | Golden Rule condition correct (s=α for Cobb–Douglas) | `solow.test.ts` |
| TEST-ECON-006 | Budget line rotates around endowment when only r changes | `budget.test.ts` |
| TEST-ECON-007 | Compensated line parallel to new budget line & tangent to original IC | `budget.test.ts` |
| TEST-ECON-008 | Euler balances u′(c1) vs β(1+r)u′(c2) | `euler.test.ts` |
| TEST-ECON-009 | PIH: temporary vs permanent shocks distinguished | Phase 4 (PIH sim) |
| TEST-ECON-010 | Business-cycle classification per course definitions | Phase 4 (blocked on uploaded definitions) |
| TEST-ECON-011 | Labour–leisure visuals respect budget constraint | Phase 4 |
| TEST-ECON-012 | Government PV budget constraint arithmetic | Phase 4 |
| TEST-ECON-013 | All notation follows teacher's uploaded notation | Phase 2 (notation registry diff test) — blocked on uploads |
| TEST-ECON-014 | All explanations show accurate citations | tutor-agent eval + citation validator unit test |
| TEST-ECON-015 | Equivalent mathematical answers accepted | `equivalence.test.ts` |

## 4. Global quality gates (spec §34 — release blockers, checked in CI where automatable)

GATE-001 no uncited instructional claims (citation validator strips + flags; eval threshold 0 on golden set) · GATE-002 no AI-generated image as truth-critical interactive graph (lint: lab components import only from `engine/`; media pipeline tags assets) · GATE-003 no question published without answer key + validation method (DB constraint + publish check) · GATE-004 no teacher-locked definition modified by personalization (lock trigger + tutor contract test) · GATE-005 no private-content access without membership (RLS tests per policy) · GATE-006 no mastery update without auditable evidence (service-layer transaction test) · GATE-007 no inaccessible core action (axe + keyboard e2e on core flows) · GATE-008 no mobile overflow on target breakpoints (visual test) · GATE-009 no silent model-provider failure (degrade-path tests; Sentry alert rules) · GATE-010 no production release without e2e on the main learning loop (CI required check) · GATE-011 no major visual regression (screenshot diff budget) · GATE-012 no assessment assistance beyond teacher policy (integrity-mode contract tests).

## 5. AI evaluation framework

- **Golden datasets** per agent under `evals/` (Phase 2): labelled lecture pages (ingestion), expert prerequisite graph (curriculum), solved question set (assessment), citation-faithfulness probes incl. adversarial "not in the course" questions (tutor — the automated hallucination test, IDEA-189), notation-preservation probes.
- **Scorers:** exact/structural match for extraction; deterministic solve-rate for keys; LLM-judged entailment (claim ⊆ cited chunk) with human-audited samples for faithfulness; regexless notation diff via the registry.
- **Gating:** prompt or model changes ship only if eval deltas are non-negative on truth-critical metrics; hallucination probes require 0 fabricated citations.
- **Online:** sampled production explanations re-scored asynchronously; "report an explanation" events (IDEA-188) feed the golden set.

## 6. Analytics plan

PostHog-class pipeline. Event naming: `idea{NNN}_{event}` for backlog features + core loop events (`lesson_step_completed`, `question_answered{correct,difficulty,hints,time_ms,confidence}`, `mastery_updated{concept,delta,evidence}`, `review_completed{onTime}`, `explain_used{mode,uncertainty}`, `report_error`). Funnels: onboarding completion; daily loop completion; teacher upload→publish. Retention: D1/D7/D28 by cohort. Learning outcomes: mastery-gain per active hour, review-on-time rate, transfer-question success rate — the §29 validation metric. Feature flags + A/B via the same pipeline; session replay with PII masking; surveys post-session (spec §18).

## 7. Reliability engineering

Sentry for FE/BE with release tagging; typed degrade paths for every provider call (GATE-009); job runner steps idempotent with dead-letter review; report-an-error control on every screen routes to a triage queue with entity + version context (IDEA-188); versioned lessons/keys allow instant rollback (IDEA-187).
