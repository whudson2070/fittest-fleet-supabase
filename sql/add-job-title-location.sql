-- Add job title and location to profiles.
-- Run in the Supabase SQL Editor (safe to re-run).
-- Client uses the anon key only. Existing rows stay null and comments omit the extra line.

alter table public.profiles
  add column if not exists job_title text,
  add column if not exists location text;

-- Public read so comment rendering can join these fields.
-- Row policies are not column-specific: own-row insert/update already covers the new columns.
grant usage on schema public to anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant insert, update, delete on table public.profiles to authenticated;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Signup stores job_title and location in auth user metadata.
-- The trigger writes them onto the profile row (needed when email confirmation
-- means there is no session yet for a client update).
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, job_title, location)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'assets/avatars/dumbbell.svg',
    nullif(btrim(coalesce(new.raw_user_meta_data->>'job_title', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'location', '')), '')
  )
  on conflict (id) do update set
    job_title = coalesce(public.profiles.job_title, excluded.job_title),
    location = coalesce(public.profiles.location, excluded.location);
  return new;
end;
$$;

-- Copy values already saved in metadata (signups that happened before this trigger).
update public.profiles p
set
  job_title = coalesce(p.job_title, nullif(btrim(coalesce(u.raw_user_meta_data->>'job_title', '')), '')),
  location = coalesce(p.location, nullif(btrim(coalesce(u.raw_user_meta_data->>'location', '')), ''))
from auth.users u
where p.id = u.id
  and (
    p.job_title is null
    or p.location is null
  );
