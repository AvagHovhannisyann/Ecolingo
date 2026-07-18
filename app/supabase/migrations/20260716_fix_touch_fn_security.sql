-- Advisor fix: touch_updated_at needs no SECURITY DEFINER (it only writes
-- NEW.updated_at) and should not be directly executable by clients.
create or replace function public.touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
revoke execute on function public.touch_updated_at() from anon, authenticated, public;
