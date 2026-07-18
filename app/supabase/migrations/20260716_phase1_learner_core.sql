-- Phase 1 learner core (docs/03-data-model.md slice subset, decision D-008).
-- All tables are user-scoped with RLS: a learner can only ever touch their
-- own rows. Evidence events are insert-only (GATE-006 audit trail).

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text check (role in ('student','teacher','independent')),
  objective text check (objective in ('understand','exam','catch_up','weak_area','assignment')),
  explanation_order text not null default 'visual_first'
    check (explanation_order in ('visual_first','math_first','text_first')),
  reading_level text not null default 'standard'
    check (reading_level in ('standard','simpler')),
  onboarded boolean not null default false,
  xp integer not null default 0 check (xp >= 0),
  completed_lesson_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.study_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minutes_per_day integer not null default 20 check (minutes_per_day between 5 and 240),
  exam_date date,
  no_study_days date[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.mastery_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_slug text not null,
  state jsonb not null,
  prev_interval_days integer not null default 1 check (prev_interval_days >= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, concept_slug)
);

create table public.evidence_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_slug text not null,
  event jsonb not null,
  dimension_deltas jsonb not null,
  signal_quality real not null,
  guess_likelihood real not null,
  correct boolean not null,
  client_seq integer not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_seq)
);
create index evidence_events_user_time on public.evidence_events (user_id, created_at desc);

-- updated_at maintenance
create function public.touch_updated_at() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger study_plans_touch before update on public.study_plans
  for each row execute function public.touch_updated_at();
create trigger mastery_states_touch before update on public.mastery_states
  for each row execute function public.touch_updated_at();

-- RLS: user-owned rows only (docs/03 §4)
alter table public.profiles enable row level security;
alter table public.study_plans enable row level security;
alter table public.mastery_states enable row level security;
alter table public.evidence_events enable row level security;

create policy profiles_own on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy study_plans_own on public.study_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy mastery_states_own on public.mastery_states
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- evidence is append-only: select + insert, no update/delete (GATE-006)
create policy evidence_select_own on public.evidence_events
  for select using (auth.uid() = user_id);
create policy evidence_insert_own on public.evidence_events
  for insert with check (auth.uid() = user_id);
