# Ecolingo — Product Requirements Document (v1)

Status: approved baseline for Phases 0–6. Changes require a decision-log entry (`docs/00-execution-summary.md` §2).

---

## 1. Thesis

Ecolingo is **an AI course compiler**: it turns a teacher's real materials into a personalized, visual, game-like learning path. It is not a Duolingo clone and not a generic chatbot wrapper. The experience may feel almost entirely AI-personalized; the truth-critical layer is deterministic (§4 of the master spec is binding: correct numerics, symbolic math, graph constraints, scoring, prerequisites, deadlines, mastery calculation, citations, permissions, scheduling, assessment locks, versioning, audit logs are never generative).

**Non-negotiable failure mode to prevent:** the app must never confidently teach an incorrect equation, hallucinate a source, distort official notation, or mark a mathematically equivalent answer wrong.

## 2. Product promises

**Student:** join or upload a course → set exam date and availability → get a personalized daily path → learn through visual explanations → practice adaptively → ask a grounded AI tutor → review before forgetting → track mastery, not completion.

**Teacher:** upload lectures/assignments/solutions/exams/rubrics/datasets/specs → platform compiles a structured path, concept-dependency graph, visual activities, adaptive questions, grounded explanations, a question bank, and a live class-mastery dashboard. **AI proposes; the teacher approves, edits, locks, rejects, regenerates, reorders.** The teacher is the instructional authority.

## 3. Personas & jobs-to-be-done

| Persona | Snapshot | JTBD |
|---|---|---|
| **Nare, struggling student** | 2nd-year econ; English is her third language; graphs feel arbitrary; exam in 4 weeks | "When lecture notation loses me, help me *see* the model move and explain it my way, so I can pass and actually understand." |
| **Dav, capable-but-behind student** | Missed 3 weeks; strong math | "Compress what I missed into what I must master before the midterm, skipping what I already know." |
| **Prof. A, course owner** | Teaches ECON 13210; protective of notation and rigor | "Turn my existing materials into practice my students actually do — without AI misteaching my course — and show me where the class is stuck." |
| **Lilit, independent learner** | No enrolled course; public/demo course user | "Give me a serious path through macro models without a university." |

## 4. Personalization & mastery model (binding, §22)

Per learner **and per concept**, maintain separate estimates — never one global percentage:

`conceptual`, `procedural`, `graphInterpretation`, `formulaRecall`, `transfer`, `confidence`, `retentionStrength`, `misconceptionProbability` (per misconception), plus learner-level `languageBurden` and `mathReadiness`.

Every mastery update consumes an **evidence event** carrying: correctness, difficulty, hints (count + type), response time, confidence, attempt number, recency, transfer distance, explanation quality (when present), and a guessing likelihood. Updates are auditable (GATE-006).

Every scheduled review is **explainable to the learner** in one sentence, e.g. *"You're seeing this because you understood it last week but your retention estimate is falling."* The scheduler API returns the reason with the item; the UI must render it.

## 5. Student journey maps

### 5.1 Onboarding (spec §7 — every step skippable when safe, revisable later, purpose-explained, one-thumb usable)

1. **Role** (student / teacher / independent) → routes flows; default student.
2. **Join or choose course** — join code (6-char, deterministic validation), upload own materials, public course, or ECON 13210 demo.
3. **Objective** — understand / exam prep / catch up / weak area / assignment.
4. **Schedule** — exam date, days available, minutes/day, preferred time, no-study days.
5. **Diagnostic** — math comfort, prerequisite check, graph reading, confidence-vs-performance capture; (English comprehension: post-MVP).
6. **Personalization survey** — analogy interests, math format, frustrations, tone, reading depth, visual preference.
7. **Calibration lesson** (post-MVP) — silently measures time-to-answer, hints, answer changes, confidence, preferred explanation, mistake pattern.

Skipping any step yields safe defaults and a visible "complete your profile" affordance. All answers editable in Profile → Personalization (IDEA-024).

### 5.2 Daily loop (the loop everything serves)

`open app → today's plan (lessons + due reviews within minute budget) → lesson (6-step anatomy, §7 below) → practice (adaptive difficulty) → feedback (misconception-specific, cited) → mastery update → next review scheduled (with reason) → session summary`.

### 5.3 Exam mode (post-MVP)

Backward plan from exam date over examinable concepts; final week switches to mixed mock practice and weakest-concept triage.

## 6. Information architecture & wireframe descriptions

*Structural/functional description only; visual design is Fabel's (D-001).*

