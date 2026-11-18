-- WorldCred — esquema base
-- Valores monetários em centavos inteiros (bigint). Taxas em numeric(12,8).
-- Datas de vencimento como date no fuso America/Sao_Paulo.

create extension if not exists pgcrypto;

-- ---------- Tipos ----------
create type public.user_role as enum ('admin','agent','client');
create type public.proposal_status as enum ('draft','sent','accepted','rejected','expired','approved','declined','contracted','cancelled');
create type public.contract_status as enum ('pending_disbursement','disbursing','active','settled','cancelled');
create type public.installment_status as enum ('open','partial','paid','cancelled');
create type public.disbursement_status as enum ('pending','authorized','sent','confirmed','failed','timeout');
create type public.charge_status as enum ('active','paid','expired','cancelled','superseded');
create type public.payment_status as enum ('applied','reconciliation','reversed','rejected');
create type public.payment_kind as enum ('full','partial','overpaid','duplicate','unlinked','refund','manual','late');
create type public.message_status as enum ('queued','sending','sent','delivered','failed','cancelled','skipped');
create type public.message_channel as enum ('sms','whatsapp');
create type public.case_status as enum ('open','assigned','paused','resolved');
create type public.case_reason as enum ('overdue','payment_review','message_failed','dispute','reconciliation','disbursement_timeout','manual');
create type public.pix_key_status as enum ('none','pending','validated','rejected');
create type public.claim_status as enum ('open','confirmed','rejected');
create type public.product_modality as enum ('fixed','card');
create type public.card_op_status as enum ('draft','authorized','settled','disbursed','disputed','cancelled');

-- ---------- Utilidades ----------
create or replace function public.sp_today() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function public.mask_cpf(cpf text) returns text
language sql immutable as $$
  select case when cpf is null or length(cpf) < 11 then '***'
    else '***.' || substr(cpf, 4, 3) || '.' || substr(cpf, 7, 3) || '-**' end
$$;

create or replace function public.mask_pix_key(k text) returns text
language sql immutable as $$
  select case when k is null then null
    when length(k) <= 6 then '***'
    else left(k, 3) || repeat('*', greatest(length(k) - 6, 3)) || right(k, 3) end
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

-- ---------- Perfis ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  email text,
  phone text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_upd before update on public.profiles for each row execute function public.set_updated_at();

-- ---------- Credor ----------
create table public.lenders (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  cnpj text not null unique,
  trade_name text,
  regulatory_framework text,
  receiving_account jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Configurações ----------
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- ---------- Clientes ----------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  cpf text not null,
  cpf_hash text not null unique,
  phone text,
  email text,
  pix_key text,
  pix_key_type text,
  pix_key_status public.pix_key_status not null default 'none',
  pix_key_validation jsonb,
  invite_token_hash text,
  invite_expires_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_customers_upd before update on public.customers for each row execute function public.set_updated_at();
create index customers_user_idx on public.customers (user_id);

create table public.agent_customers (
  agent_id uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, customer_id)
);
create index agent_customers_customer_idx on public.agent_customers (customer_id);

-- ---------- Catálogo versionado ----------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  modality public.product_modality not null default 'fixed',
  principal_cents bigint not null check (principal_cents > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_products_upd before update on public.products for each row execute function public.set_updated_at();

create table public.product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  version int not null,
  monthly_rate numeric(12,8) not null check (monthly_rate >= 0),
  allowed_terms int[] not null,
  amortization text not null default 'price',
  fee_cents bigint not null default 0,
  iof_enabled boolean not null default false,
  iof_daily_rate numeric(12,8) not null default 0,
  iof_fixed_rate numeric(12,8) not null default 0,
  valid_from date not null default public.sp_today(),
  valid_to date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (product_id, version)
);
create index product_versions_product_idx on public.product_versions (product_id, valid_from desc);

-- ---------- Propostas ----------
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  customer_id uuid not null references public.customers(id),
  agent_id uuid not null references public.profiles(id),
  lender_id uuid not null references public.lenders(id),
  product_version_id uuid not null references public.product_versions(id),
  principal_cents bigint not null,
  term_months int not null,
  monthly_rate numeric(12,8) not null,
  schedule_snapshot jsonb not null,
  status public.proposal_status not null default 'draft',
  sent_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  acceptance_evidence jsonb,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_proposals_upd before update on public.proposals for each row execute function public.set_updated_at();
create index proposals_customer_idx on public.proposals (customer_id);
create index proposals_agent_idx on public.proposals (agent_id, status);

-- ---------- Contratos ----------
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  proposal_id uuid not null unique references public.proposals(id),
  customer_id uuid not null references public.customers(id),
  agent_id uuid not null references public.profiles(id),
  lender_id uuid not null references public.lenders(id),
  product_version_id uuid not null references public.product_versions(id),
  status public.contract_status not null default 'pending_disbursement',
  conditions jsonb not null,
  principal_cents bigint not null,
  net_cents bigint not null,
  total_cents bigint not null,
  term_months int not null,
  monthly_rate numeric(12,8) not null,
  annual_rate numeric(12,8) not null,
  cet_monthly numeric(12,8) not null,
  cet_annual numeric(12,8) not null,
  accepted_at timestamptz not null,
  activated_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_contracts_upd before update on public.contracts for each row execute function public.set_updated_at();
create index contracts_customer_idx on public.contracts (customer_id);
create index contracts_agent_idx on public.contracts (agent_id, status);

