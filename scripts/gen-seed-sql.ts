/**
 * Gera supabase/seed/seed.sql com dados de demonstração (idempotente).
 * Os cronogramas são calculados pelo mesmo motor da aplicação.
 * Uso: npx tsx scripts/gen-seed-sql.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildSchedule } from "../src/lib/finance/price";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const PWD = "Demo@12345";
const U = {
  admin: "11111111-1111-4111-8111-111111111111",
  agent1: "22222222-2222-4222-8222-222222222222",
  agent2: "33333333-3333-4333-8333-333333333333",
  client1: "44444444-4444-4444-8444-444444444444",
  client2: "55555555-5555-4555-8555-555555555555",
  client3: "66666666-6666-4666-8666-666666666666",
};
const C = { carla: "aaaaaaaa-0000-4000-8000-000000000001", diego: "aaaaaaaa-0000-4000-8000-000000000002", elisa: "aaaaaaaa-0000-4000-8000-000000000003" };
const P = { p1000: "bbbbbbbb-0000-4000-8000-000000001000", p2000: "bbbbbbbb-0000-4000-8000-000000002000", p3000: "bbbbbbbb-0000-4000-8000-000000003000", p5000: "bbbbbbbb-0000-4000-8000-000000005000", p10000: "bbbbbbbb-0000-4000-8000-000000010000" };
const PV = { p1000: "cccccccc-0000-4000-8000-000000001000", p2000: "cccccccc-0000-4000-8000-000000002000", p3000: "cccccccc-0000-4000-8000-000000003000", p5000: "cccccccc-0000-4000-8000-000000005000", p10000: "cccccccc-0000-4000-8000-000000010000" };
const LENDER = "dddddddd-0000-4000-8000-000000000001";
const PROP = { carla: "eeeeeeee-0000-4000-8000-000000000001", elisa: "eeeeeeee-0000-4000-8000-000000000002", diego: "eeeeeeee-0000-4000-8000-000000000003" };

const snap = (principal: number, n: number, name: string, pid: string) => JSON.stringify({ ...buildSchedule({ principalCents: principal, monthlyRate: "0.15", termMonths: n }), product: { id: pid, name, version: 1 } }).replace(/'/g, "''");

const user = (id: string, email: string, name: string) => `
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user)
values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${email}', extensions.crypt('${PWD}', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"${name}"}', now(), now(), '', '', '', '', false)
on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '${id}', '${id}', jsonb_build_object('sub', '${id}', 'email', '${email}', 'email_verified', true), 'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;`;

const products = [["p1000", 100000, "Empréstimo R$ 1.000"], ["p2000", 200000, "Empréstimo R$ 2.000"], ["p3000", 300000, "Empréstimo R$ 3.000"], ["p5000", 500000, "Empréstimo R$ 5.000"], ["p10000", 1000000, "Empréstimo R$ 10.000"]] as const;

const sql = `-- WorldCred — seed de demonstração (sandbox). Senha de todas as contas: ${PWD}
-- Gerado por scripts/gen-seed-sql.ts
set search_path = public, extensions;

-- Credor
insert into public.lenders (id, legal_name, cnpj, trade_name, regulatory_framework, receiving_account)
values ('${LENDER}', 'World Serviços de Crédito LTDA', '35.850.108/0001-58', 'WorldCred', 'A validar antes de operar com dinheiro real (enquadramento, contrato e CET)', '{"provider":"mock","account_ref":"WC-SANDBOX-001"}')
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
${user(U.admin, "admin@worldcred.demo", "Marina Administradora")}
${user(U.agent1, "agente1@worldcred.demo", "Ana Agente")}
${user(U.agent2, "agente2@worldcred.demo", "Bruno Agente")}
${user(U.client1, "cliente1@worldcred.demo", "Carla Cliente")}
${user(U.client2, "cliente2@worldcred.demo", "Diego Cliente")}
${user(U.client3, "cliente3@worldcred.demo", "Elisa Cliente")}

insert into public.profiles (id, role, full_name, email, phone) values
 ('${U.admin}', 'admin', 'Marina Administradora', 'admin@worldcred.demo', '+5511999990100'),
 ('${U.agent1}', 'agent', 'Ana Agente', 'agente1@worldcred.demo', '+5511999990101'),
 ('${U.agent2}', 'agent', 'Bruno Agente', 'agente2@worldcred.demo', '+5511999990102'),
 ('${U.client1}', 'client', 'Carla Cliente', 'cliente1@worldcred.demo', '+5511999990001'),
 ('${U.client2}', 'client', 'Diego Cliente', 'cliente2@worldcred.demo', '+5511999990000'),
 ('${U.client3}', 'client', 'Elisa Cliente', 'cliente3@worldcred.demo', '+5511999990003')
on conflict (id) do nothing;

-- Catálogo (15% a.m., prazos 3/6/10/12, sem tarifa, IOF desligado)
${products.map(([k, cents, name]) => `insert into public.products (id, name, modality, principal_cents, active) values ('${P[k]}', '${name}', 'fixed', ${cents}, true) on conflict (id) do nothing;
insert into public.product_versions (id, product_id, version, monthly_rate, allowed_terms, fee_cents, valid_from, created_by) values ('${PV[k]}', '${P[k]}', 1, 0.15, '{3,6,10,12}', 0, '2026-01-01', '${U.admin}') on conflict (product_id, version) do nothing;`).join("\n")}

-- Clientes (CPFs válidos fictícios). Telefone terminado em 0000 => SMS falha no provedor simulado.
insert into public.customers (id, user_id, full_name, cpf, cpf_hash, phone, email, pix_key, pix_key_type, pix_key_status, pix_key_validation, created_by) values
 ('${C.carla}', '${U.client1}', 'Carla Cliente', '12345678909', '${sha("12345678909")}', '+5511999990001', 'cliente1@worldcred.demo', '12345678909', 'cpf', 'validated', '{"provider":"mock","owner_name":"CARLA C*****","matches":true}', '${U.agent1}'),
 ('${C.diego}', '${U.client2}', 'Diego Cliente', '11144477735', '${sha("11144477735")}', '+5511999990000', 'cliente2@worldcred.demo', null, null, 'none', null, '${U.agent2}'),
 ('${C.elisa}', '${U.client3}', 'Elisa Cliente', '52998224725', '${sha("52998224725")}', '+5511999990003', 'cliente3@worldcred.demo', 'cliente3@worldcred.demo', 'email', 'validated', '{"provider":"mock","owner_name":"ELISA C*****","matches":true}', '${U.agent1}')
on conflict (id) do nothing;
insert into public.agent_customers (agent_id, customer_id) values ('${U.agent1}', '${C.carla}'), ('${U.agent2}', '${C.diego}'), ('${U.agent1}', '${C.elisa}') on conflict do nothing;

-- Propostas
insert into public.proposals (id, customer_id, agent_id, lender_id, product_version_id, principal_cents, term_months, monthly_rate, schedule_snapshot, status, sent_at, expires_at, accepted_at, acceptance_evidence) values
 ('${PROP.carla}', '${C.carla}', '${U.agent1}', '${LENDER}', '${PV.p2000}', 200000, 10, 0.15, '${snap(200000, 10, "Empréstimo R$ 2.000", P.p2000)}', 'accepted', now() - interval '70 days', now() - interval '67 days', now() - interval '69 days', '{"ip":"203.0.113.10","method":"portal_checkbox","text_hash":"seed"}'),
 ('${PROP.elisa}', '${C.elisa}', '${U.agent1}', '${LENDER}', '${PV.p5000}', 500000, 6, 0.15, '${snap(500000, 6, "Empréstimo R$ 5.000", P.p5000)}', 'accepted', now() - interval '1 day', now() + interval '2 days', now() - interval '3 hours', '{"ip":"203.0.113.11","method":"portal_checkbox","text_hash":"seed"}'),
 ('${PROP.diego}', '${C.diego}', '${U.agent2}', '${LENDER}', '${PV.p1000}', 100000, 3, 0.15, '${snap(100000, 3, "Empréstimo R$ 1.000", P.p1000)}', 'sent', now() - interval '2 hours', now() + interval '70 hours', null, null)
on conflict (id) do nothing;

-- Contrato da Carla: aprovado e desembolsado há ~68 dias => parcela 1 paga, parcela 2 vencida, parcela 3 a vencer
do $seed$
declare c public.contracts; d public.disbursements; ch_ref text; r jsonb; i1 public.installments; i2 public.installments;
begin
  if exists (select 1 from public.contracts where proposal_id = '${PROP.carla}') then return; end if;
  c := public.wc_approve_proposal('${PROP.carla}', '${U.admin}', 'Aprovação de demonstração');
  select * into d from public.disbursements where contract_id = c.id;
  update public.disbursements set status = 'authorized', authorized_by = '${U.admin}', authorized_at = now() - interval '68 days', provider = 'mock', attempts = 1, sent_at = now() - interval '68 days' where id = d.id;
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
`;

mkdirSync("supabase/seed", { recursive: true });
writeFileSync("supabase/seed/seed.sql", sql, "utf8");
console.log("supabase/seed/seed.sql gerado (" + sql.length + " bytes)");
