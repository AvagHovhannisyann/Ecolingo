# Ecolingo — Data Model, RLS & Permission Matrix (v1)

Target: Supabase Postgres with Row Level Security. The vertical slice implements the content/mastery subset as TypeScript types + an in-memory store behind `CourseRepository` (D-003); the SQL below is the Phase 1 migration baseline.

## 1. Global conventions (apply to every entity, satisfying §21's per-entity requirements)

- **Primary key:** `id uuid primary key default gen_random_uuid()`.
- **Tenancy:** every row resolves to an `organization_id` and (where course-scoped) `course_id`; both indexed. Personal artifacts resolve to `user_id`.
- **Timestamps/versioning:** `created_at timestamptz default now()`, `updated_at` (trigger-maintained); mutable instructional content additionally carries `version int` and immutable history in `content_versions`.
- **Soft delete / retention:** `deleted_at timestamptz` (null = live). Student evidence (`student_responses`, `mastery_states`, `audit_events`) is never hard-deleted inside retention windows; user-initiated erasure runs the documented export+delete workflow (§25) which anonymizes evidence rather than destroying class aggregates.
- **Audit:** every insert/update/delete on truth-critical tables (marked ★ below) fires a trigger writing `audit_events(actor, action, entity, entity_id, before, after)`.
- **RLS:** enabled on **every** table; policies in §4. No table is readable without an explicit policy.
- **Provenance:** every AI-derived instructional row links to `citations` (n:m via `citation_links(entity_type, entity_id, citation_id)`); `source_status enum('verified','planned_unverified','teacher_authored')`.
- **Indexes:** listed per entity as "IX".

## 2. Entities (35, per spec §21)

| # | Table | Purpose / key columns beyond conventions | IX (main query paths) |
|---|---|---|---|
| 1 | `users` | auth identity (Supabase `auth.users` mirror): email, locale | (email) |
| 2 | `profiles` | role enum(student/teacher/independent), onboarding answers, personalization prefs (explanation_order, math_depth, visual_first, tone, a11y prefs), language_burden, math_readiness | (user_id) |
| 3 | `organizations` | tenant: name, kind(school/individual), settings | — |
| 4 | `courses` ★ | org_id, owner_id, title, subject, level, language, dates, grading_style, visibility enum(private/public), join_code char(6) unique, published_version_id | (org_id), (join_code) |
| 5 | `course_memberships` ★ | course_id, user_id, role enum(owner/teacher/ta/student), status | (course_id,user_id) unique, (user_id) |
| 6 | `course_versions` ★ | course_id, version, snapshot metadata, published_at, published_by | (course_id,version) unique |
| 7 | `source_files` ★ | course_id, kind enum(syllabus/lecture/notes/reading/assignment/solution/exam/rubric/dataset/transcript), storage_path, sha256, status enum(uploaded/processing/indexed/failed/removed) | (course_id,kind) |
| 8 | `source_pages` | source_file_id, page_no/slide_no, text, image_ref | (source_file_id,page_no) |
| 9 | `source_chunks` | source_page_id, span offsets, text, embedding vector(1536) | (source_page_id), ivfflat(embedding) |
| 10 | `citations` ★ | source_file_id, page_start, page_end, quote, label ("Lecture 2, slides 5–7") | (source_file_id) |
| 11 | `concepts` ★ | course_id, slug, name, world/module, definition, importance 1–5, examinable bool, locked bool, source_status | (course_id,slug) unique, (course_id,world) |
| 12 | `concept_edges` ★ | course_id, prereq_concept_id → concept_id, kind enum(requires/supports), confidence | (course_id,concept_id), (course_id,prereq_concept_id); CHECK no self-edge; acyclicity enforced in app layer + nightly job |
| 13 | `learning_objectives` | concept_id, text, bloom_level, examinable | (concept_id) |
| 14 | `notations` ★ | course_id, symbol, latex, meaning, locked bool, conflicts jsonb | (course_id,symbol) |
| 15 | `equations` ★ | concept_id, latex, canonical_form, derivation_ref, approved bool | (concept_id) |
| 16 | `visual_models` ★ | concept_id, kind enum(solow/budget/euler/pih/classifier/fiscal/custom), param_schema jsonb, constraint_spec jsonb (deterministic expected interpretations per state) | (concept_id) |
| 17 | `lessons` ★ | concept_id, version, status enum(draft/approved/published/hidden), estimated_minutes | (concept_id,status) |
| 18 | `lesson_steps` ★ | lesson_id, order, type enum(core_idea/intuition/visual/math/guided/mastery_check), payload jsonb (typed per step), completion_criterion jsonb, adaptation jsonb | (lesson_id,order) unique |
| 19 | `questions` ★ | concept_id, type enum(mc_single/mc_multi/numeric/equation_assembly/diagram_label/causal_order/…), stem, payload jsonb, difficulty 1–5, expected_seconds, transfer_distance, provenance enum(teacher_authored/ai_draft/ai_approved), assessment_locked bool, generation_model, prompt_version | (concept_id,provenance,difficulty) |
| 20 | `question_variants` ★ | question_id, seed/params jsonb, practice_only bool | (question_id) |
| 21 | `answer_keys` ★ | question_id/variant_id, key jsonb, equivalence_rules jsonb (tolerance, symbolic forms, unit rules), validation_method | (question_id) |
| 22 | `rubrics` ★ | question_id, criteria jsonb, approved bool | (question_id) |
| 23 | `misconceptions` ★ | concept_id, slug, description, remediation_hint, distractor_map jsonb | (concept_id,slug) unique |
| 24 | `student_responses` | user_id, course_id, question_id/variant_id, answer jsonb, correct bool, hints_used, time_ms, attempt_no, misconception_ids uuid[] | (user_id,course_id,created_at), (question_id) |
| 25 | `confidence_ratings` | user_id, subject(question/concept), subject_id, rating 1–4 | (user_id,subject_id) |
| 26 | `mastery_states` | user_id, concept_id, the 8 per-concept estimates (§22), last_evidence_at, version | (user_id,concept_id) unique |
| 27 | `review_schedules` | user_id, concept_id, due_at, interval_days, reason_code, reason_text | (user_id,due_at) |
| 28 | `study_plans` | user_id, course_id, minutes_per_day, days_available int[], no_study_days date[], preferred_time | (user_id,course_id) unique |
| 29 | `exam_dates` | course_id, user_id nullable (personal override), title, at date, scope(concept_ids) | (course_id), (user_id) |
| 30 | `teacher_approvals` ★ | entity_type, entity_id, action enum(approve/reject/lock/hide/regenerate/edit), actor_id, note | (entity_type,entity_id) |
| 31 | `content_versions` ★ | entity_type, entity_id, version, body jsonb, author(kind: teacher/ai), diff_summary | (entity_type,entity_id,version) unique |
| 32 | `audit_events` | actor_id, action, entity_type, entity_id, before jsonb, after jsonb, request_scope jsonb (source-access scope of AI requests, §25) | (entity_type,entity_id), (actor_id,created_at) |
| 33 | `feature_flags` | key, scope(org/course/user), value jsonb | (key,scope) |
| 34 | `notifications` | user_id, kind, payload, read_at, channel | (user_id,read_at) |
| 35 | `analytics_events` | user_id nullable, course_id, name (`idea{NNN}_{event}` scheme), props jsonb | (name,created_at), (course_id) |

