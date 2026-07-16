# Ecolingo — AI Orchestration Design (v1)

## 1. The split (binding, spec §4)

**AI generates:** explanations, analogy selection, question variants (drafts), lesson sequencing proposals, summarization, misconception identification, teacher assistance, document→structure conversion, representation choice, language/depth adaptation, draft rubrics/feedback, coverage-gap detection.

**Deterministic systems own:** numerical answers, symbolic math, graph constraints, scoring, prerequisite rules, deadlines, mastery calculations, source citations, permissions, scheduling constraints, assessment locks, versioning, audit logs.

Every agent below is a **typed function**: zod-validated input → zod-validated output; outputs that fail validation are retried once with the validation error, then routed to failure handling. No agent writes directly to the database — a deterministic service layer applies validated outputs, enforcing locks, approvals, and provenance.

Model tiering (spec §19): strong model for offline compilation (ingestion/curriculum/evaluator) and complex teacher requests; fast model for classification, hint generation, ordinary explanations; grounded explanations cached by `(chunk_ids, mode, profile_bucket, prompt_version)`.

## 2. Agent registry (spec §20)

Common contract for all agents — **failure handling:** timeout → retry with backoff (2) → degrade (see per-agent) → surface typed error state in UX (never a silent failure, GATE-009). **Observability:** every call emits `agent_call(agent, model, prompt_version, latency_ms, token_in/out, validation_ok, degraded)` plus per-agent events. **Evaluation:** every agent has a golden dataset + scorers in the eval suite (`docs/05` §5); prompts are versioned and eval-gated before rollout.

### 20.1 Ingestion agent
- **In:** `{sourceFileId, kind, pages[{pageNo, text, imageRefs[]}]}`
- **Out:** `{sections[], equations[{latex, pageNo, bbox?}], definitions[{term, text, pageNo}], graphs[{kind, pageNo, description}], terminology[{symbol, meaning, pageNo}], citations[{pageStart,pageEnd,quote}]}`
- Degrade: page-level plain-text chunks only; flag file `needs_review`. Evals: extraction precision/recall vs hand-labelled lecture pages; equation LaTeX exact-match.

### 20.2 Curriculum agent
- **In:** ingestion outputs + course settings.
- **Out:** `{modules[], concepts[{slug,name,definition,importanceSuggestion,difficulty}], prerequisiteEdges[{from,to,confidence}], learningObjectives[], commonTraps[], assessmentExpectations[]}` — all `ai_draft`, teacher-gated.
- Degrade: propose flat module list from headings. Evals: edge precision vs expert graph; DAG validity (deterministic post-check rejects cycles).

### 20.3 Assessment agent
- **In:** concept + objectives + source chunks + misconception registry.
- **Out:** `{questions[{type, stem, payload, difficulty, expectedSeconds, distractors[{text, misconceptionSlug}], answerKeyDraft, equivalenceRulesDraft, rubricDraft?, citations[]}]}` — drafts only; deterministic validator must solve numeric/symbolic items from the key before a teacher ever sees them (GATE-003 pre-check).
- Degrade: template-instantiated variants of approved questions only. Evals: key-solves-question rate = 100% required; distractor→misconception mapping accuracy.

### 20.4 Visual agent
- **In:** concept + equation + desired representation.
- **Out:** a **spec, not pixels**: `{kind: 'coded_graph'|'equation_animation'|'timeline'|'causal_chain'|'illustration_brief'|'video_brief', params, constraintSpec}`. Coded-graph specs compile against `visual_models.param_schema`; illustration/video briefs route to gen-media (§6) and are never truth-critical.
- Degrade: fall back to static code-rendered graph with default params. Evals: spec compiles; constraint spec satisfies TEST-ECON invariants.

