begin;
select plan(2);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'c@test.local');
insert into public.profiles (id, display_name, paynow_type, paynow_id) values ('00000000-0000-0000-0000-0000000000c1', 'Cara', 'mobile', '91112222');
insert into public.collections (id, owner_id, title, payee_name, paynow_type, paynow_id, expires_at) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'Ancient', 'x','mobile','x', now() - interval '91 days'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'Recent',  'x','mobile','x', now() - interval '10 days');
insert into public.payers (collection_id, owner_id, first_name, amount_cents, reference) values
  ('20000000-0000-0000-0000-000000000001', null, 'Old', 500, 'ANCI-OLD');
select public.purge_old_collections();
select is((select count(*)::int from public.collections where id = '20000000-0000-0000-0000-000000000001'), 0,
  'AC-F06-04 collection expired over 90 days is purged');
select is((select count(*)::int from public.collections where id = '20000000-0000-0000-0000-000000000002'), 1,
  'AC-F06-04 recent collection is kept');
select * from finish();
rollback;
