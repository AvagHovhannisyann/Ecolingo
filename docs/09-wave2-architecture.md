# Ecolingo — Wave 2 Architecture (D-020 game-first rebuild)

Status: living engineering document for the D-020/D-021 rebuild. Written against commit `d3a6d27`
on `claude/econ-adaptive-learning-platform-sdlmxx`. Every file path below was verified to exist at
that commit (`ls`/`grep`, not memory). This document does not own the decision log
(`docs/00-execution-summary.md`) — it explains and extends what that log already recorded.

---

## 1. The D-020 product thesis

Ecolingo is an AI course compiler whose output must feel like a game, not a study tool with game
garnishes bolted on: a teacher's real materials are compiled into a Duolingo-shaped surface — dark
game shell, winding skill path, chest rewards, one-exercise-per-screen lessons, quests, a shop — but
every truth-critical layer underneath stays exactly as deterministic and teacher-gated as it was
before the reset (mastery math, scoring, scheduling, citations, answer keys). The product owner
supplied the visual direction personally (D-020 in `docs/00-execution-summary.md`), which is why this
rebuild proceeds without a Fabel handoff for the game shell itself; CLAUDE.md's routing rule still
governs anything beyond what the product owner specified. The compiler's ambition also grew in the
same decision: not just citations, but a complete units → lessons → steps course structure, with an
AI question factory at explicit difficulty tiers and adaptive difficulty selection as mastery grows.
Nothing about the engine — mastery (`app/src/lib/engine/mastery.ts`), scoring
(`app/src/lib/engine/scoring.ts`), scheduling (`app/src/lib/engine/scheduler.ts`), the Supabase
schema, or enrollment — changed; D-020 is a presentation-and-scope reset on top of an unchanged
truth-critical core.

## 2. Surface map

### 2a. Every route at tip

| Route | File | State |
|---|---|---|
| `/` | `app/src/app/page.tsx` | Light marketing landing (D-020/D-021 Wave 1), Duolingo-parity palette scoped under `.landing`, art-v2 mascot |
| `/learn` | `app/src/app/learn/page.tsx` → `HomeClient.tsx` | Learner home / daily plan (moved here from `/` in Wave 1) |
| `/lesson/[lessonId]` | `app/src/app/lesson/[lessonId]/page.tsx` → `LessonPlayer.tsx` | Six-step lesson player |
| `/onboarding` | `app/src/app/onboarding/page.tsx` → `OnboardingClient.tsx` | 5-step onboarding wizard |
| `/quests` | `app/src/app/quests/page.tsx` | Honest empty-state placeholder |
| `/shop` | `app/src/app/shop/page.tsx` | Honest empty-state placeholder |
| `/review` | `app/src/app/review/page.tsx` → `ReviewClient.tsx` | Spaced-review queue, SFX wired |
| `/bank` | `app/src/app/bank/page.tsx` → `BankClient.tsx` | Question Bank practice, SFX wired |
| `/exam` | `app/src/app/exam/page.tsx` → `ExamPlanClient.tsx` | Exam back-planning view |
| `/progress` | `app/src/app/progress/page.tsx` → `ProgressClient.tsx` | Mastery dashboard, audit trail, Achievements |
| `/teach` | `app/src/app/teach/page.tsx` → `TeachClient.tsx` | Teacher upload/review/approve workspace |
| `/teach/analytics` | `app/src/app/teach/analytics/page.tsx` → `ClassAnalyticsClient.tsx` | Class mastery dashboard |
| `/lab`, `/lab/solow`, `/lab/budget` | `app/src/app/lab/{,solow/,budget/}page.tsx` | Visual lab hub + two live labs (5 more listed "planned") |

No `error.tsx`, `not-found.tsx`, `global-error.tsx`, or `loading.tsx` exists under `app/src/app` —
verified by filesystem search. Next.js is serving its stock error/404 chrome outside the dark-shell
design system on every route today.

### 2b. Wave 2 streams in flight — ownership, boundaries, gates

