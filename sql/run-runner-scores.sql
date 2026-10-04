-- Fittest Fleet: Run Runner high scores.
-- Run this in the Supabase SQL Editor before using the leaderboard.

create table if not exists public.run_runner_scores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  score integer not null default 0 check (score >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists run_runner_scores_score_idx
  on public.run_runner_scores (score desc);

alter table public.run_runner_scores enable row level security;

drop policy if exists "Run Runner scores are publicly readable" on public.run_runner_scores;
create policy "Run Runner scores are publicly readable"
  on public.run_runner_scores
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can insert own Run Runner score" on public.run_runner_scores;
create policy "Users can insert own Run Runner score"
  on public.run_runner_scores
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own Run Runner score" on public.run_runner_scores;
create policy "Users can update own Run Runner score"
  on public.run_runner_scores
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select on table public.run_runner_scores to anon, authenticated;
grant insert, update on table public.run_runner_scores to authenticated;

create or replace function public.set_run_runner_score_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists run_runner_scores_set_updated_at on public.run_runner_scores;
create trigger run_runner_scores_set_updated_at
  before update on public.run_runner_scores
  for each row execute function public.set_run_runner_score_updated_at();
