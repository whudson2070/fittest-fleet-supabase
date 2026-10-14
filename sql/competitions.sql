-- Fittest Fleet competitions: Weight Loss Challenge (% of body weight lost) + Exercise Challenge (points)
-- + Nutritional Discipline Challenge (points from calories / carbohydrates / added sugars / protein / fiber check-in fields).
-- Idempotent: safe to re-run. Requires progress-checkins.sql, progress-trackers.sql and profiles-and-avatars.sql first.
-- Public leaderboards expose ONLY display name, percent / points and counts. Raw body weights and nutrition values are never returned.

create table if not exists public.competitions (
  id text primary key,
  name text not null,
  type text not null,
  start_date date not null,
  end_date date not null,
  join_deadline date not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date and join_deadline between start_date and end_date)
);

create table if not exists public.competition_entries (
  competition_id text not null references public.competitions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

-- Widen the type check on re-runs (older versions allowed only weight_loss / exercise).
alter table public.competitions drop constraint if exists competitions_type_check;
alter table public.competitions add constraint competitions_type_check
  check (type in ('weight_loss', 'exercise', 'nutrition'));

alter table public.competitions enable row level security;
alter table public.competition_entries enable row level security;

drop policy if exists "competitions readable" on public.competitions;
create policy "competitions readable" on public.competitions for select using (true);

drop policy if exists "entries read own" on public.competition_entries;
create policy "entries read own" on public.competition_entries
  for select using (auth.uid() = user_id);

drop policy if exists "entries leave own" on public.competition_entries;
create policy "entries leave own" on public.competition_entries
  for delete using (auth.uid() = user_id);
-- Joining goes through join_competition() so the deadline is enforced server-side.

grant select on public.competitions to anon, authenticated;
grant select, delete on public.competition_entries to authenticated;

-- Season 1 (6 weeks): Mon Oct 26 2026 - Sun Dec 6 2026, join by Sun Nov 1 2026.
insert into public.competitions (id, name, type, start_date, end_date, join_deadline) values
  ('2026-s1-weight',   'Weight Loss Challenge', 'weight_loss', '2026-10-26', '2026-12-06', '2026-11-01'),
  ('2026-s1-exercise', 'Exercise Challenge',    'exercise',    '2026-10-26', '2026-12-06', '2026-11-01'),
  ('2026-s1-nutrition', 'Nutritional Discipline Challenge', 'nutrition', '2026-10-26', '2026-12-06', '2026-11-01')
on conflict (id) do update set name = excluded.name, type = excluded.type,
  start_date = excluded.start_date, end_date = excluded.end_date, join_deadline = excluded.join_deadline;

-- Join (signed-in only, before the join deadline).
create or replace function public.join_competition(p_competition_id text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.competitions;
begin
  if auth.uid() is null then raise exception 'Sign in to join'; end if;
  select * into c from public.competitions where id = p_competition_id;
  if not found then raise exception 'Competition not found'; end if;
  if (timezone('utc', now()))::date > c.join_deadline then
    raise exception 'Joining closed on %', c.join_deadline;
  end if;
  insert into public.competition_entries (competition_id, user_id)
  values (p_competition_id, auth.uid()) on conflict do nothing;
end $$;

-- Weight Loss leaderboard.
--  start weigh-in  = first weigh-in in week 1 (start_date .. join_deadline)
--  current weigh-in = most recent weigh-in between start_date and end_date
--  pct_lost = greatest(0, (start - current) / start * 100), rounded to 1 decimal (gains show 0.0)
--  eligible = has a start weigh-in AND at least one weigh-in in every competition week completed so far
--  ties: earlier date of current weigh-in ranks higher
create or replace function public.get_weight_loss_leaderboard(p_competition_id text)
returns table (rank bigint, user_id uuid, display_name text, pct_lost numeric,
               weigh_ins integer, eligible boolean, last_weigh_in date)
language sql stable security definer set search_path = public as $$
  with c as (select * from public.competitions where id = p_competition_id and type = 'weight_loss'),
  w as (
    select e.user_id, p.checked_in_on as d, p.weight, p.created_at
    from public.competition_entries e
    join c on c.id = e.competition_id
    join public.progress_checkins p on p.user_id = e.user_id
    where p.weight is not null and p.weight > 0
      and p.checked_in_on between c.start_date and least(c.end_date, (timezone('utc', now()))::date)
  ),
  agg as (
    select w.user_id,
      (select w2.weight from w w2, c where w2.user_id = w.user_id and w2.d <= c.join_deadline
        order by w2.d, w2.created_at limit 1) as start_w,
      (select w3.weight from w w3 where w3.user_id = w.user_id order by w3.d desc, w3.created_at desc limit 1) as cur_w,
      max(w.d) as last_d,
      count(*)::int as n,
      count(distinct ((w.d - (select start_date from c)) / 7))::int as weeks_hit
    from w group by w.user_id
  ),
  weeks_done as (
    select greatest(1, least(((least((timezone('utc', now()))::date, end_date + 1) - start_date) / 7), (end_date - start_date + 1) / 7))::int as k from c
  ),
  scored as (
    select a.user_id, a.n, a.last_d,
      case when a.start_w is null then 0
           else greatest(0, round((a.start_w - a.cur_w) / a.start_w * 100, 1)) end as pct,
      (a.start_w is not null and a.weeks_hit >= (select k from weeks_done)) as ok
    from agg a
  )
  select rank() over (order by s.ok desc, s.pct desc, s.last_d asc) as rank,
         case when s.user_id = auth.uid() then s.user_id end as user_id,
         coalesce(nullif(trim(pr.display_name), ''), 'Member') as display_name,
         s.pct, s.n, s.ok, s.last_d
  from scored s left join public.profiles pr on pr.id = s.user_id
  order by 1, 3;
$$;

-- Exercise leaderboard. Daily points (each line capped), then a 20-point cap per day:
--  miles walked/run: 1 per mile (max 8) | cycling: 1 per 3 miles (max 8) | steps: 1 per 2,000 (max 6)
--  lifting: 1 per set (max 8) | yoga: 1 per 15 min (max 4) | push-ups + squats: 1 per 50 reps (max 4)
--  golf: 1 per 9 holes (max 4)
--  active day = any day with at least 1 point. Ties: more active days ranks higher.
create or replace function public.get_exercise_leaderboard(p_competition_id text)
returns table (rank bigint, user_id uuid, display_name text, points integer, active_days integer)
language sql stable security definer set search_path = public as $$
  with c as (select * from public.competitions where id = p_competition_id and type = 'exercise'),
  ent as (select e.user_id from public.competition_entries e join c on c.id = e.competition_id),
  raw as (
    select p.user_id, p.checked_in_on as d,
      least(8, floor(coalesce(p.miles, 0)))                         as pts_miles,
      least(8, floor(coalesce(p.cycling_miles, 0) / 3))             as pts_cycle,
      0 as pts_steps, 0 as pts_lift,
      least(4, floor(coalesce(p.yoga_minutes, 0) / 15))             as pts_yoga,
      least(4, floor((coalesce(p.pushups, 0) + coalesce(p.squats, 0)) / 50.0)) as pts_body,
      0 as pts_golf
    from public.progress_checkins p join ent using (user_id)
    union all
    select s.user_id, s.walked_on, 0, 0, least(6, floor(s.steps / 2000.0)), 0, 0, 0, 0
    from public.progress_steps s join ent using (user_id)
    union all
    select l.user_id, l.performed_on, 0, 0, 0, l.sets, 0, 0, 0
    from public.progress_lifts l join ent using (user_id)
    union all
    select g.user_id, g.played_on, 0, 0, 0, 0, 0, 0, floor(g.holes / 9.0)
    from public.progress_golf_rounds g join ent using (user_id)
  ),
  daily as (
    select r.user_id, r.d,
      least(20,
        least(8, sum(pts_miles)) + least(8, sum(pts_cycle)) + least(6, sum(pts_steps)) +
        least(8, sum(pts_lift))  + least(4, sum(pts_yoga))  + least(4, sum(pts_body)) +
        least(4, sum(pts_golf)))::int as pts
    from raw r, c
    where r.d between c.start_date and least(c.end_date, (timezone('utc', now()))::date)
    group by r.user_id, r.d
  ),
  tot as (
    select e.user_id, coalesce(sum(d.pts), 0)::int as points,
           count(*) filter (where d.pts > 0)::int as active_days
    from ent e left join daily d on d.user_id = e.user_id group by e.user_id
  )
  select rank() over (order by t.points desc, t.active_days desc) as rank,
         case when t.user_id = auth.uid() then t.user_id end as user_id,
         coalesce(nullif(trim(pr.display_name), ''), 'Member') as display_name,
         t.points, t.active_days
  from tot t left join public.profiles pr on pr.id = t.user_id
  order by 1, 3;
$$;

-- Nutritional Discipline leaderboard. Uses ONLY progress_checkins.calories / carbohydrates / sugars (added sugars) / protein_g / fiber_g.
-- Requires protein_g + fiber_g columns: run sql/progress-trackers.sql first.
-- Multiple check-ins on one day are summed per field. A target scores only if that field was logged that day.
--  log it: 1 per field logged (calories, carbs, added sugars, protein, fiber; max 5)
--  calories 0-1,200: 4 | 1,201-1,600: 3 | 1,601-2,000: 2 | 2,001-3,000: 1 | >3,000: 0
--  carbs g 0-50: 4 | 51-75: 3 | 76-100: 2 | 101-200: 1 | >200: 0
--  added sugars g 0-25: 4 | 26-35: 3 | 36-45: 2 | 46-75: 1 | >75: 0
--  protein / fiber: log points only | 17-point max per day
--  logged day = any day with at least 1 point. Ties: more logged days, then longest streak of consecutive logged days.
create or replace function public.get_nutrition_leaderboard(p_competition_id text)
returns table (rank bigint, user_id uuid, display_name text, points integer, logged_days integer)
language sql stable security definer set search_path = public as $$
  with c as (select * from public.competitions where id = p_competition_id and type = 'nutrition'),
  ent as (select e.user_id from public.competition_entries e join c on c.id = e.competition_id),
  day as (
    select p.user_id, p.checked_in_on as d,
      sum(p.calories) as cal, sum(p.carbohydrates) as carb, sum(p.sugars) as sug,
      sum(p.protein_g) as pro, sum(p.fiber_g) as fib
    from public.progress_checkins p join ent using (user_id), c
    where p.checked_in_on between c.start_date and least(c.end_date, (timezone('utc', now()))::date)
    group by p.user_id, p.checked_in_on
  ),
  daily as (
    select user_id, d, least(17,
      (cal is not null)::int + (carb is not null)::int + (sug is not null)::int
      + (pro is not null)::int + (fib is not null)::int
      + case when cal <= 1200 then 4 when cal <= 1600 then 3 when cal <= 2000 then 2 when cal <= 3000 then 1 else 0 end
      + case when carb <= 50 then 4 when carb <= 75 then 3 when carb <= 100 then 2 when carb <= 200 then 1 else 0 end
      + case when sug <= 25 then 4 when sug <= 35 then 3 when sug <= 45 then 2 when sug <= 75 then 1 else 0 end)::int as pts
    from day
  ),
  runs as (
    select user_id, d - (row_number() over (partition by user_id order by d))::int as grp
    from daily where pts > 0
  ),
  streak as (
    select user_id, max(n)::int as best from (select user_id, grp, count(*) as n from runs group by 1, 2) x group by user_id
  ),
  tot as (
    select e.user_id, coalesce(sum(dl.pts), 0)::int as points,
           count(*) filter (where dl.pts > 0)::int as logged_days
    from ent e left join daily dl on dl.user_id = e.user_id group by e.user_id
  )
  select rank() over (order by t.points desc, t.logged_days desc, coalesce(s.best, 0) desc) as rank,
         case when t.user_id = auth.uid() then t.user_id end as user_id,
         coalesce(nullif(trim(pr.display_name), ''), 'Member') as display_name,
         t.points, t.logged_days
  from tot t left join streak s on s.user_id = t.user_id
  left join public.profiles pr on pr.id = t.user_id
  order by 1, 3;
$$;

-- Entrant counts (public).
create or replace function public.get_competition_entry_counts()
returns table (competition_id text, entrants integer)
language sql stable security definer set search_path = public as $$
  select competition_id, count(*)::int from public.competition_entries group by competition_id;
$$;

grant execute on function public.join_competition(text) to authenticated;
grant execute on function public.get_weight_loss_leaderboard(text) to anon, authenticated;
grant execute on function public.get_exercise_leaderboard(text) to anon, authenticated;
grant execute on function public.get_competition_entry_counts() to anon, authenticated;
grant execute on function public.get_nutrition_leaderboard(text) to anon, authenticated;