**Skill path `/learn`.** Owns the daily-loop entry point (`app/src/app/learn/page.tsx` →
`app/src/components/HomeClient.tsx`) and the course map (`app/src/components/WorldMap.tsx`). Today
this is a card list of due lessons/reviews built from `buildReviewQueue`/`planToday`
(`app/src/lib/engine/scheduler.ts`) plus a grid of 8 world cards (`app/src/content/econ13210/worlds.ts`)
— it does **not** implement the D-020-mandated winding 3D-node skill path with chest rewards and
section headers; that is an unbuilt visual/interaction layer over the same data. Must not touch:
`HomeClient`'s prerequisite-gating (`isUnlocked`, MOAT-02), `buildReviewQueue`'s determinism, or
`WorldMap`'s honest "awaiting course upload" labelling for unavailable worlds. Gate battery: `/learn`
in `app/scripts/a11y-audit.mjs`'s route list; `app/scripts/smoke.e2e.mjs`; GATE-002 (all path geometry
comes from `course.lessons`/scheduler output, never an image); GATE-001 (`UnverifiedBanner`).

**Lesson flow.** Owns `/lesson/[lessonId]` → `app/src/components/LessonPlayer.tsx`, which walks the
six typed steps (`core_idea → intuition → visual → math → guided → mastery_check`). Today it is a
single continuous page with a top progress bar — not one-exercise-per-screen with a bottom feedback
strip, and there is no retention modal on exit. `playSfx` (`app/src/lib/sfx.ts`) is never called from
`LessonPlayer.tsx` or `app/src/components/QuestionCard.tsx` — confirmed by grep; only
`app/src/components/BankClient.tsx` and `app/src/components/ReviewClient.tsx` call it today. Must not
touch: `completionCriterion` semantics, `recordEvidence`/`applyEvidence` mastery math
(`app/src/lib/engine/mastery.ts`), or the "never fabricate a math step" rule in
`app/src/lib/engine/compile-course.ts`. Gate battery: `/lesson/lesson-solow-steady-state` and
`/lesson/lesson-production-function` in the a11y route list; `smoke.e2e.mjs`; GATE-002 via `MathTex`/
`SolowLab`.

**Survey (onboarding).** Owns `/onboarding` → `app/src/components/OnboardingClient.tsx` +
`app/src/components/DiagnosticStep.tsx`, a 5-step wizard (role/objective/schedule/diagnostic/
preferences). Each step still groups multiple fields rather than the D-020 "mascot-led
one-question-per-screen" format, still points at v1 art (`/art/onboarding-checkin.webp`,
`/art/creature-waving.webp`, not `art-v2/`), and has no SFX. Must not touch: the spec §7 binding step
rules (skippable/revisable/why-explained/one-thumb), or `updateProfile`/`updatePlan` shapes in
`app/src/lib/learner-state.ts`. Gate battery: `/onboarding` a11y entry; GATE-009 (renders a loading
state instead of crashing while `state` is null).

