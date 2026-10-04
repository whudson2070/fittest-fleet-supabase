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

-- Count this month's check-ins in the current America/New_York calendar month
-- when at least one activity field is greater than zero. Weight-only and
-- nutrition-only check-ins do not count as workouts.
create or replace function public.get_workouts_completed_this_month()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  with month_bounds as (
    select date_trunc('month', timezone('America/New_York', now()))::date as month_start
  )
  select count(*)::bigint
  from public.progress_checkins as checkin
  cross join month_bounds
  where checkin.checked_in_on >= month_bounds.month_start
    and checkin.checked_in_on < (month_bounds.month_start + interval '1 month')::date
    and (
      coalesce(checkin.pushups, 0) > 0
      or coalesce(checkin.squats, 0) > 0
      or coalesce(checkin.yoga_minutes, 0) > 0
      or coalesce(checkin.miles, 0) > 0
    );
$$;

revoke all on function public.get_total_pounds_lost() from public;
revoke all on function public.get_workouts_completed_this_month() from public;
grant execute on function public.get_total_pounds_lost() to anon, authenticated;
grant execute on function public.get_workouts_completed_this_month() to anon, authenticated;
