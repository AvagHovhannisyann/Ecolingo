# Ecolingo — Risk Register & Open Questions (living)

## 1. Risks

| ID | Risk | L×I | Mitigation | Owner | Status |
|---|---|---|---|---|---|
| R-01 | AI teaches an incorrect equation / hallucinates a citation → trust collapse | M×**Critical** | Deterministic truth layer (§4 split); citation validator; hallucination probes gate releases (GATE-001, IDEA-189); SEV-2 runbook | Eng | Mitigations specified; enforce from Phase 1 |
| R-02 | No course materials uploaded yet — all ECON content unverified | **Current**×High | Content flagged `planned_unverified` in-product; pilot blocked on ingestion (Phase 2 exit) | Product | **Open blocker** for pilot |
| R-03 | Ingestion quality on real slides/PDFs (equations, notation) below usable | M×H | Golden-set evals before teacher exposure; needs_review degrade path; teacher fixes are first-class (approve/edit) | Eng | Open |
| R-04 | Scope explosion (216 items) starves the vertical loop | H×H | Matrix classifications binding (D-006); phase exit criteria; changes need decision-log entries | PM | Managed |
| R-05 | Design dependency: Fabel deliverables (identity, mascot, motion) late → MVP ships with unstyled UX | M×M | Functional UI with a11y invariants ships regardless; design tokens integrate at Phase 1 seam; landing page deferred until Fabel assets | PM | Open — handoff pack in PRD §11 |
| R-06 | Mastery model miscalibrated → bad scheduling erodes trust | M×M | Explainable review reasons (learner can veto); property tests; pilot calibration study (readiness score stays post-MVP) | Eng | Open |
| R-07 | Academic-integrity misuse (platform completes graded work) | M×H | Integrity mode (§24): locks, Socratic-only, audit logs; teacher policy visible | Product | Spec'd, Phase 5–6 build |
| R-08 | Privacy incident with student analytics | L×**Critical** | RLS-by-default, data minimization, role matrix tests (GATE-005), no training on private data without opt-in | Eng | Mitigations specified |
| R-09 | AI cost per active student exceeds sustainable unit economics | M×M | Model tiering + caching (§19); cost per session dashboard from Phase 3 | Eng | Open |
| R-10 | Duolingo trade-dress proximity in future design | L×M | §5 prohibition recorded in Fabel handoff; legal review before public launch | Design (Fabel) | Open |
| R-11 | Solo-course cold start: product only proven for ECON 13210 | M×M | By design (spec §1) — Phase 9 generalization gated on pilot evidence | PM | Accepted |
| R-12 | Supabase RLS complexity → accidental data exposure via retrieval path | M×H | Retrieval RPC filters before vector search; RLS-denial monitoring; pen-test in Phase 7 | Eng | Open |

## 2. Assumptions in force (reversible, stated per §36)

A-1: English-language course content for MVP; multilingual post-MVP. A-2: Web-first (PWA later); no native apps. A-3: One teacher-owner per course in MVP (co-teachers Phase 5). A-4: Cobb–Douglas is the default production function for World 2 labs pending lecture confirmation. A-5: Supabase region EU; final choice pending pilot institution location.

## 3. Open questions (need answers that materially change architecture/scope)

| Q | Question | Blocks | Needed by |
|---|---|---|---|
| Q-1 | When will ECON 13210 syllabus + lectures be provided, and in what formats? | Phase 2, R-02 | before Phase 2 build |
| Q-2 | Pilot institution & cohort size? (drives region, privacy review, §29 study design) | Phase 8 | Phase 6 |
| Q-3 | Which AI provider(s) are approved for student data flow, and under what DPA? | Phase 3 live tutor | Phase 2 |
| Q-4 | Fabel timeline for identity/mascot/motion deliverables? | landing page, gamified chrome | Phase 1 |
| Q-5 | Does the course use exactly Δk = s·f(k) − (n+δ)k notation (vs per-effective-worker with g)? | World 2 content verification | Phase 2 ingestion |
| Q-6 | Teacher policy defaults for integrity mode (locks on by default?) | §24 defaults | Phase 5 |
