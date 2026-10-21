-- Fittest Fleet: lock down comment updates (QA fix, Oct 2026).
-- Run in the Supabase SQL Editor AFTER sql/schema.sql, sql/comment-replies.sql
-- and sql/encouragements.sql. Safe to run more than once.
--
-- Before: any signed-in user could UPDATE any comment (including its text)
-- because the "update likes" policy was using (true) / with check (true).
-- After:  only the author can update their own comment, and Encourage goes
--         through encourage_comment(), a SECURITY DEFINER function that only
--         bumps the likes total and records the click.

-- 1) Replace the wide-open update policy with an owner-only one.
drop policy if exists "Authenticated users can update likes" on public.comments;
drop policy if exists "Owners can update own comments" on public.comments;
create policy "Owners can update own comments"
  on public.comments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2) Even owners may only change their text/category, never likes/user_id.
revoke update on table public.comments from anon, authenticated;
grant update (message, category) on table public.comments to authenticated;

-- Owners can still delete their own posts/replies (replies cascade via parent_id).
drop policy if exists "Owners can delete own comments" on public.comments;
create policy "Owners can delete own comments"
  on public.comments
  for delete
  to authenticated
  using (auth.uid() = user_id);
grant delete on table public.comments to authenticated;

-- 3) Encourage: increment likes + record who clicked (only for other people's posts).
create or replace function public.encourage_comment(p_comment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_likes integer;
begin
  if v_uid is null then
    raise exception 'Sign in to encourage a post.' using errcode = '42501';
  end if;

  update public.comments
     set likes = coalesce(likes, 0) + 1
   where id = p_comment_id
  returning user_id, likes into v_owner, v_likes;

  if not found then
    raise exception 'Post not found.' using errcode = 'P0002';
  end if;

  if v_owner is distinct from v_uid then
    insert into public.encouragements (user_id, comment_id)
    values (v_uid, p_comment_id);
  end if;

  return v_likes;
end;
$$;

revoke all on function public.encourage_comment(uuid) from public, anon;
grant execute on function public.encourage_comment(uuid) to authenticated;

notify pgrst, 'reload schema';
