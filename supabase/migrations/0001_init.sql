-- PlsPay v2 schema. Security contract: docs/SPEC.md section 3.
create extension if not exists pgcrypto with schema extensions;

-- Profiles ---------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 40),
  paynow_type   text not null check (paynow_type in ('mobile','uen')),
  paynow_id     text not null,
  whatsapp      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint paynow_id_format check (
    (paynow_type = 'mobile' and paynow_id ~ '^[89][0-9]{7}$') or
    (paynow_type = 'uen'    and paynow_id ~ '^[0-9A-Z]{9,10}$')
  )
);

-- Collections ------------------------------------------------------------
create table public.collections (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 40),
  payee_name   text not null,
  paynow_type  text not null,
  paynow_id    text not null,
  status       text not null default 'open' check (status in ('open','closed')),
  expires_at   timestamptz not null default now() + interval '30 days',
  created_at   timestamptz not null default now(),
  closed_at    timestamptz
);
create index on public.collections (owner_id);

-- Copy PayNow details from the owner's profile. Client values are ignored. (AC-F03-06)
create or replace function public.collections_snapshot_paynow()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = new.owner_id;
  if p.id is null then raise exception 'profile_required'; end if;
  new.payee_name  := p.display_name;
  new.paynow_type := p.paynow_type;
  new.paynow_id   := p.paynow_id;
  return new;
end $$;
create trigger collections_snapshot before insert on public.collections
  for each row execute function public.collections_snapshot_paynow();

-- PayNow fields are frozen after insert. (AC-F02-04)
create or replace function public.collections_freeze_paynow()
returns trigger language plpgsql as $$
begin
  if new.paynow_type is distinct from old.paynow_type
     or new.paynow_id is distinct from old.paynow_id
     or new.payee_name is distinct from old.payee_name
     or new.owner_id is distinct from old.owner_id then
    raise exception 'paynow_fields_immutable';
  end if;
  if new.status = 'closed' and old.status = 'open' then new.closed_at := now(); end if;
  return new;
end $$;
create trigger collections_freeze before update on public.collections
  for each row execute function public.collections_freeze_paynow();

-- Payers -----------------------------------------------------------------
create table public.payers (
  id             uuid primary key default gen_random_uuid(),
  collection_id  uuid not null references public.collections(id) on delete cascade,
  owner_id       uuid not null,
  first_name     text not null check (char_length(first_name) between 1 and 30),
  whatsapp       text,
  amount_cents   integer not null check (amount_cents > 0),
  reference      text not null check (char_length(reference) <= 25),
  token          text not null unique default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'),
  status         text not null default 'waiting' check (status in ('waiting','claimed','paid')),
  revoked        boolean not null default false,
  claimed_at     timestamptz,
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  unique (collection_id, amount_cents),   -- AC-F03-03
  unique (collection_id, reference)        -- AC-F03-05
);
create index on public.payers (collection_id);
create index on public.payers (owner_id);

-- owner_id always comes from the collection, never the client.
create or replace function public.payers_set_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select owner_id into new.owner_id from public.collections where id = new.collection_id;
  if new.owner_id is null then raise exception 'collection_not_found'; end if;
  if tg_op = 'UPDATE' and (new.token <> old.token or new.collection_id <> old.collection_id) then
    raise exception 'token_immutable';
  end if;
  return new;
end $$;
create trigger payers_owner before insert or update on public.payers
  for each row execute function public.payers_set_owner();

-- RLS ---------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.collections enable row level security;
alter table public.payers      enable row level security;

create policy profiles_own on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy collections_own on public.collections for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy payers_own on public.payers for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

revoke all on public.profiles, public.collections, public.payers from anon;

-- Payer RPCs: service role only, called by Next.js after rate limiting ------
create or replace function public.get_payment(p_token text)
returns table (
  title text, payee_name text, paynow_type text, paynow_id text,
  amount_cents integer, reference text, status text, expires_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.title, c.payee_name, c.paynow_type, c.paynow_id,
         p.amount_cents, p.reference, p.status, c.expires_at
  from public.payers p
  join public.collections c on c.id = p.collection_id
  where p.token = p_token
    and not p.revoked
    and c.status = 'open'
    and c.expires_at > now();
$$;

create or replace function public.claim_payment(p_token text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.payers p set status = 'claimed', claimed_at = now()
  from public.collections c
  where c.id = p.collection_id and p.token = p_token and p.status = 'waiting'
    and not p.revoked and c.status = 'open' and c.expires_at > now();
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.get_payment(text), public.claim_payment(text) from public, anon, authenticated;
grant execute on function public.get_payment(text), public.claim_payment(text) to service_role;

-- Board updates use server polling (AC-F05-04). No realtime: the browser never connects to the database.

-- SEC-05 / AC-F02-03: changing PayNow details needs an OTP verified in the last 5 minutes.
-- Reads the "amr" claim Supabase puts in the JWT. Verify claim shape against your Supabase version.
create or replace function public.profiles_guard_paynow()
returns trigger language plpgsql as $$
begin
  if (new.paynow_id is distinct from old.paynow_id or new.paynow_type is distinct from old.paynow_type)
     and current_user = 'authenticated'
     and not exists (
       select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
       where e ->> 'method' = 'otp'
         and (e ->> 'timestamp')::bigint > extract(epoch from now())::bigint - 300
     ) then
    raise exception 'reauth_required';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard_paynow();
