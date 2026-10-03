-- Fittest Fleet: comments schema, RLS, and Realtime
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query).

-- Extensions (usually already enabled on Supabase)
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  category text not null
    check (category in ('Weight Loss', 'Exercise', 'Nutritional Discipline', 'General')),
  message text not null,
  likes int not null default 0 check (likes >= 0),
  created_at timestamptz not null default now()
);

create index if not exists comments_created_at_idx on public.comments (created_at desc);
create index if not exists comments_category_idx on public.comments (category);
create index if not exists comments_user_id_idx on public.comments (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.comments enable row level security;

-- Anyone (including anonymous) can read comments
drop policy if exists "Comments are publicly readable" on public.comments;
create policy "Comments are publicly readable"
  on public.comments
  for select
  to anon, authenticated
  using (true);

-- Only signed-in users can insert; user_id must match auth.uid()
drop policy if exists "Authenticated users can insert own comments" on public.comments;
create policy "Authenticated users can insert own comments"
  on public.comments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Authenticated users can update likes (simple encourage/like flow)
drop policy if exists "Authenticated users can update likes" on public.comments;
create policy "Authenticated users can update likes"
  on public.comments
  for update
  to authenticated
  using (true)
  with check (true);

-- Owners can delete their own comments
drop policy if exists "Owners can delete own comments" on public.comments;
create policy "Owners can delete own comments"
  on public.comments
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Add table to the supabase_realtime publication (safe if already present)
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;

-- DEFAULT is enough for Realtime INSERT/UPDATE; FULL can break some triggers
alter table public.comments replica identity default;

-- ---------------------------------------------------------------------------
-- Privileges (required; RLS alone is not enough)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on table public.comments to anon, authenticated;
grant insert, update, delete on table public.comments to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles (see also sql/profiles-and-avatars.sql for Storage bucket policies)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  avatar_url text,
  display_name text,
  updated_at timestamptz not null default now()
);

create index if not exists profiles_updated_at_idx on public.profiles (updated_at desc);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select to anon, authenticated using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile"
  on public.profiles for delete to authenticated
  using (auth.uid() = id);

grant select on table public.profiles to anon, authenticated;
grant insert, update, delete on table public.profiles to authenticated;

create or replace function public.set_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'assets/avatars/runner.svg'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- NOTE: Run sql/profiles-and-avatars.sql for the Storage `avatars` bucket + policies.
