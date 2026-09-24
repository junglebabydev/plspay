-- AC-F06-04: delete collections 90 days after close or expiry. Cascades to payers.
create extension if not exists pg_cron;

create or replace function public.purge_old_collections()
returns integer language sql security definer set search_path = public as $$
  with d as (
    delete from public.collections
    where coalesce(closed_at, expires_at) < now() - interval '90 days'
    returning 1
  ) select count(*)::int from d;
$$;
revoke all on function public.purge_old_collections() from public, anon, authenticated;

select cron.schedule('purge-old-collections', '15 19 * * *', 'select public.purge_old_collections()'); -- 03:15 SGT
