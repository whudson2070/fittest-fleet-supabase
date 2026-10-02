-- Fix: "permission denied for table comments"
-- Run in Supabase SQL Editor.

grant usage on schema public to anon, authenticated;
grant select on table public.comments to anon, authenticated;
grant insert, update, delete on table public.comments to authenticated;

-- Ensure RLS is on and policies exist (safe to re-run)
alter table public.comments enable row level security;

drop policy if exists "Comments are publicly readable" on public.comments;
create policy "Comments are publicly readable"
  on public.comments for select to anon, authenticated using (true);

drop policy if exists "Authenticated users can insert own comments" on public.comments;
create policy "Authenticated users can insert own comments"
  on public.comments for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can update likes" on public.comments;
create policy "Authenticated users can update likes"
  on public.comments for update to authenticated using (true) with check (true);

drop policy if exists "Owners can delete own comments" on public.comments;
create policy "Owners can delete own comments"
  on public.comments for delete to authenticated using (auth.uid() = user_id);
