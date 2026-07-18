-- Phase 4 courses & enrollments (docs/06 roadmap, decision D-012 seam).
-- The enrollment/roles model: a teacher owns a course with a shareable join
-- code; learners enroll by code and become that teacher's roster. This narrows
-- the D-012 "published grounding" seam from "any signed-in user" toward real
-- course tenancy, and opens the teacher-analytics read path on mastery_states.
--
-- Security posture (this is the critical part):
--   * Join codes must NOT be enumerable — no blanket SELECT on courses. A
--     learner reaches a course only through the security-definer join RPC, or
--     (once enrolled) through the enrolled-read policy on their own row.
--   * Enrollment inserts go through the security-definer join_course() RPC only;
--     no client INSERT policy on enrollments is granted.
--   * Cross-table membership/ownership checks are wrapped in SECURITY DEFINER
--     helpers so the policy subqueries bypass RLS — this is what prevents the
--     mutual recursion between the courses and enrollments policies (a policy on
--     courses that reads enrollments, whose own policy reads courses, …).
--   * The new mastery_states read policy is ADDITIVE: it is OR'd with the
--     existing owner policy (mastery_states_own), so a teacher can read the
--     mastery rows of learners enrolled in a course they own, and nothing else.
--     No other learner table (profiles, study_plans, evidence_events) is opened.

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  -- 6–8 char uppercase alphanumeric; generated client-side from an unambiguous
  -- alphabet (no 0/O/1/I). Unique so a code resolves to exactly one course.
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6,8}$'),
  created_at timestamptz not null default now()
);
create index courses_owner on public.courses (owner_id);

create table public.enrollments (
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (course_id, user_id)
);
create index enrollments_user on public.enrollments (user_id);

alter table public.courses enable row level security;
alter table public.enrollments enable row level security;

-- SECURITY DEFINER helpers live in a PRIVATE schema that is NOT exposed through
-- PostgREST, so they are usable inside RLS policies (they bypass RLS to break
-- the courses<->enrollments policy recursion) without becoming callable
-- /rest/v1/rpc endpoints. Each answers one yes/no question about the CURRENT
-- caller's relationship to a course.
create schema if not exists private;
grant usage on schema private to authenticated;

create function private.is_course_owner(cid uuid) returns boolean
language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.courses c
    where c.id = cid and c.owner_id = auth.uid()
  );
$$;

create function private.is_enrolled(cid uuid) returns boolean
language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.enrollments e
    where e.course_id = cid and e.user_id = auth.uid()
  );
$$;

-- does the caller own a course that `student` is enrolled in? (teacher analytics)
create function private.owns_class_of(student uuid) returns boolean
language sql security definer set search_path = '' stable as $$
  select exists (
    select 1
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.user_id = student and c.owner_id = auth.uid()
  );
$$;

grant execute on function private.is_course_owner(uuid) to authenticated;
grant execute on function private.is_enrolled(uuid) to authenticated;
grant execute on function private.owns_class_of(uuid) to authenticated;

-- courses: owner has full access; an enrolled learner may read only the course
-- row they belong to. No blanket SELECT — codes stay unlistable.
create policy courses_owner on public.courses
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy courses_read_enrolled on public.courses
  for select to authenticated using (private.is_enrolled(id));

-- enrollments: a learner reads their own enrollment rows; a course owner reads
-- the full roster of their own courses. Inserts happen ONLY via join_course().
create policy enrollments_read_own on public.enrollments
  for select to authenticated using (auth.uid() = user_id);
create policy enrollments_read_roster on public.enrollments
  for select to authenticated using (private.is_course_owner(course_id));

-- join flow: look up a course by code and enroll the caller, without ever
-- exposing course enumeration. Returns the course id, or null when the code is
-- unknown. Idempotent (re-joining is a no-op). SECURITY DEFINER so the insert
-- bypasses the (deliberately absent) enrollments INSERT policy.
create function public.join_course(code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    return null;
  end if;
  select id into cid from public.courses where join_code = upper(trim(code));
  if cid is null then
    return null;
  end if;
  insert into public.enrollments (course_id, user_id)
  values (cid, uid)
  on conflict (course_id, user_id) do nothing;
  return cid;
end $$;
revoke execute on function public.join_course(text) from anon, public;
grant execute on function public.join_course(text) to authenticated;

-- teacher analytics: additive READ policy on the EXISTING learner mastery table.
-- OR'd with mastery_states_own, it lets a teacher read the mastery rows of
-- learners enrolled in a course they own — and nothing else. GATE-005 holds for
-- every other learner table (profiles/study_plans/evidence_events stay private).
create policy mastery_states_read_class on public.mastery_states
  for select to authenticated using (private.owns_class_of(user_id));