## 3. Content-model TypeScript mirror

`app/src/lib/engine/types.ts` mirrors rows 11–23 + 26–29 as the compile-time contract for the vertical slice. The Postgres jsonb payloads are the serialized forms of those types; zod schemas validate at the boundary (Phase 1).

## 4. RLS & permission matrix

Roles: `anon`, `student` (member), `ta`, `teacher` (course teacher), `owner`, `org_admin`, `service` (jobs).

| Resource | anon | student | ta | teacher/owner | org_admin | service |
|---|---|---|---|---|---|---|
| public course catalog rows | R | R | R | R | R | R |
| course (private) | — | R (member) | R | RW | R | RW |
| source_files/pages/chunks | — | — (retrieval only via scoped RPC) | R | RW | — | RW |
| citations | — | R (member, published content only) | R | RW | — | RW |
| concepts/lessons/questions (published) | — | R | R | RW | — | RW |
| drafts (status≠published) | — | — | R | RW | — | RW |
| answer_keys / rubrics | — | — (server-side scoring only; never selected by client) | R | RW | — | RW |
| own responses/mastery/schedules/plans | — | RW own | — | R (members, aggregate + individual per policy) | R aggregate | RW |
| other students' analytics | — | — | R | R | R (aggregate) | RW |
| teacher_approvals / content_versions / audit_events | — | — | R | RW (approvals), R (audit) | R | RW |
| feature_flags | — | R resolved | R | RW course-scope | RW org | RW |

Policy sketches (Phase 1 SQL):

```sql
-- membership helper
create function is_member(c uuid, min_role membership_role) returns boolean ...;

-- e.g. published lessons readable by members
create policy lessons_read on lessons for select
  using (status = 'published' and is_member(course_id_of(concept_id), 'student'));

-- answer keys never leave the server
create policy answer_keys_service_only on answer_keys for select
  using (auth.role() = 'service_role');
```

Hard rules (mirror spec §25): files private by default; retrieval RPC filters by org+course+role+membership **before** vector search; teacher file removal triggers downstream re-index & citation invalidation; student analytics visible only to authorized roles; sensitive data minimized (no demographic collection beyond what features need); no training on private course data without explicit permission (flag on `organizations.settings`); every AI request logs its source-access scope into `audit_events.request_scope`; public publishing requires explicit teacher action (`visibility` transition is audited); export & deletion workflows documented in ops runbook.

## 5. Integrity constraints that encode learning rules

- `concept_edges` acyclic (app-enforced + nightly check) — prerequisites are a DAG (MOAT-02).
- A `lesson` cannot reach `published` without: all six step types present, every step's `completion_criterion` non-null, and a `teacher_approvals(action='approve')` row (GATE — IDEA-185).
- A `question` cannot reach students without an `answer_keys` row and `validation_method` (GATE-003).
- `notations.locked` and `concepts.locked` rows are excluded from any AI rewrite path (GATE-004): enforced by the tutor-agent contract *and* a DB trigger rejecting updates whose actor kind = 'ai'.
- `mastery_states` updates must reference an `audit_events` evidence row (GATE-006): enforced in the service layer transaction.