**Desktop** — left nav: Learn, Review, Visual Lab, Question Bank, Exam Plan, Ask AI, Progress. Centre: current path (modules → concept nodes → review checkpoints → visual labs → challenge lessons → unit tests). Right panel: today's goal, streak, mastery score, upcoming exam, concepts-likely-to-be-forgotten, teacher announcements.

**Mobile** — bottom nav: Path, Practice, Ask, Progress, Profile. Lessons are full-screen cards; primary actions one-thumb reachable; touch targets ≥ 48 px; desktop density is never compressed onto small screens.

Screen inventory (each with entry point, empty, loading, success, error, recovery states — the per-item UX requirement): Onboarding wizard · Path · Lesson player · Practice session · Feedback panel · Explain panel · Solow Lab · Budget Lab · Review queue · Exam plan · Progress · Profile/settings · Teacher: course wizard, uploads, compilation status, review (map/graph/lessons/questions/conflicts), publish, dashboard · Report-an-error (global).

## 7. Lesson anatomy (LESSON-01..06 — binding schema)

Every lesson compiles to six typed steps, each with adaptation hooks, interaction telemetry, and an explicit completion criterion:

| Step | Content | Completion criterion |
|---|---|---|
| 1 Core idea | 1–2 sentence definition | viewed + dwell ≥ min-read OR explicit continue |
| 2 Intuition | concrete cause-and-effect | continue after interaction with chain |
| 3 Visual interaction | learner changes a parameter / moves an object / reveals a mechanism | target state reached (deterministic predicate) |
| 4 Mathematical form | equation after intuition (math-first learners see it earlier) | term-by-term reveal completed |
| 5 Guided practice | problem with structured hint ladder | correct answer (hints allowed) |
| 6 Independent mastery check | **new context** testing transfer | correct without hints ⇒ mastered-now; else remediation branch |

Canonical example (Solow): *"Capital per worker rises when actual investment exceeds the amount required to replace depreciated capital and equip new workers."* — `Δk = s·f(k) − (n+δ)·k`.

Step order adapts to `explanationOrder` profile (visual-first / math-first / text-first). Steps record `viewed/started/completed/abandoned` events.

## 8. The universal Explain button (spec §10 — binding rules)

Available on: paragraphs, equations, graphs, answer choices, feedback messages, teacher notes, worked examples, data tables, model assumptions.

Modes (MVP set bolded): **simpler · step-by-step · intuition · mathematics · example · graph · why-my-answer-is-wrong**, football analogy, connect-to-Armenia, compare-concepts, free question (post-MVP set).

Rules enforced by the tutor-agent contract (`docs/04-ai-orchestration.md` §5): preserve official notation (notation registry lookup precedes generation); preserve teacher-locked definitions verbatim; ground every claim in approved sources; show citations ("Based on Lecture 2, slides 5–7"); **never invent a citation** — if retrieval returns nothing, say the material doesn't cover it; state ambiguity explicitly; every explanation carries a "confusing/incorrect" report control.

## 9. Teacher journey maps (spec §11)

1. **Create course** — title, subject, level, language, prerequisites, difficulty, dates, exam dates, depth, grading style. Drafts auto-save.
2. **Upload materials** — syllabus, lectures, notes, permitted readings, assignments, solutions, past exams, rubrics, datasets, transcripts. Files private by default.
3. **AI compilation** — extracts concepts, definitions, equations, notation, graphs, objectives, prerequisite edges, common traps, examples, assessment expectations. Every object carries source provenance.
4. **Review** — course map, module order, dependency graph, lessons, questions, contradictions, uncertain interpretations surfaced as an explicit queue.
5. **Controls** — approve / edit / regenerate / reorder / lock / hide / attach note / mark examinable / set importance. Truth-critical content requires explicit approval before students see it (GATE — IDEA-185).
6. **Publish** — join code, student link, public/private, dates, assessment settings.
7. **Live dashboard** — class misconceptions, common wrong answers, students falling behind, confidence–mastery gaps, weak questions, recommended review topics.

### 9.5 Academic integrity mode (spec §24)

Teacher-configurable: assessment lock windows; no direct final answers during active graded work; Socratic-hints-only mode; teacher-defined allowed assistance; visible AI-use policy; audit logs; citation/attribution guidance; student confirmation before exporting generated text. The product distinguishes learning support from unauthorized completion of graded work.

## 10. Landing page (LAND-001..008 — content requirements for the Fabel build)

