-- Phase 2 teacher content (docs/06 roadmap, decision D-009).
-- Teacher-uploaded source materials and their approved concept links — the
-- durable half of the ingestion round-trip. Owner-scoped RLS mirrors the
-- Phase 1 learner isolation posture (D-008): a teacher only ever sees and
-- edits their own uploads. Course-wide *published* grounding (students on a
-- different account reading an approved link) needs the course/enrollment
-- model and lands in Phase 3; this migration is the durable store for the
-- teacher's own review work.

create table public.source_documents (
  owner_id uuid not null references auth.users(id) on delete cascade,
  doc_id text not null,               -- deterministic content hash id (engine/ingest)
  title text not null,
  uploaded_at timestamptz not null default now(),
  char_count integer not null default 0 check (char_count >= 0),
  sections jsonb not null default '[]'::jsonb,   -- immutable per-doc section list
  created_at timestamptz not null default now(),
  primary key (owner_id, doc_id)
);

create table public.concept_links (
  owner_id uuid not null references auth.users(id) on delete cascade,
  doc_id text not null,
  section_id text not null,
  concept_slug text not null,
  score real not null check (score >= 0 and score <= 1),
  matched_terms text[] not null default '{}',
  -- GATE-001: only 'approved' rows ever become a learner-facing citation
  status text not null check (status in ('approved','rejected')),
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner_id, doc_id, section_id, concept_slug)
);
create index concept_links_owner_status on public.concept_links (owner_id, status);

-- source_documents are immutable once ingested (insert/delete only), so no
-- updated_at column or touch trigger. concept_links flip status, so they carry
-- updated_at maintenance.
create trigger concept_links_touch before update on public.concept_links
  for each row execute function public.touch_updated_at();

alter table public.source_documents enable row level security;
alter table public.concept_links enable row level security;

create policy source_documents_own on public.source_documents
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy concept_links_own on public.concept_links
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
