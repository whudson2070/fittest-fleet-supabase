-- Live member count for the public hero.
-- Counts unique registered accounts (auth.users). Returns only a bigint.
-- Run in the Supabase SQL Editor (Dashboard → SQL → New query). Safe to re-run.
-- The site calls this with the anon key via supabase.rpc('get_member_count').
-- Do not expose service_role to the frontend.

create or replace function public.get_member_count()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::bigint from auth.users;
$$;

revoke all on function public.get_member_count() from public;
grant execute on function public.get_member_count() to anon, authenticated;