**Economy + quests + shop.** Owns `/quests` and `/shop`, which are, by their own doc-comments,
deliberate honest empty states ("A later stream builds the real quests page... so the route never
404s"). No economy state exists beyond `xp` — `AppStatBar.tsx` displays `state.xp` as "gems" and
hearts is a hardcoded `const HEARTS = 5` with an explicit `// TODO(hearts-economy): hearts are a fixed
5 until the lives/refill system ships in a later wave` comment. Must not touch: the evidence-derived
`xp` accrual in `recordEvidence` (`app/src/lib/learner-state.ts`) — any new currency must be additive,
not a replacement of "XP only for real evidence, discounted by guess likelihood and signal quality."
Gate battery: `/quests`/`/shop` a11y entries only; no economy-specific tests exist yet.

**Teacher compiler UI.** Owns the eventual `TeachClient.tsx` surface for the whole-course AI
compiler. The engine (`app/src/lib/engine/compile-course.ts`: `sanitizeCoursePlan`,
`planToCourseDraft`) and the route (`app/src/app/api/compile-course/route.ts`) are built and unit
tested (`compile-course.test.ts`, `compile-course.live.test.ts`), but `TeachClient.tsx` never imports
or calls any of them — verified by grep, zero matches for `compile-course`/`compileCourse`/
`sanitizeCoursePlan`/`planToCourseDraft`. Contrast with the single-question draft/ratify flow
(`draftQuestionsForConcept`, `suggestLinksForDoc`), which **is** wired into `TeachClient.tsx`. A
teacher cannot trigger a whole-course compile from the product today. Must not touch:
`sanitizeCoursePlan`'s DAG-enforcement and unit/lesson caps, `planToCourseDraft`'s "no `math` step is
ever auto-emitted" rule, or the compiled-draft default `status: "draft"` (never auto-published). Gate
battery: unit tests on the engine only; no e2e/UI gate exists yet — this is the largest concrete gap
in the "teacher owns everything" chain.

**Progress.** Owns `/progress` → `ProgressClient.tsx`, already live: multi-dimensional mastery (§22),
audit trail (GATE-006 made visible), "Join your class," and `app/src/components/Achievements.tsx`
(evidence-gated badges — a different, already-shipped mechanic from the `/quests` placeholder). Wave 2
scope: dark-shell/art-v2 continuity, plus a home for the sound toggle — `isSfxEnabled`/
`setSfxEnabled` (`app/src/lib/sfx.ts`) exist but are called from **no** component; there is no UI
control for sound anywhere in the product today. Must not touch: `dominantMisconception`/`retentionAt`
read-only display logic, `resetLearnerState`'s explicit-reset semantics.

**Exam.** Owns `/exam` → `app/src/components/ExamPlanClient.tsx`, already functionally live
(exam-date back-planning display). Wave 2 scope is visual continuity with the dark shell and an
art-v2 swap only. Must not touch `buildReviewQueue`'s exam-priority branch in
`app/src/lib/engine/scheduler.ts` — this route is display-only over engine output.

**Labs restyle.** Owns `/lab`, `/lab/solow`, `/lab/budget` (`SolowLab.tsx`, `BudgetLab.tsx`). Already
partially aligned with the dark-shell tokens (`--app-surface`, `--app-border`, `--growth-green-tint`
— confirmed present in both components), but AAA touch-target sizing on lab sliders is explicitly
deferred to Fabel per the D-016-era comment in `app/scripts/lab-keyboard.e2e.mjs` (24px AA vs 44px
AAA/button convention). Must not touch: `app/src/lib/engine/solow.ts`/`budget.ts`/`euler.ts` geometry
(GATE-002 — "the geometry always obeys the mathematics"). Gate battery: `scripts/lab-keyboard.e2e.mjs`
(keyboard operability, reduced-motion, touch-target sizes); a11y entries for all three lab routes.

**Settings.** No `/settings` route exists at tip. The two pieces of settings-shaped state that exist
without a screen are the SFX toggle (`SFX_STORAGE_KEY` in `app/src/lib/sfx.ts`) and personalization
reset (`resetLearnerState`, currently buried inside `/progress`). This is a from-scratch stream. Must
not touch: the `LearnerProfile` shape or the field-by-field backward-compatible merge in
`loadLearnerState` (`app/src/lib/learner-state.ts`).

**Art.** Owns the `art-v2/eco-*` mascot rewiring that `app/public/ASSETS.md` itself flags as
outstanding: "the v2 set SUPERSEDES the v1 creature set below, but v1 files stay in place untouched
until the Wave-2 streams rewire components to `art-v2/`." Verified: only `app/src/app/page.tsx` (the
landing) references `art-v2/`; every app-shell component that renders mascot art
(`HomeClient.tsx`, `LessonPlayer.tsx`, `OnboardingClient.tsx`, `BankClient.tsx`, `ReviewClient.tsx`,
`QuestionCard.tsx`, `Achievements.tsx`, `TeachClient.tsx`) still points at `/art/creature-*.webp` v1
assets. Must not touch: the append-only provenance ledger in `ASSETS.md` (new rows only, never rewrite
history) or the GATE-002 boundary — no new decorative asset may become a truth-critical visual.

