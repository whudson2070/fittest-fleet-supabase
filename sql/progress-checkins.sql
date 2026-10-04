-- Fittest Fleet: personal progress check-ins.
-- Will must run this in the Supabase SQL Editor (Dashboard → SQL → New query)
-- before https://fittestfleet.com/progress/ can save. Until then, the page
-- can sign in but inserts fail.
--
-- One row per save. Each row is dated and owned by the signed-in user.
-- RLS allows a user to read and write only their own rows.

create table if not exists public.progress_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  checked_in_on date not null default (timezone('utc', now()))::date,
  weight numeric,
  pushups integer,
  squats integer,
  yoga_minutes numeric,
  miles numeric,
  calories numeric,
  carbohydrates numeric,
  sugars numeric,
  created_at timestamptz not null default now(),
  constraint progress_checkins_nonnegative check (
    (weight is null or weight >= 0)
    and (pushups is null or pushups >= 0)
    and (squats is null or squats >= 0)
    and (yoga_minutes is null or yoga_minutes >= 0)
    and (miles is null or miles >= 0)
    and (calories is null or calories >= 0)
    and (carbohydrates is null or carbohydrates >= 0)
    and (sugars is null or sugars >= 0)
  )
);

create index if not exists progress_checkins_user_date_idx
  on public.progress_checkins (user_id, checked_in_on desc, created_at desc);

alter table public.progress_checkins enable row level security;

drop policy if exists "Users can read own progress check-ins" on public.progress_checkins;
create policy "Users can read own progress check-ins"
  on public.progress_checkins
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own progress check-ins" on public.progress_checkins;
create policy "Users can insert own progress check-ins"
  on public.progress_checkins
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own progress check-ins" on public.progress_checkins;
create policy "Users can update own progress check-ins"
  on public.progress_checkins
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own progress check-ins" on public.progress_checkins;
create policy "Users can delete own progress check-ins"
  on public.progress_checkins
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant usage on schema public to authenticated;
revoke all on table public.progress_checkins from anon, public;
grant select, insert, update, delete on table public.progress_checkins to authenticated;
