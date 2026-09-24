-- AC-F06-05 and token immutability. Run: supabase test db
begin;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@test.local'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@test.local');
insert into public.profiles (id, display_name, paynow_type, paynow_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'Dee', 'mobile', '91234567'),
  ('00000000-0000-0000-0000-0000000000d2', 'Eve', 'mobile', '87654321');
insert into public.collections (id, owner_id, title, payee_name, paynow_type, paynow_id) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'Trip', 'x', 'mobile', 'x');
insert into public.payers (id, collection_id, owner_id, first_name, amount_cents, reference, token, revoked) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', null, 'Kai', 1000, 'TRIP-KAI', 'tok_kai_old', true),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', null, 'Lin', 1001, 'TRIP-LIN', 'tok_lin', false);

-- Token cannot change on a live row
select throws_ok($$ update public.payers set token = 'tok_new' where id = '50000000-0000-0000-0000-000000000002' $$,
  'P0001', 'token_immutable', 'AC-F06-05 token immutable while not revoked');

-- Another organiser cannot reissue (RLS: row invisible, zero rows updated)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
set local role authenticated;
select ok(not public.reissue_payer('50000000-0000-0000-0000-000000000001'), 'AC-F06-05 non-owner cannot reissue');
reset role;

-- Owner reissues: new token, no longer revoked
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
select ok(public.reissue_payer('50000000-0000-0000-0000-000000000001'), 'AC-F06-05 owner can reissue a revoked payer');
select ok(not public.reissue_payer('50000000-0000-0000-0000-000000000002'), 'AC-F06-05 reissue does nothing for a live payer');
reset role;

select isnt((select token from public.payers where id = '50000000-0000-0000-0000-000000000001'), 'tok_kai_old',
  'AC-F06-05 reissued payer has a new token');
select is((select revoked from public.payers where id = '50000000-0000-0000-0000-000000000001'), false,
  'AC-F06-01 reissued payer is no longer revoked');

select * from finish();
rollback;
