-- AC-F03-09: personal or business collection. Expand-only: existing rows and older app versions keep working.
alter table public.collections
  add column kind text not null default 'personal' check (kind in ('personal','business'));
