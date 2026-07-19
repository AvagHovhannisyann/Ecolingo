-- D-022: bind a teacher-ratified compiled course plan to a real course row.
--
-- The compiler UI (/teach/compile) produces a CourseDraft the teacher
-- ratifies (GATE-001). Storing it on the course row is what makes a join
-- code MEAN something: students who join with this course's code receive
-- THIS plan on their learning path. The jsonb is written only after explicit
-- teacher approval and carries planned_unverified provenance inside it.
--
-- RLS: courses already restricts UPDATE to the owner and SELECT to signed-in
-- users (D-012 published-read posture; enrollment narrows later) — exactly
-- the read/write split the plan needs. No policy changes.

alter table public.courses
  add column if not exists compiled_plan jsonb,
  add column if not exists compiled_at timestamptz;

comment on column public.courses.compiled_plan is
  'D-022: teacher-RATIFIED compiler output (StoredCompiledPlan v1). Null until the teacher approves a plan for this course.';
comment on column public.courses.compiled_at is
  'When the ratified plan was attached.';
