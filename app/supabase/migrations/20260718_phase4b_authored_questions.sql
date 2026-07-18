-- Phase 4b authored questions (docs/04 §20 item-writer, decision D-014).
-- Teacher-ratified AI-drafted questions were local-first only (localStorage in
-- teacher-state.ts). This migration makes them durable AND published, exactly
-- mirroring the D-012 posture for grounding: a teacher approves a question on
-- one account, and every signed-in learner sees it in their Question Bank,
-- scored by the same deterministic engine against the teacher-ratified key.
--
-- Only teacher-approved questions are ever written here (toAuthoredQuestion runs
-- exclusively behind the D-014 ratification gate, provenance 'ai_approved'), so
-- every row in this table is by definition course-ready content — there is no
-- "unpublished" state to hide. That is why the read policy below is simply
-- USING (true) for authenticated users, matching the D-012 stance where
-- "published" == "readable by any signed-in user" under the demo's anonymous
-- auth. Real multi-course tenancy narrows that predicate to enrolled learners in
-- a later phase; that predicate is the single seam that changes.

create table public.authored_questions (
  owner_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null,             -- stable engine id: q-authored-<slug>-<hash>
  concept_slug text not null,
  question jsonb not null,               -- the full serialized Question object
  created_at timestamptz not null default now(),
  primary key (owner_id, question_id)
);
create index authored_questions_owner on public.authored_questions (owner_id);

alter table public.authored_questions enable row level security;

-- owner full access: a teacher reads/writes/prunes only their own rows, mirroring
-- the Phase 2 owner-scoped posture (source_documents_own / concept_links_own).
create policy authored_questions_own on public.authored_questions
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- published read: every row here is teacher-ratified course content, so any
-- signed-in user may read it (D-012 posture). OR'd with the owner policy above.
create policy authored_questions_read_published on public.authored_questions
  for select to authenticated
  using (true);