**XP engine.** `xp` is the only economy currency today, computed inline inside `recordEvidence`
(`app/src/lib/learner-state.ts`): `xp: state.xp + (e.correct ? Math.round(10 * (1 - guessLikelihood) *
signalQuality) : 2)`, displayed as "gems" in `AppStatBar.tsx`. There is no separable, testable "XP
engine" module — XP is a side effect of mastery-evidence recording, not its own file. Must not touch:
the `signalQuality`/`guessLikelihood` discount from `app/src/lib/engine/mastery.ts` that already
throttles XP-farming via fast guesses — any real XP engine must compose with this discount, not
bypass it.

**Economy cloud sync.** `xp` and `completedLessonIds` already sync through the existing profile-row
pipeline: `app/src/lib/sync.ts`'s `hydrateRemoteState`/`pushState` read/write `profiles.xp` and
`profiles.completed_lesson_ids`, and `app/supabase/migrations/20260716_phase1_learner_core.sql` line
14 defines `xp integer not null default 0 check (xp >= 0)`. None of the seven migrations under
`app/supabase/migrations/` define gems-distinct-from-xp, hearts, streak-freeze, or quest-progress
columns (verified by grep across all seven files). A Wave 2 economy stream needs an additive
migration plus an extension of `hydrateRemoteState`/`pushState`; it must not touch the append-only
evidence-event dedupe key (`user_id, client_seq`) or the "remote wins for profile/plan/xp/completions,
mastery merges per concept" rule in `hydrateAndMerge` (`app/src/lib/learner-store.ts`).

**World 1 content.** `app/src/content/econ13210/worlds.ts` marks World 1 ("Building an economy")
`available: false` with zero lessons; only World 2 (Solow) has lessons in
`app/src/content/econ13210/index.ts`. From-scratch content stream flowing through the same
`Concept`/`ConceptEdge`/`Lesson`/`Question` types World 2 uses. Must not touch World 2's existing
slugs/ids, or the `planned_unverified` `sourceStatus` default — no lecture files exist in the repo for
any world (D-005).

**Adversarial evals.** Layer 1 (`app/src/lib/ai/__tests__/tutor-evals.test.ts`, mocked, runs in CI)
and Layer 2 (`tutor-evals.live.test.ts`, opt-in via `RUN_AI_EVALS=1`) already cover the `/api/explain`
citation-fabrication surface end to end (D-018). The course compiler
(`app/src/app/api/compile-course/route.ts`) and the tiered question factory
(`app/src/app/api/draft-questions/route.ts`) have unit tests on their sanitizers
(`compile-course.test.ts`, `authored-factory.test.ts`) but not the same adversarial-injection battery
the tutor endpoint has. Must not touch: the exported `TUTOR_SYSTEM_PROMPT`/`buildFacts` contract in
`app/src/app/api/explain/route.ts` that the live eval imports verbatim — new evals for the newer
routes must import the real route contracts the same way, never a hand-copied fork.

**PWA.** No `manifest.json`, service worker, or install-prompt code exists anywhere under `app/`
(confirmed by filesystem search); `app/next.config.ts` carries no PWA plugin config. From-scratch
stream. Must not touch: the existing `viewport`/`metadata` exports in `app/src/app/layout.tsx` it
would extend.

