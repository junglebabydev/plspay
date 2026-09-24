-- AC-F03-09 collection kind. Run: supabase test db
begin;
select plan(4);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1', 'f1@test.local');
insert into public.profiles (id, display_name, paynow_type, paynow_id) values ('00000000-0000-0000-0000-0000000000f1', 'Fay', 'mobile', '91234567');

insert into public.collections (id, owner_id, title, payee_name, paynow_type, paynow_id) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'Default', 'x', 'mobile', 'x');
select is((select kind from public.collections where id = '60000000-0000-0000-0000-000000000001'), 'personal',
  'AC-F03-09 kind defaults to personal');

insert into public.collections (id, owner_id, title, kind, payee_name, paynow_type, paynow_id) values
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', 'Shop', 'business', 'x', 'mobile', 'x');
select is((select kind from public.collections where id = '60000000-0000-0000-0000-000000000002'), 'business',
  'AC-F03-09 business kind is stored');

select throws_ok($$ insert into public.collections (owner_id, title, kind, payee_name, paynow_type, paynow_id)
  values ('00000000-0000-0000-0000-0000000000f1', 'Bad', 'charity', 'x', 'mobile', 'x') $$, '23514', null,
  'AC-F03-09 only personal or business allowed');

-- Owner can still read it under RLS with the new column present
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.collections where kind = 'business'), 1, 'AC-F05-06 owner sees kind on their collections');
reset role;

select * from finish();
rollback;
