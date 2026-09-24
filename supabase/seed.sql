-- CI/e2e fixtures only. Never runs against staging or prod.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e2', 'e2e@test.local') on conflict do nothing;
insert into public.profiles (id, display_name, paynow_type, paynow_id) values ('00000000-0000-0000-0000-0000000000e2', 'E2E Organiser', 'mobile', '91234567') on conflict do nothing;
insert into public.collections (id, owner_id, title, payee_name, paynow_type, paynow_id) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000e2', 'Dinner', 'x','mobile','x');
insert into public.collections (id, owner_id, title, payee_name, paynow_type, paynow_id, expires_at) values ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e2', 'Old', 'x','mobile','x', now() - interval '1 day');
insert into public.payers (collection_id, owner_id, first_name, amount_cents, reference, token, revoked) values
  ('30000000-0000-0000-0000-000000000001', null, 'Priya', 2500, 'DINN-PRIYA', 'e2e_valid_token_0000000', false),
  ('30000000-0000-0000-0000-000000000001', null, 'Ravi',  2501, 'DINN-RAVI',  'e2e_revoked_token_00000', true),
  ('30000000-0000-0000-0000-000000000002', null, 'Tan',   1000, 'OLD-TAN',    'e2e_expired_token_00000', false);
