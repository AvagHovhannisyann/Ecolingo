-- D-022 platform pivot: real accounts with roles.
--
-- The app's auth model becomes: guests start as anonymous sessions (existing
-- behavior, zero-friction first impression), and creating an account UPGRADES
-- the anonymous user in place (auth.updateUser with email+password), so the
-- user id — and therefore every RLS-owned row (mastery, plans, enrollments,
-- economy) — is preserved. Role is chosen at signup and stored on the
-- existing owner-scoped profiles row.
--
-- Nullable by design: anonymous/guest sessions have no role until they pick
-- one. The check constraint keeps the vocabulary closed.

alter table public.profiles
  add column if not exists role text
    check (role in ('teacher', 'student')),
  add column if not exists display_name text
    check (char_length(display_name) <= 60);

comment on column public.profiles.role is
  'D-022: chosen at signup; null for guests. Teachers author courses; students join them.';
comment on column public.profiles.display_name is
  'D-022: optional name shown in class rosters and (later) leaderboards.';

-- No policy changes needed: profiles_own already restricts read/write to the
-- owner, and role is user-chosen (a teacher role grants no data access by
-- itself — course ownership is what RLS keys on, unchanged).
