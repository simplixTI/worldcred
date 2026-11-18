-- WorldCred — seed de demonstração (sandbox). Senha de todas as contas: Demo@12345
-- Gerado por scripts/gen-seed-sql.ts
set search_path = public, extensions;

-- Credor
insert into public.lenders (id, legal_name, cnpj, trade_name, regulatory_framework, receiving_account)
values ('dddddddd-0000-4000-8000-000000000001', 'World Serviços de Crédito LTDA', '35.850.108/0001-58', 'WorldCred', 'A validar antes de operar com dinheiro real (enquadramento, contrato e CET)', '{"provider":"mock","account_ref":"WC-SANDBOX-001"}')
on conflict (cnpj) do nothing;

-- Configurações
insert into public.settings (key, value) values
 ('security', '{"mfa_enforced": true}'),
 ('collection', '{"stages":[{"code":"D0","offset_days":0},{"code":"D3","offset_days":3},{"code":"D7","offset_days":7}],"case_after_days":10,"window_start":"08:00","window_end":"20:00","review_pause_hours":48,"channel":"sms","whatsapp_authorized":false,"template":"WorldCred: parcela {{n}} de {{total}} vence em {{due}}. Pague com Pix pelo portal: {{link}}"}'),
 ('pix', '{"charge_ttl_hours": 24, "receiver_account": "WC-SANDBOX-001"}'),
 ('proposal', '{"expires_hours": 72}'),
 ('card', '{"enabled": false, "provider": null, "integration_approved": false}')
on conflict (key) do nothing;

