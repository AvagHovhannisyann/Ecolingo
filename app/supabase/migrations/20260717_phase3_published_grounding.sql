-- Phase 3 published grounding (docs/06 roadmap, decision D-012).
-- A teacher grounds the course once; every enrolled learner should then see the
-- real citations — not just the teacher on the same device. Approving a link
-- already writes a `status='approved'` row (Phase 2); this migration opens the
-- READ side so any signed-in learner can see *published* (approved) course
-- content, while unreviewed uploads stay private to their owner.
--
-- Scoping note: with the demo's anonymous auth there is no course/enrollment
-- model yet, so "published" means "readable by any signed-in user". Real
-- multi-course tenancy narrows this to enrolled students in a later phase; the
-- policy predicate is the single seam that changes.

-- approved links are course content: readable by any signed-in user.
-- Unapproved/rejected rows remain visible only to their owner (the FOR ALL
-- owner policy from Phase 2 still applies and is OR'd with this one).
create policy concept_links_read_published on public.concept_links
  for select to authenticated
  using (status = 'approved');

-- a source document becomes readable only once it has at least one approved
-- link — i.e. the teacher has published something grounded in it.
create policy source_documents_read_published on public.source_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.concept_links cl
      where cl.owner_id = source_documents.owner_id
        and cl.doc_id = source_documents.doc_id
        and cl.status = 'approved'
    )
  );