Copy is fixed by spec: headline **"hard ideas. made intuitive."**; CTAs **Start learning** / **Create a course**; final CTA **"Your next difficult course can feel manageable."** with Start learning / Build a course. Sections: hero (slide→interactive-model transformation, math rendered in code), *See the model move* (live interactive preview, not a static screenshot), *Explain it my way* (≥4 visible modes), *Practice before you forget* (example review queue + why-scheduled), *Built from your real course* (citation preview + approval status), teacher section (upload → map → review → publish → analytics; distinct value prop), no app-store badges until native apps exist. Visual execution: **Fabel**.

## 11. Design constraints recorded for Fabel handoff (D-001)

Verbatim constraints from spec §5/§14/§15/§16 that Fabel's deliverables must satisfy; engineering will not author these but will integrate them: original brand (no Duolingo mascot/layouts/green/fonts/slogans/trade dress); positioning "playful enough to remove fear, serious enough to trust before an exam"; specified palette (Growth Green #35C46A, Deep Ink #263238, Model Blue #31A8E0, Sun Yellow #FFC94A, Soft Coral #FF6B6B, Lavender #8B7CF6, Cloud White #FAFCF8, Mist Gray #E3E9E2); rounded display + legible body type, body ≥16–17 px, ≤~70 ch lines; radii (cards 16, lesson cards 20–24, buttons 14–18); touch targets ≥48–52 px; no glassmorphism/heavy shadows; mascot "Numa" (shape-shifting idea creature, 8 emotional states, never blocks content, never shames, event-driven, reduced-motion aware); motion specs for button press / correct / incorrect / graph sequencing (never animate all graph elements simultaneously; Rive for mascot; no pre-rendered video for controls or truth-critical diagrams).

**Engineering-owned invariants regardless of design:** reduced-motion + animation-off settings, no colour-only meaning, keyboard control, screen-reader labels, captions, sound off by default.

## 12. Component inventory (functional)

Layout: AppShell, LeftNav, BottomNav, RightRail, FullscreenCard. Learning: PathMap, LessonPlayer, LessonStep(×6 types), HintLadder, FeedbackPanel, ExplainButton, ExplainPanel, CitationChip, ReportErrorButton, SessionSummary. Practice: QuestionCard(×6 formats), ConfidenceRating, DifficultyStepper. Visuals: LabCanvas (SVG), ParamSlider, CurveHandle, StateReadout, NumericSymbolicToggle. Scheduling: ReviewQueue, ReviewReason, ExamPlanTimeline, DailyBudgetMeter. Teacher: CourseWizard, UploadDropzone, ProcessingStatus, ConceptGraphView, ApprovalQueue, LockBadge, ImportanceStars, ExaminableToggle, PublishDialog, MasteryHeatmap, MisconceptionReport. Trust: ProvenanceBadge, UncertaintyBanner, VersionHistory, AuditTrailView.

## 13. Accessibility specification (binding)

WCAG 2.2 AA floor. Keyboard: every core action operable, labs included (arrow keys adjust sliders/curve handles with announced values). Screen readers: KaTeX MathML output; labs expose a structured text alternative ("s = 0.30; steady state k* = 4.1; investment exceeds break-even left of k*"). Colour: never the only channel (curves get labels + dash patterns); colour-blind-safe pairs. Motion: `prefers-reduced-motion` respected globally + in-app toggle; no purely animated meaning. Touch: ≥48 px targets; one-thumb primary actions on mobile. Text: scalable to 200% without loss; body ≥16 px. Sound: off by default; captions on any video. Every backlog item's a11y acceptance runs through this spec.

---

## Appendix A — ECON 13210 course map & dependency graph

Worlds 0–7 as specified (§12), each concept carrying: prerequisite edges, formulas, graphs, common traps, transferable-question notes. **All content is `planned_unverified` until teacher lectures are ingested (D-005).**

High-level world dependencies:

```
W0 math/data foundations
 └─► W1 building an economy ─► W2 Solow growth ─► W3 consumption across time ─► W4 optimization
                                                       W3 ─────────────┘
 W0 ─► W5 business cycles & labour ─► W6 investment & fiscal policy ─► W7 monetary policy & forecasting
 W2 ──────────────────────────────────► W6
```

World 2 (seeded in `app/src/content/econ13210/`) internal graph:

```
production-function ─► per-worker-form ─► fundamental-equation ─► steady-state ─► stability
capital-accumulation ─┘        diminishing-returns ─┘                 ├─► parameter-shocks
population-growth ────┘                                               ├─► golden-rule
depreciation ─────────┘                                               ├─► growth-accounting
cobb-douglas ─────────────────────────────────────────────────────────└─► convergence ─► conditional-convergence
```

Remaining worlds are enumerated in the coverage matrix (IDEA-193..204) and compile through the same schema once materials arrive.
