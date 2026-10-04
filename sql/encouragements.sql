-- Per-user encourage clicks.
-- comments.likes is only a running total and cannot say who clicked.
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query).
-- Clicks made before this table exists are not backfilled.

create table if not exists public.encouragements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists encouragements_user_id_idx
  on public.encouragements (user_id);

create index if not exists encouragements_comment_id_idx
  on public.encouragements (comment_id);

alter table public.encouragements enable row level security;

drop policy if exists "Users can read own encouragements" on public.encouragements;
create policy "Users can read own encouragements"
  on public.encouragements
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own encouragements" on public.encouragements;
create policy "Users can insert own encouragements"
  on public.encouragements
  for insert
  to authenticated
  with check (auth.uid() = user_id);

grant select, insert on table public.encouragements to authenticated;
