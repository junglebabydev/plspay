-- DB security contract tests (pgTAP). Run: supabase test db
begin;
select plan(19);

-- Fixtures (as postgres, bypasses RLS)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.local');
insert into public.profiles (id, display_name, paynow_type, paynow_id) values
  ('00000000-0000-0000-0000-00000000000a', 'Alice', 'mobile', '91234567'),
  ('00000000-0000-0000-0000-00000000000b', 'Bob',   'mobile', '87654321');

insert into public.collections (id, owner_id, title, payee_name, paynow_type, paynow_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Dinner', 'spoof', 'mobile', '80000000');
insert into public.collections (id, owner_id, title, payee_name, paynow_type, paynow_id, status) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Closed', 'x', 'mobile', 'x', 'closed');
insert into public.collections (id, owner_id, title, payee_name, paynow_type, paynow_id, expires_at) values
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'Old', 'x', 'mobile', 'x', now() - interval '1 day');

insert into public.payers (collection_id, owner_id, first_name, amount_cents, reference, token, revoked) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Priya', 2500, 'DINN-PRIYA', 'tok_valid', false),
  ('10000000-0000-0000-0000-000000000001', null, 'Ravi', 2501, 'DINN-RAVI', 'tok_revoked', true),
  ('10000000-0000-0000-0000-000000000002', null, 'Sam',  1000, 'CLOS-SAM', 'tok_closed', false),
  ('10000000-0000-0000-0000-000000000003', null, 'Tan',  1000, 'OLD-TAN', 'tok_expired', false);

-- SEC-01
select is_empty($$ select tablename from pg_tables where schemaname = 'public' and not rowsecurity $$,
  'SEC-01 every public table has RLS');

-- AC-F03-06 snapshot ignores client PayNow values; payer owner comes from collection
select is((select paynow_id from public.collections where id = '10000000-0000-0000-0000-000000000001'), '91234567',
  'AC-F03-06 collection PayNow copied from profile');
select is((select owner_id from public.payers where token = 'tok_valid'), '00000000-0000-0000-0000-00000000000a'::uuid,
  'AC-F03-06 payer owner_id forced from collection');

-- AC-F03-03 unique amount per collection
select throws_ok($$ insert into public.payers (collection_id, owner_id, first_name, amount_cents, reference)
  values ('10000000-0000-0000-0000-000000000001', null, 'Dup', 2500, 'DINN-DUP') $$, '23505', null,
  'AC-F03-03 duplicate amount rejected');

-- AC-F02-04 PayNow frozen on collection
select throws_ok($$ update public.collections set paynow_id = '99999999' where id = '10000000-0000-0000-0000-000000000001' $$,
  'P0001', 'paynow_fields_immutable', 'AC-F02-04 collection PayNow immutable');

-- Service role RPCs: AC-F04-01, AC-F04-04, AC-F06-01, AC-F06-02, AC-F04-07
set local role service_role;
select is((select count(*)::int from public.get_payment('tok_valid')), 1, 'AC-F04-01 valid token returns payment');
select is((select count(*)::int from public.get_payment('tok_revoked')), 0, 'AC-F06-01 revoked token returns nothing');
select is((select count(*)::int from public.get_payment('tok_closed')), 0, 'AC-F06-02 closed collection returns nothing');
select is((select count(*)::int from public.get_payment('tok_expired')), 0, 'AC-F04-04 expired token returns nothing');
select ok(public.claim_payment('tok_valid'), 'AC-F04-07 first claim succeeds');
select ok(not public.claim_payment('tok_valid'), 'AC-F04-07 second claim changes nothing');
reset role;

-- SEC-02 anon has nothing
set local role anon;
select throws_ok('select * from public.collections', '42501', null, 'SEC-02 anon cannot read collections');
-- Checked via the catalog rather than by calling. Supabase Postgres image 17.6.1.106 segfaulted the backend on any
-- "permission denied for function" error (fixed by 17.6.1.167); the catalog check is also stronger, covering both RPCs.
select ok(not has_function_privilege('anon', 'public.get_payment(text)', 'execute'), 'SEC-02 anon cannot call get_payment');
select ok(not has_function_privilege('anon', 'public.claim_payment(text)', 'execute'), 'SEC-02 anon cannot call claim_payment');
select ok(not has_function_privilege('authenticated', 'public.get_payment(text)', 'execute'), 'SEC-02 authenticated cannot call get_payment directly');
reset role;

-- AC-F05-03 / AC-F02-05 organiser B sees nothing of A
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.collections), 0, 'AC-F05-03 other organiser sees no collections');
select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 0,
  'AC-F02-05 other organiser cannot read profile');
reset role;

-- AC-F02-03 PayNow change needs recent OTP
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated","amr":[]}', true);
set local role authenticated;
select throws_ok($$ update public.profiles set paynow_id = '81111111' $$, 'P0001', 'reauth_required',
  'AC-F02-03 SEC-05 PayNow change blocked without recent OTP');
select set_config('request.jwt.claims', json_build_object(
  'sub','00000000-0000-0000-0000-00000000000a','role','authenticated',
  'amr', json_build_array(json_build_object('method','otp','timestamp', extract(epoch from now())::bigint)))::text, true);
select lives_ok($$ update public.profiles set paynow_id = '81111111' $$, 'AC-F02-03 PayNow change allowed after OTP');
reset role;

select * from finish();
rollback;
