-- WorldCred — RLS e funções de autorização

-- ---------- Funções de autorização (security definer para evitar recursão) ----------
create or replace function public.current_wc_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active)
$$;

create or replace function public.is_agent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'agent' and active)
$$;

create or replace function public.is_aal2() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
$$;

create or replace function public.mfa_enforced() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> 'mfa_enforced')::boolean from public.settings where key = 'security'), true)
$$;

-- escrita administrativa: admin ativo e, quando MFA está imposto, sessão aal2
create or replace function public.admin_write_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() and (not public.mfa_enforced() or public.is_aal2())
$$;

create or replace function public.my_customer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.customers where user_id = auth.uid()
$$;

create or replace function public.agent_has_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agent_customers where agent_id = auth.uid() and customer_id = p_customer)
$$;

-- ---------- Habilitar RLS ----------
alter table public.profiles enable row level security;
alter table public.lenders enable row level security;
alter table public.settings enable row level security;
alter table public.customers enable row level security;
alter table public.agent_customers enable row level security;
alter table public.products enable row level security;
alter table public.product_versions enable row level security;
alter table public.proposals enable row level security;
alter table public.contracts enable row level security;
alter table public.installments enable row level security;
alter table public.disbursements enable row level security;
alter table public.pix_charges enable row level security;
alter table public.provider_events enable row level security;
alter table public.payments enable row level security;
alter table public.reconciliation_items enable row level security;
alter table public.payment_claims enable row level security;
alter table public.message_queue enable row level security;
alter table public.portal_links enable row level security;
alter table public.collection_cases enable row level security;
alter table public.card_operations enable row level security;
alter table public.audit_log enable row level security;
alter table public.mock_pix_state enable row level security;

-- ---------- profiles ----------
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_agent_read_peers on public.profiles for select using (public.is_agent() and role = 'admin');
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles p where p.id = auth.uid()));
create policy profiles_admin_write on public.profiles for all using (public.admin_write_ok()) with check (public.admin_write_ok());

-- ---------- lenders / settings / catálogo: leitura para autenticados, escrita admin ----------
create policy lenders_read on public.lenders for select using (auth.role() = 'authenticated');
create policy lenders_admin on public.lenders for all using (public.admin_write_ok()) with check (public.admin_write_ok());

create policy settings_read on public.settings for select using (auth.role() = 'authenticated');
create policy settings_admin on public.settings for all using (public.admin_write_ok()) with check (public.admin_write_ok());

create policy products_read on public.products for select using (auth.role() = 'authenticated');
create policy products_admin on public.products for all using (public.admin_write_ok()) with check (public.admin_write_ok());
create policy product_versions_read on public.product_versions for select using (auth.role() = 'authenticated');
create policy product_versions_admin on public.product_versions for insert with check (public.admin_write_ok());
-- versões são imutáveis: sem update/delete

-- ---------- customers ----------
create policy customers_client_read on public.customers for select using (user_id = auth.uid());
create policy customers_client_update on public.customers for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy customers_agent_read on public.customers for select using (public.is_agent() and public.agent_has_customer(id));
create policy customers_agent_update on public.customers for update using (public.is_agent() and public.agent_has_customer(id)) with check (public.is_agent() and public.agent_has_customer(id));
create policy customers_admin on public.customers for all using (public.is_admin()) with check (public.admin_write_ok());

create policy agent_customers_agent on public.agent_customers for select using (agent_id = auth.uid());
create policy agent_customers_admin on public.agent_customers for all using (public.is_admin()) with check (public.admin_write_ok());

-- ---------- proposals ----------
create policy proposals_client on public.proposals for select using (customer_id = public.my_customer_id() and status <> 'draft');
create policy proposals_agent on public.proposals for select using (agent_id = auth.uid());
create policy proposals_agent_insert on public.proposals for insert with check (public.is_agent() and agent_id = auth.uid() and public.agent_has_customer(customer_id));
create policy proposals_agent_update on public.proposals for update using (agent_id = auth.uid() and status in ('draft','sent')) with check (agent_id = auth.uid());
create policy proposals_admin on public.proposals for all using (public.is_admin()) with check (public.admin_write_ok());

