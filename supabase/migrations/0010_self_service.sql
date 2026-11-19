-- Reestruturação: cliente se cadastra sozinho no site e informa o ID do agente (indicador).
-- Propostas/contratos podem não ter agente; agentes recebem um código curto (WC1001...).

alter table public.proposals alter column agent_id drop not null;
alter table public.contracts alter column agent_id drop not null;

alter table public.profiles add column if not exists referral_code text unique;
create sequence if not exists public.agent_code_seq start 1001;
update public.profiles set referral_code = 'WC' || nextval('public.agent_code_seq') where role = 'agent' and referral_code is null;

create or replace function public.wc_assign_agent_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'agent' and new.referral_code is null then new.referral_code := 'WC' || nextval('public.agent_code_seq'); end if;
  if new.role = 'agent' and new.referral_slug is null then new.referral_slug := lower(regexp_replace(split_part(new.full_name, ' ', 1), '[^A-Za-z0-9]', '', 'g')) || '-' || left(new.id::text, 4); end if;
  return new;
end $$;
drop trigger if exists trg_profiles_agent_code on public.profiles;
create trigger trg_profiles_agent_code before insert on public.profiles for each row execute function public.wc_assign_agent_code();

-- Consulta pública do agente pelo código ou slug (só primeiro nome)
create or replace function public.wc_public_agent(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'first_name', split_part(full_name, ' ', 1), 'code', referral_code)
  from public.profiles
  where role = 'agent' and active and (upper(referral_code) = upper(trim(p_code)) or referral_slug = lower(trim(p_code)))
  limit 1
$$;
grant execute on function public.wc_public_agent(text) to anon, authenticated;

-- Cadastro próprio do cliente (chamado pelo servidor com a chave de serviço, após criar o usuário no Auth)
create or replace function public.wc_self_register_customer(
  p_user_id uuid, p_full_name text, p_cpf text, p_cpf_hash text, p_phone text, p_email text, p_agent uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_reused boolean := false;
begin
  if p_agent is not null and not exists (select 1 from public.profiles where id = p_agent and role = 'agent' and active) then
    raise exception 'ID do agente inválido';
  end if;
  select id into v_id from public.customers where cpf_hash = p_cpf_hash;
  if v_id is null then
    insert into public.customers (full_name, cpf, cpf_hash, phone, email, user_id, created_by)
    values (p_full_name, p_cpf, p_cpf_hash, p_phone, p_email, p_user_id, p_agent) returning id into v_id;
  else
    v_reused := true;
    if exists (select 1 from public.customers where id = v_id and user_id is not null and user_id <> p_user_id) then
      raise exception 'este CPF já possui acesso ao portal; entre com seu e-mail e senha';
    end if;
    update public.customers set user_id = p_user_id, email = coalesce(p_email, email), phone = coalesce(p_phone, phone) where id = v_id;
  end if;
  if p_agent is not null then
    insert into public.agent_customers (agent_id, customer_id) values (p_agent, v_id) on conflict do nothing;
  end if;
  perform set_config('wc.actor', p_user_id::text, true);
  perform public.wc_audit('customer.self_register', 'customers', v_id::text, null, jsonb_build_object('agent', p_agent, 'reused', v_reused));
  return jsonb_build_object('customer_id', v_id, 'reused', v_reused);
end $$;
revoke all on function public.wc_self_register_customer(uuid,text,text,text,text,text,uuid) from public, anon, authenticated;

-- Painel do agente: indicações com o status mais recente
create or replace function public.wc_agent_referrals(p_agent uuid) returns table (
  customer_id uuid, full_name text, cpf_masked text, created_at timestamptz,
  proposal_status text, contract_status text, principal_cents bigint, term_months int, next_due date, overdue_days int
) language sql stable security definer set search_path = public as $$
  select c.id, c.full_name, public.mask_cpf(c.cpf), ac.created_at,
    (select p.status::text from public.proposals p where p.customer_id = c.id order by p.created_at desc limit 1),
    (select k.status::text from public.contracts k where k.customer_id = c.id order by k.created_at desc limit 1),
    coalesce((select k.principal_cents from public.contracts k where k.customer_id = c.id order by k.created_at desc limit 1),
             (select p.principal_cents from public.proposals p where p.customer_id = c.id order by p.created_at desc limit 1)),
    coalesce((select k.term_months from public.contracts k where k.customer_id = c.id order by k.created_at desc limit 1),
             (select p.term_months from public.proposals p where p.customer_id = c.id order by p.created_at desc limit 1)),
    (select min(i.due_date) from public.installments i join public.contracts k on k.id = i.contract_id where k.customer_id = c.id and i.status in ('open','partial')),
    (select greatest(public.sp_today() - min(i.due_date), 0) from public.installments i join public.contracts k on k.id = i.contract_id where k.customer_id = c.id and i.status in ('open','partial') and i.due_date < public.sp_today())
  from public.agent_customers ac join public.customers c on c.id = ac.customer_id
  where ac.agent_id = p_agent and (auth.uid() = p_agent or public.is_admin() or auth.role() = 'service_role')
  order by ac.created_at desc
$$;
grant execute on function public.wc_agent_referrals(uuid) to authenticated;
