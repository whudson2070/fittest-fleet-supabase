-- Aggregate-only stats for the public homepage trust bar.
-- Run in the Supabase SQL Editor (Dashboard -> SQL -> New query).
-- These SECURITY DEFINER functions bypass the progress table's own-row RLS
-- without exposing any individual progress_checkins rows to anon.
-- Safe to re-run.

-- For each user, compare their earliest and latest non-null weight check-ins.
-- Only positive losses count; weight gained or unchanged contributes zero.
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
  join last_weights using (user_id);
$$;

-- The former monthly-workouts RPC is no longer part of the public stats surface.
drop function if exists public.get_workouts_completed_this_month();

-- Count Progress check-ins with at least one logged workout activity.
-- A check-in counts once, even when it includes multiple activity types.
create or replace function public.get_workout_activity_count()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::bigint
  from public.progress_checkins as checkin
  where coalesce(checkin.pushups, 0) > 0
     or coalesce(checkin.squats, 0) > 0
     or coalesce(checkin.yoga_minutes, 0) > 0
     or coalesce(checkin.miles, 0) > 0;
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

-- Sum miles across all Progress check-ins owned by registered users.
create or replace function public.get_total_miles()
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(checkin.miles), 0::numeric)
  from public.progress_checkins as checkin;
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
