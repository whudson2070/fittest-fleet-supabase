-- Aggregate-only stats for the public homepage trust bar.
-- Run in the Supabase SQL Editor (Dashboard -> SQL -> New query).
-- These SECURITY DEFINER functions bypass the progress table's own-row RLS
-- without exposing any individual progress_checkins rows to anon.
-- Safe to re-run.

-- Weight goals live in progress_settings (full setup + RLS in sql/weight-goal.sql). Created here too, with the
-- same shape, so this file runs even if weight-goal.sql hasn't been run yet. Safe to re-run.
create table if not exists public.progress_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  weight_goal text not null default 'lose',
  updated_at timestamptz not null default now()
);
alter table public.progress_settings enable row level security;

-- For each user, compare their earliest and latest non-null weight check-ins.
-- Only positive losses count; weight gained or unchanged contributes zero.
-- Users whose weight goal is 'gain' are excluded entirely (no goal row = 'lose').
create or replace function public.get_total_pounds_lost()
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  with first_weights as (
    select distinct on (user_id)
      user_id,
      weight
    from public.progress_checkins
    where weight is not null
    order by user_id, checked_in_on asc, created_at asc, id asc
  ),
  last_weights as (
    select distinct on (user_id)
      user_id,
      weight
    from public.progress_checkins
    where weight is not null
    order by user_id, checked_in_on desc, created_at desc, id desc
  )
  select coalesce(
    sum(greatest(first_weights.weight - last_weights.weight, 0::numeric)),
    0::numeric
  )
  from first_weights
  join last_weights using (user_id)
  where not exists (
    select 1 from public.progress_settings s
    where s.user_id = first_weights.user_id and s.weight_goal = 'gain'
  );
$$;

-- The former monthly-workouts RPC is no longer part of the public stats surface.
drop function if exists public.get_workouts_completed_this_month();

-- Count logged workout activities from the Progress page:
--  * each check-in with at least one workout (push-ups, squats, yoga, miles walked/run, miles cycled) counts once
--  * each weight-lifting entry (progress_lifts) counts once
--  * each golf round (progress_golf_rounds) counts once
-- Steps are not counted here (they're a daily total, often saved with the same check-in); they feed Miles instead.
-- Requires sql/progress-trackers.sql (tables + cycling_miles column).
create or replace function public.get_workout_activity_count()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(*)
       from public.progress_checkins as checkin
      where coalesce(checkin.pushups, 0) > 0
         or coalesce(checkin.squats, 0) > 0
         or coalesce(checkin.yoga_minutes, 0) > 0
         or coalesce(checkin.miles, 0) > 0
         or coalesce(checkin.cycling_miles, 0) > 0)
    + (select count(*) from public.progress_lifts)
    + (select count(*) from public.progress_golf_rounds);
$$;

-- Sum push-ups across all Progress check-ins owned by registered users.
create or replace function public.get_total_pushups()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(checkin.pushups), 0)::bigint
  from public.progress_checkins as checkin;
$$;

-- Total miles traversed, aggregate only:
--  walking/running per user per day = greatest(miles walked/run, steps / 2500), so a walk is never counted twice
--  (same rule as the Exercise Challenge), plus all miles cycled.
create or replace function public.get_total_miles()
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  with walk as (
    select user_id, d, greatest(sum(m), sum(s) / 2500.0) as mi
    from (
      select user_id, checked_in_on as d, coalesce(miles, 0)::numeric as m, 0::numeric as s from public.progress_checkins
      union all
      select user_id, walked_on, 0, coalesce(steps, 0)::numeric from public.progress_steps
    ) x
    group by user_id, d
  )
  select coalesce((select sum(mi) from walk), 0::numeric)
       + coalesce((select sum(cycling_miles) from public.progress_checkins), 0::numeric);
$$;

-- Sum yoga minutes and present the registered-user total as hours.
create or replace function public.get_total_yoga_hours()
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(checkin.yoga_minutes), 0::numeric) / 60
  from public.progress_checkins as checkin;
$$;

-- Sum squats across all Progress check-ins owned by registered users.
create or replace function public.get_total_squats()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(checkin.squats), 0)::bigint
  from public.progress_checkins as checkin;
$$;

revoke all on function public.get_workout_activity_count() from public;
revoke all on function public.get_total_pounds_lost() from public;
revoke all on function public.get_total_pushups() from public;
revoke all on function public.get_total_miles() from public;
revoke all on function public.get_total_yoga_hours() from public;
revoke all on function public.get_total_squats() from public;
grant execute on function public.get_workout_activity_count() to anon, authenticated;
grant execute on function public.get_total_pounds_lost() to anon, authenticated;
grant execute on function public.get_total_pushups() to anon, authenticated;
grant execute on function public.get_total_miles() to anon, authenticated;
grant execute on function public.get_total_yoga_hours() to anon, authenticated;
grant execute on function public.get_total_squats() to anon, authenticated;