-- ---------- contracts / installments ----------
create policy contracts_client on public.contracts for select using (customer_id = public.my_customer_id());
create policy contracts_agent on public.contracts for select using (agent_id = auth.uid());
create policy contracts_admin on public.contracts for all using (public.is_admin()) with check (public.admin_write_ok());

create policy installments_client on public.installments for select using (exists (select 1 from public.contracts c where c.id = contract_id and c.customer_id = public.my_customer_id()));
create policy installments_agent on public.installments for select using (exists (select 1 from public.contracts c where c.id = contract_id and c.agent_id = auth.uid()));
create policy installments_admin on public.installments for all using (public.is_admin()) with check (public.admin_write_ok());

-- ---------- disbursements: admin e agente (leitura) ----------
create policy disbursements_agent on public.disbursements for select using (exists (select 1 from public.contracts c where c.id = contract_id and c.agent_id = auth.uid()));
create policy disbursements_client on public.disbursements for select using (exists (select 1 from public.contracts c where c.id = contract_id and c.customer_id = public.my_customer_id()));
create policy disbursements_admin on public.disbursements for all using (public.is_admin()) with check (public.admin_write_ok());

-- ---------- pix_charges / payments ----------
create policy charges_client on public.pix_charges for select using (exists (select 1 from public.installments i join public.contracts c on c.id = i.contract_id where i.id = installment_id and c.customer_id = public.my_customer_id()));
create policy charges_agent on public.pix_charges for select using (exists (select 1 from public.installments i join public.contracts c on c.id = i.contract_id where i.id = installment_id and c.agent_id = auth.uid()));
create policy charges_admin on public.pix_charges for all using (public.is_admin()) with check (public.admin_write_ok());

create policy payments_client on public.payments for select using (exists (select 1 from public.installments i join public.contracts c on c.id = i.contract_id where i.id = installment_id and c.customer_id = public.my_customer_id()));
create policy payments_agent on public.payments for select using (exists (select 1 from public.installments i join public.contracts c on c.id = i.contract_id where i.id = installment_id and c.agent_id = auth.uid()));
create policy payments_admin on public.payments for all using (public.is_admin()) with check (public.admin_write_ok());

create policy provider_events_admin on public.provider_events for select using (public.is_admin());
create policy reconciliation_admin on public.reconciliation_items for all using (public.is_admin()) with check (public.admin_write_ok());

-- ---------- payment_claims ----------
create policy claims_client on public.payment_claims for select using (customer_id = public.my_customer_id());
create policy claims_agent on public.payment_claims for select using (public.is_agent() and public.agent_has_customer(customer_id));
create policy claims_admin on public.payment_claims for all using (public.is_admin()) with check (public.admin_write_ok());

-- ---------- message_queue / portal_links ----------
create policy mq_agent on public.message_queue for select using (public.is_agent() and public.agent_has_customer(customer_id));
create policy mq_admin on public.message_queue for all using (public.is_admin()) with check (public.admin_write_ok());
create policy portal_links_admin on public.portal_links for select using (public.is_admin());

-- ---------- collection_cases ----------
create policy cases_agent on public.collection_cases for select using (assigned_to = auth.uid() or (public.is_agent() and public.agent_has_customer(customer_id)));
create policy cases_agent_update on public.collection_cases for update using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());
create policy cases_admin on public.collection_cases for all using (public.is_admin()) with check (public.admin_write_ok());

-- ---------- card_operations ----------
create policy card_client on public.card_operations for select using (customer_id = public.my_customer_id());
create policy card_agent on public.card_operations for select using (agent_id = auth.uid());
create policy card_admin on public.card_operations for all using (public.is_admin()) with check (public.admin_write_ok());

-- ---------- audit / mock ----------
create policy audit_admin on public.audit_log for select using (public.is_admin());
create policy mock_admin on public.mock_pix_state for select using (public.is_admin());
