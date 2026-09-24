-- AC-F06-05: a revoked payer can be given a new link. The token changes only on reissue, never otherwise.

-- Allow a token change only when the row is coming out of revoked state.
create or replace function public.payers_set_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select owner_id into new.owner_id from public.collections where id = new.collection_id;
  if new.owner_id is null then raise exception 'collection_not_found'; end if;
  if tg_op = 'UPDATE' and new.collection_id <> old.collection_id then
    raise exception 'token_immutable';
  end if;
  if tg_op = 'UPDATE' and new.token <> old.token and not (old.revoked and not new.revoked) then
    raise exception 'token_immutable';
  end if;
  return new;
end $$;

-- Runs as the caller (security invoker), so RLS on payers decides whether the row is visible.
create or replace function public.reissue_payer(p_payer_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update public.payers
     set revoked = false,
         token = translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')
   where id = p_payer_id and revoked;
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.reissue_payer(uuid) from public, anon;
grant execute on function public.reissue_payer(uuid) to authenticated;
