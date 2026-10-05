-- Fittest Fleet: one-level replies for community comments
-- Run this in the Supabase SQL Editor after sql/schema.sql.

alter table public.comments
  add column if not exists parent_id uuid references public.comments (id) on delete cascade;

create index if not exists comments_parent_id_idx
  on public.comments (parent_id);