-- ---------- Parcelas ----------
create table public.installments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  number int not null,
  due_date date not null,
  amount_cents bigint not null,
  principal_cents bigint not null,
  interest_cents bigint not null,
  paid_cents bigint not null default 0,
  status public.installment_status not null default 'open',
  in_review boolean not null default false,
  review_hold_until timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, number)
);
create trigger trg_installments_upd before update on public.installments for each row execute function public.set_updated_at();
create index installments_open_due_idx on public.installments (due_date) where status in ('open','partial');

-- ---------- Desembolsos ----------
create table public.disbursements (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id),
  reference text not null unique,
  amount_cents bigint not null,
  pix_key text not null,
  pix_key_type text,
  status public.disbursement_status not null default 'pending',
  provider text,
  provider_tx_id text,
  attempts int not null default 0,
  last_error text,
  requested_by uuid references public.profiles(id),
  authorized_by uuid references public.profiles(id),
  authorized_at timestamptz,
  sent_at timestamptz,
  confirmed_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_disbursements_upd before update on public.disbursements for each row execute function public.set_updated_at();
create index disbursements_contract_idx on public.disbursements (contract_id);
create unique index disbursements_one_live_per_contract on public.disbursements (contract_id)
  where status in ('pending','authorized','sent','confirmed','timeout');

-- ---------- Cobranças Pix ----------
create table public.pix_charges (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.installments(id) on delete cascade,
  reference text not null unique,          -- txid
  sequence int not null default 1,
  amount_cents bigint not null,
  status public.charge_status not null default 'active',
  provider text not null,
  provider_charge_id text,
  receiver_account text,                    -- identificador da conta recebedora (não sensível)
  qr_payload text,                          -- copia e cola
  expires_at timestamptz not null,
  superseded_by uuid references public.pix_charges(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_pix_charges_upd before update on public.pix_charges for each row execute function public.set_updated_at();
create index pix_charges_installment_idx on public.pix_charges (installment_id, created_at desc);
create unique index pix_charges_one_active_per_installment on public.pix_charges (installment_id) where status = 'active';

-- ---------- Eventos do provedor ----------
create table public.provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  kind text not null,
  reference text,
  payload jsonb not null,
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result jsonb,
  unique (provider, external_id)
);

-- ---------- Pagamentos ----------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid references public.installments(id),
  charge_id uuid references public.pix_charges(id),
  provider_event_id uuid references public.provider_events(id),
  provider text not null,
  external_payment_id text not null,        -- endToEndId
  reference text,
  amount_cents bigint not null,
  applied_cents bigint not null default 0,
  kind public.payment_kind not null,
  status public.payment_status not null,
  paid_at timestamptz not null,
  payer jsonb,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (provider, external_payment_id)
);
create index payments_installment_idx on public.payments (installment_id);

create table public.reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  installment_id uuid references public.installments(id),
  reason text not null,
  status text not null default 'open',      -- open | resolved
  resolution text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

-- ---------- "Já paguei" ----------
create table public.payment_claims (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.installments(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  note text,
  status public.claim_status not null default 'open',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Fila de mensagens ----------
create table public.message_queue (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.installments(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  stage text not null,                      -- D0, D3, D7...
  channel public.message_channel not null default 'sms',
  recipient text not null,
  body text not null,
  link_token_hash text,
  status public.message_status not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 3,
  scheduled_for timestamptz not null,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  provider text,
  provider_message_id text,
  last_error text,
  skip_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installment_id, stage, channel)
);
create trigger trg_message_queue_upd before update on public.message_queue for each row execute function public.set_updated_at();
create index message_queue_due_idx on public.message_queue (scheduled_for) where status in ('queued','failed');

-- links autenticados enviados por SMS
create table public.portal_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  customer_id uuid not null references public.customers(id) on delete cascade,
  installment_id uuid references public.installments(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Casos de cobrança ----------
create table public.collection_cases (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid references public.installments(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  reason public.case_reason not null,
  status public.case_status not null default 'open',
  assigned_to uuid references public.profiles(id),
  paused_until timestamptz,
  pause_reason text,
  resolution text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_cases_upd before update on public.collection_cases for each row execute function public.set_updated_at();
create index cases_status_idx on public.collection_cases (status, created_at);
create unique index cases_one_open_per_installment_reason on public.collection_cases (installment_id, reason) where status <> 'resolved';

-- ---------- Cartão (modalidade desativada por padrão) ----------
create table public.card_operations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  agent_id uuid references public.profiles(id),
  provider text,
  checkout_reference text unique,
  card_token_ref text,                      -- apenas referência do token no parceiro; nunca PAN/CVV
  gross_cents bigint not null,
  installments int not null,
  installment_cents bigint not null,
  fees_cents bigint not null default 0,
  net_pix_cents bigint not null,
  status public.card_op_status not null default 'draft',
  authorization_status text,
  settlement_status text,
  disbursement_status text,
  dispute_status text,
  disbursement_reference text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_card_ops_upd before update on public.card_operations for each row execute function public.set_updated_at();

-- ---------- Auditoria ----------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_role text,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index audit_entity_idx on public.audit_log (entity, entity_id);

-- ---------- Estado do provedor Pix simulado (sandbox) ----------
create table public.mock_pix_state (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                       -- charge | payout | key
  reference text not null,
  status text not null,
  amount_cents bigint,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, reference)
);
create trigger trg_mock_upd before update on public.mock_pix_state for each row execute function public.set_updated_at();
