-- Fittest Fleet: weight lifting, golf, and step trackers for the Progress page.
-- Run in the Supabase SQL Editor (Dashboard -> SQL -> New query). Safe to re-run.
-- Requires sql/progress-checkins.sql conventions (gen_random_uuid, auth.users).
-- RLS: each user can read and write only their own rows.

create table if not exists public.progress_lifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  performed_on date not null default (timezone('utc', now()))::date,
  exercise text not null check (char_length(exercise) between 1 and 80),
  sets integer not null check (sets between 1 and 100),
  reps integer not null check (reps between 1 and 1000),
  weight numeric not null check (weight >= 0 and weight <= 2000),
  notes text check (notes is null or char_length(notes) <= 280),
  created_at timestamptz not null default now()
);
create index if not exists progress_lifts_user_date_idx
  on public.progress_lifts (user_id, performed_on desc, created_at desc);

create table if not exists public.progress_golf_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  played_on date not null default (timezone('utc', now()))::date,
  holes integer not null check (holes between 1 and 18),
  score integer not null check (score between 1 and 300),
  course text check (course is null or char_length(course) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists progress_golf_rounds_user_date_idx
  on public.progress_golf_rounds (user_id, played_on desc, created_at desc);

create table if not exists public.progress_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  walked_on date not null default (timezone('utc', now()))::date,
  steps integer not null check (steps between 0 and 200000),
  created_at timestamptz not null default now()
);
create index if not exists progress_steps_user_date_idx
  on public.progress_steps (user_id, walked_on desc, created_at desc);

do $$
declare
  t text;
begin
  foreach t in array array['progress_lifts', 'progress_golf_rounds', 'progress_steps'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "Users can read own %s" on public.%I', t, t);
    execute format('create policy "Users can read own %s" on public.%I for select to authenticated using (auth.uid() = user_id)', t, t);

    execute format('drop policy if exists "Users can insert own %s" on public.%I', t, t);
    execute format('create policy "Users can insert own %s" on public.%I for insert to authenticated with check (auth.uid() = user_id)', t, t);

    execute format('drop policy if exists "Users can update own %s" on public.%I', t, t);
    execute format('create policy "Users can update own %s" on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);

    execute format('drop policy if exists "Users can delete own %s" on public.%I', t, t);
    execute format('create policy "Users can delete own %s" on public.%I for delete to authenticated using (auth.uid() = user_id)', t, t);

    execute format('revoke all on table public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end
$$;

grant usage on schema public to authenticated;