**Error pages.** No `not-found.tsx`, `error.tsx`, or `global-error.tsx` exists under `app/src/app` —
Next.js serves its default chrome, outside the dark-shell design system, on every 404/error today.
From-scratch stream. Must not touch: existing `notFound()` calls already in route code (e.g.
`app/src/app/lesson/[lessonId]/page.tsx`'s `if (!lesson) notFound();`) — a new `not-found.tsx` must
handle that call, not replace the check.

**Analytics restyle.** `/teach/analytics` → `ClassAnalyticsClient.tsx` already uses the shared
dark-shell tokens (`--app-surface`, `--growth-green-tint` — confirmed present) and already implements
the real feature (mastery data via `app/src/lib/engine/class-analytics.ts`, GATE-005-respecting
owner-only reads). Wave 2 scope here is cosmetic continuity with whatever the lesson/lab streams land
visually, not new functionality. Must not touch: the RLS-respecting degrade-to-empty behavior
(GATE-009) in `fetchClassMastery`.

**e2e expansion.** Three smokes exist today — `app/scripts/smoke.e2e.mjs`,
`app/scripts/teach-smoke.e2e.mjs`, `app/scripts/lab-keyboard.e2e.mjs` — run in
`.github/workflows/ci.yml` alongside `npm run a11y`. None exercises `/quests`, `/shop`, the compiler
UI (it doesn't exist yet), or a full lesson→review→mastery-update round trip in the same process
(`sync.integration.test.ts` covers the Supabase side in isolation, opt-in only via
`RUN_SYNC_INTEGRATION=1`). The a11y gate itself runs only two breakpoints (`mobile` 390×844,
`desktop` 1280×900 in `app/scripts/a11y-audit.mjs`) — no tablet breakpoint, despite Phase 3's exit
criterion naming "3 breakpoints." Must not touch: the existing three smokes' pass/fail contract, or
the CI job's zero-secrets guarantee (new opt-in tests must self-skip without their `RUN_*` env var).

**Perf budget.** `docs/06-roadmap.md` Phase 7 names "p95 lesson-step < 200 ms server time" as an exit
criterion; no perf-budget tooling (Lighthouse CI, bundle-size check, timing assertion) exists in
`app/package.json` scripts or `.github/workflows/ci.yml` today. From-scratch stream. Must not touch:
the existing CI job's structure — a new perf step should be additive, after the existing gates.

## 3. Integration wiring plan — the merge-time contract

This is what a Wave 2 stream's PR must actually wire, and what must not regress when it does.

**SFX into lesson / quests / survey.** `playSfx(name: SfxName)` (`app/src/lib/sfx.ts`) is
synchronous, SSR-safe, fails silently, and already proven correct by `app/src/lib/__tests__/sfx.test.ts`
plus its two live call sites in `BankClient.tsx`/`ReviewClient.tsx` (`playSfx(correct ? "correct" :
"wrong")` on answer submit). The lesson-flow, quests, and survey streams must call it the same way —
at the point correctness/completion is already known, never speculatively, and never on a path that
can throw before the sound decision is made. It must keep no-oping without `window`/`AudioContext` and
must keep reading `isSfxEnabled()` (persisted flag) rather than a hardcoded on/off.

**Economy helpers (e.g. `recordLessonComplete`) into the lesson flow.** No such helper exists yet.
`app/src/lib/learner-state.ts` has `completeLesson(state, lessonId)` (marks the id done, no currency
effect) and `recordEvidence(state, e)` (the only path that grants `xp`, always evidence-gated). A
lesson-completion bonus must be a **new**, additive function that composes with `recordEvidence`'s
existing discount rather than granting currency independently of evidence — otherwise XP-farming
(the exact thing `signalQuality`/`guessLikelihood` in `app/src/lib/engine/mastery.ts` exists to
prevent) reopens through the back door. Any new helper must go through `mutateLearnerState` (the sole
mutation funnel in `app/src/lib/learner-store.ts`) so `schedulePush` keeps firing.

**XP engine into economy state.** Until XP is factored out of `recordEvidence` into its own module,
"economy state" (gems/hearts/streaks-as-currency) must treat `state.xp` as the seed value it
transforms or extends — never a second, independently-computed number that can drift from the
evidence-backed one `AppStatBar.tsx` already displays as "gems."

**Economy-sync migration application + hydrate/push wiring.** New economy columns/tables must follow
the existing seven-migration pattern (`app/supabase/migrations/20260716_...` through
`20260718_...`, additive-only, RLS from day one) and extend `hydrateRemoteState`/`pushState`
(`app/src/lib/sync.ts`) exactly where `xp`/`completed_lesson_ids` already round-trip — same
null-safe-when-unconfigured shape, same debounced write-through, same "remote wins for
profile-like fields, mastery merges per concept" rule in `hydrateAndMerge`
(`app/src/lib/learner-store.ts`). It must not touch the evidence-event dedupe key (`user_id,
client_seq`) that keeps `evidence_events` append-only and retry-safe.

**Compiled-plan → learner-surface consumption path (the GATE-001 chain).** This is the single
biggest missing wire in the whole system: `app/src/lib/engine/compile-course.ts` can turn a teacher's
document sections into a full `CourseDraft` (concepts + edges + lessons), and
`app/src/app/api/compile-course/route.ts` can produce that draft from a live model call — but nothing
downstream ever consumes it. `content/econ13210/index.ts` is still 100% hand-authored; no teacher
review/ratify UI exists for a compiled plan; no persistence layer stores a compiled draft against a
`courses` row; no learner-facing route reads compiled content instead of the static import. The
correct wiring mirrors the pattern that already works for single citations
(`app/src/lib/teacher-state.ts`'s `approvedLinks`) and single questions
(`toAuthoredQuestion`/`toAuthoredQuestionMulti` in `app/src/lib/engine/authored.ts`): teacher triggers
compile → `sanitizeCoursePlan` output shown in a new review UI, unit by unit, lesson by lesson →
teacher edits/approves/rejects → only approved lessons become real, learner-visible `Lesson` rows via
`planToCourseDraft` → publication to enrolled students follows the same "approved-only" read policy
`published-grounding.ts` already implements for citations. Nothing may skip the approval step; a
compiled plan is a draft exactly like an AI-suggested link or AI-drafted question, never
auto-published (GATE-001).

**What every wire above MUST preserve:** GATE-001 (a citation/lesson/question is never presented as
verified/live without an explicit teacher approval step); GATE-002 (no answer key, equation, or
truth-critical visual is ever generated — only code-rendered from `engine/`); GATE-009 (every new
network/AI call degrades to a typed, non-crashing fallback, exactly like `/api/explain`,
`/api/compile-course`, and `/api/draft-questions` already do); determinism (mastery, scoring, and
scheduling stay pure functions with no hidden AI call in the hot path); and provenance (every new
authored/generated artifact carries a `provenance` tag — `ai_approved`, `teacher_authored`,
`planned_unverified` — the same way `toAuthoredQuestion` and `ASSETS.md` already do).

## 4. Truth-gate inventory as implemented today

**GATE-001 — no uncited/unratified instructional claim.** Enforced by: `Citation.status` typed as
`SourceStatus` with the explicit rule "a citation with no `sourceFileId` must be presented as
pending, never as a real source" (`app/src/lib/engine/types.ts`); `app/src/lib/grounding.ts`'s
`useGroundedCitations`/`useHasGroundedContent`, which only ever promote a citation once a teacher's
`approvedLinks` entry exists (`app/src/lib/teacher-state.ts`); rendering in
`app/src/components/CitationChips.tsx` (`⚠` for `planned_unverified`, `📄` for real sources); server
enforcement in `app/src/app/api/explain/route.ts` (`TUTOR_SYSTEM_PROMPT` forbids the model from citing
at all — "the app attaches citations itself") and `app/src/app/api/compile-course/route.ts`
(`sourceSectionIds` filtered to `allowedSectionIds`, a fabricated section id cannot survive
`sanitizeCoursePlan`). Published (cross-account) grounding is additionally RLS-gated —
`app/src/lib/published-grounding.ts` only ever reads `status='approved'` rows.

**GATE-002 — no AI-generated truth-critical visual, equation, or answer key.** Enforced by:
`app/src/lib/engine/solow.ts`, `budget.ts`, `euler.ts` being the sole source of lab geometry (rendered
in `SolowLab.tsx`/`BudgetLab.tsx`/`MiniSolowDiagram.tsx`, never an image); `MathTex.tsx` rendering all
equations via KaTeX from stored LaTeX, never an image; `app/src/lib/engine/scoring.ts`'s
`scoreAnswer` being the only function that ever decides correctness, always against a stored
`answerKey`; `app/src/lib/engine/authored.ts`'s `toAuthoredQuestion`/`toAuthoredQuestionMulti`/
`toAuthoredNumeric`, which only mint a real question from a **teacher-confirmed** `correctIndex`/
`correctIndices`/`value` argument, defaulting to the model's suggestion only when the teacher left it
unset; `sanitizeDraftedNumeric`'s digit-grounding guard (every numeric operand the model uses must
literally appear in the stem, so it "can't invent 'GDP grew 7%' out of thin air"); and
`compile-course.ts`'s explicit refusal to ever emit a `math` lesson step (`buildLessonSteps` has no
branch that creates one).

**GATE-009 — no silent provider failure.** Enforced per-route: `/api/explain`, `/api/compile-course`,
and `/api/draft-questions` all return a typed `{error: "..."}` + appropriate status (400/503/502) on
any failure, never a thrown 500 the client can't interpret, and each route's client-side caller
(`app/src/lib/ai/explain.ts`, `app/src/lib/ai/draft-questions.ts`, `app/src/lib/ai/suggest-links.ts`)
falls back to a deterministic path or an empty list. The sync layer
(`app/src/lib/sync.ts`/`app/src/lib/supabase.ts`) exposes a typed `SyncStatus` (`local_only |
syncing | synced | error`) rendered by `app/src/components/SyncBadge.tsx` so degradation is visible,
never silent. `app/src/lib/sfx.ts` follows the same spirit for a non-network concern: every entry
point is wrapped in `try/catch` so a broken `AudioContext` can never break the app.

**D-013 accessibility exception.** Implemented in `app/scripts/a11y-audit.mjs`:
`isBrandButtonException(v, node)` allows exactly one violation type — `color-contrast` on a node
matching `.btn-primary` (app shell) or `.l-btn--primary` (light landing) — the white-on-Growth-Green
(#35C46A, ≈2.3:1) primary CTA the product owner's brand direction mandates. Every other
serious/critical axe violation across all routes at both breakpoints fails the gate; this is the one
documented, code-enforced carve-out, not a blanket exemption.

**§22 multi-dimensional mastery rule.** Implemented in `app/src/lib/engine/mastery.ts`: a learner is
never reduced to one number. `MasteryState` (see `app/src/lib/engine/types.ts`) carries `conceptual`,
`procedural`, `graphInterpretation`, `formulaRecall`, `transfer`, `confidence`, `retentionStrength`,
and per-slug `misconceptionProbability`, each an independent exponentially-weighted evidence average
in `[0,1]`. `dimensionsFor(questionType)` decides which dimensions a given evidence event is even
allowed to move (e.g. a `numeric` answer only informs `procedural`; `equation_assembly` only informs
`formulaRecall`), and `applyEvidence` discounts every update by `signalQuality` (hints, repeated
attempts, anomalously slow responses) and `guessLikelihood` (fast, correct, low-difficulty MC).
`app/src/components/ProgressClient.tsx` and `app/src/lib/engine/class-analytics.ts` both read and
display these dimensions separately rather than collapsing them — the PRD's binding rule
(`docs/02-prd.md` §4, itself citing spec §22) holds in the shipped code.

## 5. Roadmap refresh

See surgical edits in `docs/06-roadmap.md`: MVP commitment statuses added under §1, a Status column
added to the phase table in §2, and a new §7 "Wave 3" section appended. Original prose in both
sections is left intact — only status annotations and new content were added, per the ownership rule
for this document (the decision log itself, `docs/00-execution-summary.md`, is not touched).