### 20.5 Tutor agent (Explain)
- **In:** `{mode, target{type,id,text}, retrievedChunks[{id,text,citation}], profile{explanationOrder, mathDepth, tone, analogyDomains}, masterySnapshot, currentMistake?, notationRegistry, lockedDefinitions}`
- **Out:** `{explanation: Segment[] (text|math|graphRef), citations[{chunkId,label}], uncertainty: 'grounded'|'partially_grounded'|'not_in_sources', followUps[]}`
- **Hard rules in contract:** cite every instructional claim to a retrieved chunk; if retrieval is empty → `not_in_sources` and say so; never rewrite locked definitions/notation (registry text is interpolated verbatim); active assessment-lock ⇒ Socratic mode only.
- Degrade: deterministic grounded panel (the slice's `deterministicExplain`) — templated from approved definition + equation + citation, no free generation. Evals: citation-faithfulness (claim⊆chunk entailment), notation preservation, hallucination rate on adversarial "not in course" probes.

### 20.6 Evaluator
- **In:** any generated object + its sources.
- **Out:** `{sourceFaithfulness 0–1, mathCorrect bool (delegates to symbolic checker), answerConsistency bool, difficultyEstimate, ambiguityFlags[], duplicateOf?}`
- Runs in CI (golden sets) and online (sampled production traffic). Degrade: block publish (fail-closed for truth-critical content).

### 20.7 Scheduler — **deterministic, not an LLM** (listed here because §20 requires its contract)
- **In:** `{examDate?, masteryStates[], importance, errorHistory, confidence, minutesPerDay, noStudyDays[]}`
- **Out:** `{queue[{conceptId, dueAt, reasonCode, reasonText}], dailyPlan[]}` — reasons rendered to learners verbatim.
- Failure: never fails open into silence; empty inputs yield an onboarding prompt. Evals: property tests (monotonicity: lower retention ⇒ earlier due; rest days never scheduled).

### 20.8 Teacher copilot
- **In:** class aggregates (mastery heatmap, misconception clusters, weak questions, coverage gaps).
- **Out:** `{reteachRecommendations[], interventions[{studentRef, evidence, suggestion}], weakQuestions[], missingCoverage[]}` — advisory only; every suggestion carries evidence links; no automatic action.
- Degrade: rule-based thresholds without prose. Evals: teacher-rated usefulness in pilot; evidence-link validity.

## 3. Prompt & tool schemas

Prompts live in `app/src/lib/ai/prompts/` (versioned files, `{agent}.v{N}.md`), each paired with a zod I/O schema in `app/src/lib/ai/schemas.ts` (slice ships the tutor pair as the pattern). Tool-calling: retrieval is exposed to the tutor agent as a single tool `search_course_sources(query, courseId)` whose implementation enforces permission scoping **before** vector search — the model can never widen scope. Provider abstraction: `ExplainProvider` interface (`generate(input): Promise<TutorOutput>`), implementations: `DeterministicProvider` (slice default), `AnthropicProvider`/`OpenAIProvider` (Phase 3, streaming, structured outputs).

## 4. Orchestration flows

- **Course compilation (Phase 2 job):** upload → parse pages → ingestion agent (per file) → curriculum agent (course-level) → evaluator pass → teacher review queue. Long-running via job runner with per-step checkpoints; idempotent by `sha256`.
- **Explain (online):** target → notation/locked-definition fetch → scoped retrieval → cache check → tutor agent (fast model) → citation validation (deterministic: every cited chunkId ∈ retrieved set, else strip claim & flag) → render.
- **Question generation (Phase 3+):** assessment agent → deterministic key validation → evaluator → teacher approval → publish.

## 5. Explain-mode routing

| Mode | Model tier | Notes |
|---|---|---|
| simpler / three-sentences / step-by-step / intuition / mathematics / example | fast | cacheable |
| graph | none | routes to visual agent spec → code-rendered graph |
| why-wrong | fast | input includes misconception mapping from deterministic scorer |
| analogy (football/business/Armenia) | fast, post-MVP | analogy must not alter model semantics; evaluator-sampled |
| Socratic / free question | strong | integrity-mode default is Socratic |

## 6. Generated-media policy (spec §17 — binding)

Higgsfield MCP: landing hero films, mascot exploration (with Fabel), trailers, world backgrounds, promos, onboarding demos, chapter transitions, social assets. **Never** the sole representation of an examinable model.

Fast image model: lesson illustrations, analogy scenes, thumbnails, achievement art, character variations. Higher-fidelity model: hero art, complex infographics, marketing, controlled-text images.

**Never image-generate:** equations, precise economic graphs, answer keys, chart values, draggable visualizations, exact geometry. Truth-critical visuals are rendered and controlled in code (GATE-002).