-- Usuários de demonstração

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
values ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'admin@worldcred.demo', extensions.crypt('Demo@12345', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Marina Administradora"}', now(), now(), '', '', '', '', false)
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', jsonb_build_object('sub', '11111111-1111-4111-8111-111111111111', 'email', 'admin@worldcred.demo', 'email_verified', true), 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
values ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'agente1@worldcred.demo', extensions.crypt('Demo@12345', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Ana Agente"}', now(), now(), '', '', '', '', false)
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', jsonb_build_object('sub', '22222222-2222-4222-8222-222222222222', 'email', 'agente1@worldcred.demo', 'email_verified', true), 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
values ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'agente2@worldcred.demo', extensions.crypt('Demo@12345', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Bruno Agente"}', now(), now(), '', '', '', '', false)
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', jsonb_build_object('sub', '33333333-3333-4333-8333-333333333333', 'email', 'agente2@worldcred.demo', 'email_verified', true), 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
values ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'cliente1@worldcred.demo', extensions.crypt('Demo@12345', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Carla Cliente"}', now(), now(), '', '', '', '', false)
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '44444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', jsonb_build_object('sub', '44444444-4444-4444-8444-444444444444', 'email', 'cliente1@worldcred.demo', 'email_verified', true), 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
values ('00000000-0000-0000-0000-000000000000', '55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'cliente2@worldcred.demo', extensions.crypt('Demo@12345', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Diego Cliente"}', now(), now(), '', '', '', '', false)
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '55555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', jsonb_build_object('sub', '55555555-5555-4555-8555-555555555555', 'email', 'cliente2@worldcred.demo', 'email_verified', true), 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
values ('00000000-0000-0000-0000-000000000000', '66666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'cliente3@worldcred.demo', extensions.crypt('Demo@12345', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Elisa Cliente"}', now(), now(), '', '', '', '', false)
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '66666666-6666-4666-8666-666666666666', '66666666-6666-4666-8666-666666666666', jsonb_build_object('sub', '66666666-6666-4666-8666-666666666666', 'email', 'cliente3@worldcred.demo', 'email_verified', true), 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

insert into public.profiles (id, role, full_name, email, phone) values
 ('11111111-1111-4111-8111-111111111111', 'admin', 'Marina Administradora', 'admin@worldcred.demo', '+5511999990100'),
 ('22222222-2222-4222-8222-222222222222', 'agent', 'Ana Agente', 'agente1@worldcred.demo', '+5511999990101'),
 ('33333333-3333-4333-8333-333333333333', 'agent', 'Bruno Agente', 'agente2@worldcred.demo', '+5511999990102'),
 ('44444444-4444-4444-8444-444444444444', 'client', 'Carla Cliente', 'cliente1@worldcred.demo', '+5511999990001'),
 ('55555555-5555-4555-8555-555555555555', 'client', 'Diego Cliente', 'cliente2@worldcred.demo', '+5511999990000'),
 ('66666666-6666-4666-8666-666666666666', 'client', 'Elisa Cliente', 'cliente3@worldcred.demo', '+5511999990003')
on conflict (id) do nothing;

-- Catálogo (15% a.m., prazos 3/6/10/12, sem tarifa, IOF desligado)
insert into public.products (id, name, modality, principal_cents, active) values ('bbbbbbbb-0000-4000-8000-000000001000', 'Empréstimo R$ 1.000', 'fixed', 100000, true) on conflict (id) do nothing;
insert into public.product_versions (id, product_id, version, monthly_rate, allowed_terms, fee_cents, valid_from, created_by) values ('cccccccc-0000-4000-8000-000000001000', 'bbbbbbbb-0000-4000-8000-000000001000', 1, 0.15, '{3,6,10,12}', 0, '2026-01-01', '11111111-1111-4111-8111-111111111111') on conflict (product_id, version) do nothing;
insert into public.products (id, name, modality, principal_cents, active) values ('bbbbbbbb-0000-4000-8000-000000002000', 'Empréstimo R$ 2.000', 'fixed', 200000, true) on conflict (id) do nothing;
insert into public.product_versions (id, product_id, version, monthly_rate, allowed_terms, fee_cents, valid_from, created_by) values ('cccccccc-0000-4000-8000-000000002000', 'bbbbbbbb-0000-4000-8000-000000002000', 1, 0.15, '{3,6,10,12}', 0, '2026-01-01', '11111111-1111-4111-8111-111111111111') on conflict (product_id, version) do nothing;
insert into public.products (id, name, modality, principal_cents, active) values ('bbbbbbbb-0000-4000-8000-000000003000', 'Empréstimo R$ 3.000', 'fixed', 300000, true) on conflict (id) do nothing;
insert into public.product_versions (id, product_id, version, monthly_rate, allowed_terms, fee_cents, valid_from, created_by) values ('cccccccc-0000-4000-8000-000000003000', 'bbbbbbbb-0000-4000-8000-000000003000', 1, 0.15, '{3,6,10,12}', 0, '2026-01-01', '11111111-1111-4111-8111-111111111111') on conflict (product_id, version) do nothing;
insert into public.products (id, name, modality, principal_cents, active) values ('bbbbbbbb-0000-4000-8000-000000005000', 'Empréstimo R$ 5.000', 'fixed', 500000, true) on conflict (id) do nothing;
insert into public.product_versions (id, product_id, version, monthly_rate, allowed_terms, fee_cents, valid_from, created_by) values ('cccccccc-0000-4000-8000-000000005000', 'bbbbbbbb-0000-4000-8000-000000005000', 1, 0.15, '{3,6,10,12}', 0, '2026-01-01', '11111111-1111-4111-8111-111111111111') on conflict (product_id, version) do nothing;
insert into public.products (id, name, modality, principal_cents, active) values ('bbbbbbbb-0000-4000-8000-000000010000', 'Empréstimo R$ 10.000', 'fixed', 1000000, true) on conflict (id) do nothing;
insert into public.product_versions (id, product_id, version, monthly_rate, allowed_terms, fee_cents, valid_from, created_by) values ('cccccccc-0000-4000-8000-000000010000', 'bbbbbbbb-0000-4000-8000-000000010000', 1, 0.15, '{3,6,10,12}', 0, '2026-01-01', '11111111-1111-4111-8111-111111111111') on conflict (product_id, version) do nothing;

-- Clientes (CPFs válidos fictícios). Telefone terminado em 0000 => SMS falha no provedor simulado.
insert into public.customers (id, user_id, full_name, cpf, cpf_hash, phone, email, pix_key, pix_key_type, pix_key_status, pix_key_validation, created_by) values
 ('aaaaaaaa-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'Carla Cliente', '12345678909', '7ec94663084bd506d4f0c3e21042df233681fd7426e93f397c921b1d3e397bba', '+5511999990001', 'cliente1@worldcred.demo', '12345678909', 'cpf', 'validated', '{"provider":"mock","owner_name":"CARLA C*****","matches":true}', '22222222-2222-4222-8222-222222222222'),
 ('aaaaaaaa-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555', 'Diego Cliente', '11144477735', '8c2d3a751f9c73934441d16f9578d566e7dd7a2996a042f2ef047b5be926534c', '+5511999990000', 'cliente2@worldcred.demo', null, null, 'none', null, '33333333-3333-4333-8333-333333333333'),
 ('aaaaaaaa-0000-4000-8000-000000000003', '66666666-6666-4666-8666-666666666666', 'Elisa Cliente', '52998224725', '7281dfb5e8becca0a1c5e77c1268baacb0f983572b8c204fd8df72b24175b231', '+5511999990003', 'cliente3@worldcred.demo', 'cliente3@worldcred.demo', 'email', 'validated', '{"provider":"mock","owner_name":"ELISA C*****","matches":true}', '22222222-2222-4222-8222-222222222222')
on conflict (id) do nothing;
insert into public.agent_customers (agent_id, customer_id) values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-000000000001'), ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-0000-4000-8000-000000000002'), ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-000000000003') on conflict do nothing;

-- Propostas
insert into public.proposals (id, customer_id, agent_id, lender_id, product_version_id, principal_cents, term_months, monthly_rate, schedule_snapshot, status, sent_at, expires_at, accepted_at, acceptance_evidence) values
 ('eeeeeeee-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000002000', 200000, 10, 0.15, '{"conditions_version":"price-v1","amortization":"price","rounding":"half_up_cents_last_installment_adjusted","principal_cents":200000,"fee_cents":0,"iof_cents":0,"net_cents":200000,"term_months":10,"monthly_rate":"0.15000000","annual_rate":"4.35025011","regular_installment_cents":39850,"last_installment_cents":39858,"last_installment_adjustment_cents":8,"total_cents":398508,"total_interest_cents":198508,"cet_monthly":"0.14999988","cet_annual":"4.35024331","installments":[{"number":1,"amount_cents":39850,"principal_cents":9850,"interest_cents":30000,"balance_after_cents":190150},{"number":2,"amount_cents":39850,"principal_cents":11327,"interest_cents":28523,"balance_after_cents":178823},{"number":3,"amount_cents":39850,"principal_cents":13027,"interest_cents":26823,"balance_after_cents":165796},{"number":4,"amount_cents":39850,"principal_cents":14981,"interest_cents":24869,"balance_after_cents":150815},{"number":5,"amount_cents":39850,"principal_cents":17228,"interest_cents":22622,"balance_after_cents":133587},{"number":6,"amount_cents":39850,"principal_cents":19812,"interest_cents":20038,"balance_after_cents":113775},{"number":7,"amount_cents":39850,"principal_cents":22784,"interest_cents":17066,"balance_after_cents":90991},{"number":8,"amount_cents":39850,"principal_cents":26201,"interest_cents":13649,"balance_after_cents":64790},{"number":9,"amount_cents":39850,"principal_cents":30131,"interest_cents":9719,"balance_after_cents":34659},{"number":10,"amount_cents":39858,"principal_cents":34659,"interest_cents":5199,"balance_after_cents":0}],"product":{"id":"bbbbbbbb-0000-4000-8000-000000002000","name":"Empréstimo R$ 2.000","version":1}}', 'accepted', now() - interval '70 days', now() - interval '67 days', now() - interval '69 days', '{"ip":"203.0.113.10","method":"portal_checkbox","text_hash":"seed"}'),
 ('eeeeeeee-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000005000', 500000, 6, 0.15, '{"conditions_version":"price-v1","amortization":"price","rounding":"half_up_cents_last_installment_adjusted","principal_cents":500000,"fee_cents":0,"iof_cents":0,"net_cents":500000,"term_months":6,"monthly_rate":"0.15000000","annual_rate":"4.35025011","regular_installment_cents":132118,"last_installment_cents":132121,"last_installment_adjustment_cents":3,"total_cents":792711,"total_interest_cents":292711,"cet_monthly":"0.14999969","cet_annual":"4.35023276","installments":[{"number":1,"amount_cents":132118,"principal_cents":57118,"interest_cents":75000,"balance_after_cents":442882},{"number":2,"amount_cents":132118,"principal_cents":65686,"interest_cents":66432,"balance_after_cents":377196},{"number":3,"amount_cents":132118,"principal_cents":75539,"interest_cents":56579,"balance_after_cents":301657},{"number":4,"amount_cents":132118,"principal_cents":86869,"interest_cents":45249,"balance_after_cents":214788},{"number":5,"amount_cents":132118,"principal_cents":99900,"interest_cents":32218,"balance_after_cents":114888},{"number":6,"amount_cents":132121,"principal_cents":114888,"interest_cents":17233,"balance_after_cents":0}],"product":{"id":"bbbbbbbb-0000-4000-8000-000000005000","name":"Empréstimo R$ 5.000","version":1}}', 'accepted', now() - interval '1 day', now() + interval '2 days', now() - interval '3 hours', '{"ip":"203.0.113.11","method":"portal_checkbox","text_hash":"seed"}'),
 ('eeeeeeee-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002', '33333333-3333-4333-8333-333333333333', 'dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000001000', 100000, 3, 0.15, '{"conditions_version":"price-v1","amortization":"price","rounding":"half_up_cents_last_installment_adjusted","principal_cents":100000,"fee_cents":0,"iof_cents":0,"net_cents":100000,"term_months":3,"monthly_rate":"0.15000000","annual_rate":"4.35025011","regular_installment_cents":43798,"last_installment_cents":43797,"last_installment_adjustment_cents":-1,"total_cents":131393,"total_interest_cents":31393,"cet_monthly":"0.15000022","cet_annual":"4.35026228","installments":[{"number":1,"amount_cents":43798,"principal_cents":28798,"interest_cents":15000,"balance_after_cents":71202},{"number":2,"amount_cents":43798,"principal_cents":33118,"interest_cents":10680,"balance_after_cents":38084},{"number":3,"amount_cents":43797,"principal_cents":38084,"interest_cents":5713,"balance_after_cents":0}],"product":{"id":"bbbbbbbb-0000-4000-8000-000000001000","name":"Empréstimo R$ 1.000","version":1}}', 'sent', now() - interval '2 hours', now() + interval '70 hours', null, null)
on conflict (id) do nothing;

-- Contrato da Carla: aprovado e desembolsado há ~68 dias => parcela 1 paga, parcela 2 vencida, parcela 3 a vencer
do $seed$
declare c public.contracts; d public.disbursements; ch_ref text; r jsonb; i1 public.installments; i2 public.installments;
begin
  if exists (select 1 from public.contracts where proposal_id = 'eeeeeeee-0000-4000-8000-000000000001') then return; end if;
  c := public.wc_approve_proposal('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Aprovação de demonstração');
  select * into d from public.disbursements where contract_id = c.id;
  update public.disbursements set status = 'authorized', authorized_by = '11111111-1111-4111-8111-111111111111', authorized_at = now() - interval '68 days', provider = 'mock', attempts = 1, sent_at = now() - interval '68 days' where id = d.id;
  insert into public.mock_pix_state (kind, reference, status, amount_cents, payload) values ('payout', d.reference, 'confirmed', d.amount_cents, jsonb_build_object('providerTxId', 'E0000SEED' || upper(substr(md5(d.id::text),1,12)), 'confirmedAt', now() - interval '68 days')) on conflict do nothing;
  perform public.wc_confirm_disbursement(d.id, 'E0000SEED' || upper(substr(md5(d.id::text),1,12)), now() - interval '68 days');
  -- parcela 1: cobrança emitida e paga via fluxo de pagamento (idempotente)
  select * into i1 from public.installments where contract_id = c.id and number = 1;
  ch_ref := replace(c.number, '-', '') || 'P01R01';
  insert into public.pix_charges (installment_id, reference, sequence, amount_cents, status, provider, provider_charge_id, receiver_account, qr_payload, expires_at, created_at)
  values (i1.id, ch_ref, 1, i1.amount_cents, 'active', 'mock', 'mockcob_seed01', 'WC-SANDBOX-001', '00020101021226SEED', now() - interval '37 days', now() - interval '38 days') on conflict (reference) do nothing;
  insert into public.mock_pix_state (kind, reference, status, amount_cents, payload) values ('charge', ch_ref, 'paid', i1.amount_cents, jsonb_build_object('providerChargeId','mockcob_seed01','receiverAccount','WC-SANDBOX-001','paidAmountCents', i1.amount_cents, 'endToEndId', 'E0000SEEDPAY01', 'paidAt', now() - interval '38 days')) on conflict do nothing;
  r := public.wc_apply_payment('mock', 'E0000SEEDPAY01', ch_ref, i1.amount_cents, now() - interval '38 days', null, null, 'WC-SANDBOX-001');
  -- parcela 2: vencida, cobrança ativa emitida (régua vai enfileirar lembretes)
  select * into i2 from public.installments where contract_id = c.id and number = 2;
  ch_ref := replace(c.number, '-', '') || 'P02R01';
  insert into public.pix_charges (installment_id, reference, sequence, amount_cents, status, provider, provider_charge_id, receiver_account, qr_payload, expires_at)
  values (i2.id, ch_ref, 1, i2.amount_cents, 'active', 'mock', 'mockcob_seed02', 'WC-SANDBOX-001', '00020101021226SEED02', now() + interval '20 hours') on conflict (reference) do nothing;
  insert into public.mock_pix_state (kind, reference, status, amount_cents, payload) values ('charge', ch_ref, 'active', i2.amount_cents, jsonb_build_object('providerChargeId','mockcob_seed02','receiverAccount','WC-SANDBOX-001','expiresAt', now() + interval '20 hours','qrPayload','00020101021226SEED02')) on conflict do nothing;
end $seed$;

-- Régua: enfileira lembretes/casos conforme a data de hoje
select public.wc_enqueue_reminders();
