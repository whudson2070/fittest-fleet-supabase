-- Fix: record "old" has no field "lifecycle_configuration"
-- Usually a broken trigger or Realtime replica-identity quirk. Run in SQL Editor.

-- 1) See what fires on comments
select tgname, pg_get_triggerdef(oid) as def
from pg_trigger
where tgrelid = 'public.comments'::regclass
  and not tgisinternal;

-- 2) Realtime works fine with DEFAULT; FULL is optional and can confuse some triggers
alter table public.comments replica identity default;

-- 3) Drop non-internal user triggers that look wrong (uncomment if step 1 shows extras)
-- drop trigger if exists <trigger_name> on public.comments;

-- 4) If you enabled "supabase_realtime" publication only, keep it; no change needed.
