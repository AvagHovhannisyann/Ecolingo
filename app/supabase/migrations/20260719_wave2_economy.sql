-- Wave 2 Stream Y: economy cloud persistence (decision D-020, game-shell
-- rebuild — "top stat strip (streak/gems/hearts)"). Streak/gems/hearts/XP
-- were local-first only (a parallel Wave 2 stream owns the localStorage
-- economy slice). This migration adds the durable half, mirroring the Phase 1
-- learner-core posture (D-008): owner-scoped RLS, no cross-user visibility.
--
-- One row per user, not one table per currency: the whole economy is
-- read/written together on every sync round-trip (app/src/lib/economy-sync.ts
-- merges local vs remote before every push), so every field here is already
-- 1:1 scoped to user_id — splitting it across tables would only add joins
-- with no isolation benefit. Same reasoning as profiles/study_plans (Phase 1).

create table public.learner_economy (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hearts integer not null default 5 check (hearts >= 0),
  -- the timestamp the current `hearts` count is anchored to; heart *regen*
  -- (a heart every N minutes, capped at the max) is a pure function of
  -- (hearts, heart_regen_anchor, now()) computed client-side, so no
  -- cron/edge function is needed server-side to "fill" hearts over time.
  heart_regen_anchor timestamptz not null default now(),
  gems integer not null default 0 check (gems >= 0),
  streak_count integer not null default 0 check (streak_count >= 0),
  -- null until the learner's first study day; a local calendar date
  -- (YYYY-MM-DD), not a timestamp, so streak logic stays unambiguous across a
  -- single day regardless of time-zone drift between devices (mirrors the
  -- day-bucketing in stats.ts's computeStreak).
  last_active_day date,
  xp integer not null default 0 check (xp >= 0),
  -- claim ledger for repeatable quest rewards:
  -- [{ "quest": "<quest id>", "period": "<period key, e.g. 2026-W29>", "claimedAt": "<ISO8601>" }, ...]
  -- economy-sync.ts unions this by (quest,period) on merge so a reward is
  -- never granted twice for the same period just because two devices raced.
  quest_claims jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- updated_at maintenance: reuses the shared trigger fn from Phase 1 (already
-- `security invoker` + revoked from anon/authenticated/public — see
-- 20260716_fix_touch_fn_security.sql). No new function needed.
create trigger learner_economy_touch before update on public.learner_economy
  for each row execute function public.touch_updated_at();

alter table public.learner_economy enable row level security;

-- owner-only, no delete. Mirrors evidence_events' select+insert split (Phase
-- 1) plus an explicit update policy, since (unlike append-only evidence)
-- economy rows ARE mutated in place on every push. There is deliberately no
-- delete policy anywhere in this file: a client never removes an economy
-- row; the only way one disappears is the auth.users cascade above.
create policy learner_economy_select_own on public.learner_economy
  for select using (auth.uid() = user_id);
create policy learner_economy_insert_own on public.learner_economy
  for insert with check (auth.uid() = user_id);
create policy learner_economy_update_own on public.learner_economy
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
