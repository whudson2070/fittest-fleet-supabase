-- Per-user weight goal for the Progress page: 'lose' (default) or 'gain' (e.g. building muscle mass).
-- Private to each user (owner-only RLS). Run in the Supabase SQL Editor. Safe to re-run.
create table if not exists public.progress_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  weight_goal text not null default 'lose',
  updated_at timestamptz not null default now()
);
alter table public.progress_settings add column if not exists weight_goal text not null default 'lose';
alter table public.progress_settings add column if not exists updated_at timestamptz not null default now();
alter table public.progress_settings drop constraint if exists progress_settings_weight_goal_check;
alter table public.progress_settings add constraint progress_settings_weight_goal_check
  check (weight_goal in ('lose', 'gain'));

alter table public.progress_settings enable row level security;

drop policy if exists "Users can read own progress settings" on public.progress_settings;
create policy "Users can read own progress settings" on public.progress_settings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can insert own progress settings" on public.progress_settings;
create policy "Users can insert own progress settings" on public.progress_settings
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update own progress settings" on public.progress_settings;
create policy "Users can update own progress settings" on public.progress_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.progress_settings from anon;
grant select, insert, update on public.progress_settings to authenticated;

notify pgrst, 'reload schema';
