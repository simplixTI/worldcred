-- Leads da landing page e link de indicação por agente

alter table public.profiles add column if not exists referral_slug text unique;
update public.profiles set referral_slug = lower(regexp_replace(split_part(full_name, ' ', 1), '[^A-Za-z0-9]', '', 'g')) || '-' || left(id::text, 4)
where role = 'agent' and referral_slug is null;

create type public.lead_status as enum ('new','assigned','converted','discarded');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  cpf text not null,
  cpf_hash text not null,
  phone text not null,
  email text,
  amount_cents bigint,
  term_months int,
  source_slug text,
  source_agent uuid references public.profiles(id),
  status public.lead_status not null default 'new',
  assigned_to uuid references public.profiles(id),
  customer_id uuid references public.customers(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_leads_upd before update on public.leads for each row execute function public.set_updated_at();
create index leads_status_idx on public.leads (status, created_at desc);
alter table public.leads enable row level security;
create policy leads_admin on public.leads for all using (public.is_admin()) with check (public.admin_write_ok());
create policy leads_agent on public.leads for select using (assigned_to = auth.uid() or source_agent = auth.uid());

-- Lead público (anon): valida, limita repetição e, se veio por link de agente, já cria o cliente na carteira dele
create or replace function public.wc_create_lead(p_full_name text, p_cpf text, p_cpf_hash text, p_phone text, p_email text, p_amount_cents bigint, p_term_months int, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_agent uuid; v_lead public.leads; v_customer uuid; v_reused boolean;
begin
  if length(p_cpf) <> 11 or length(trim(p_full_name)) < 5 or length(p_phone) < 12 then raise exception 'dados inválidos'; end if;
  if (select count(*) from public.leads where cpf_hash = p_cpf_hash and created_at > now() - interval '1 day') >= 3 then
    raise exception 'já recebemos sua solicitação; aguarde o contato';
  end if;
  if p_ref is not null then
    select id into v_agent from public.profiles where referral_slug = lower(p_ref) and role = 'agent' and active;
  end if;
  insert into public.leads (full_name, cpf, cpf_hash, phone, email, amount_cents, term_months, source_slug, source_agent, status, assigned_to)
  values (trim(p_full_name), p_cpf, p_cpf_hash, p_phone, nullif(trim(p_email), ''), p_amount_cents, p_term_months, p_ref, v_agent, (case when v_agent is null then 'new' else 'assigned' end)::public.lead_status, v_agent)
  returning * into v_lead;
  if v_agent is not null then
    select customer_id, reused into v_customer, v_reused from public.wc_find_or_link_customer(trim(p_full_name), p_cpf, p_cpf_hash, p_phone, nullif(trim(p_email), ''), v_agent);
    update public.leads set status = 'converted', customer_id = v_customer where id = v_lead.id;
  end if;
  perform public.wc_audit('lead.create', 'leads', v_lead.id::text, null, jsonb_build_object('source', p_ref, 'auto_agent', v_agent));
  return jsonb_build_object('lead_id', v_lead.id, 'customer_id', v_customer, 'agent_id', v_agent);
end $$;
revoke all on function public.wc_create_lead(text,text,text,text,text,bigint,int,text) from public;
grant execute on function public.wc_create_lead(text,text,text,text,text,bigint,int,text) to anon, authenticated;

-- Admin atribui lead a um agente: cria/vincula o cliente na carteira e marca convertido
create or replace function public.wc_assign_lead(p_lead uuid, p_agent uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.leads; v_customer uuid; v_reused boolean;
begin
  perform set_config('wc.actor', p_actor::text, true);
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and active) then raise exception 'somente admin' using errcode = '42501'; end if;
  select * into l from public.leads where id = p_lead for update;
  if l.id is null then raise exception 'lead não encontrado'; end if;
  if l.status = 'converted' then return jsonb_build_object('customer_id', l.customer_id, 'already', true); end if;
  select customer_id, reused into v_customer, v_reused from public.wc_find_or_link_customer(l.full_name, l.cpf, l.cpf_hash, l.phone, l.email, p_agent);
  update public.leads set status = 'converted', assigned_to = p_agent, customer_id = v_customer where id = l.id;
  perform public.wc_audit('lead.assign', 'leads', l.id::text, to_jsonb(l), jsonb_build_object('agent', p_agent, 'customer_id', v_customer));
  return jsonb_build_object('customer_id', v_customer, 'reused', v_reused);
end $$;
revoke all on function public.wc_assign_lead(uuid,uuid,uuid) from public, anon, authenticated;

create or replace function public.wc_discard_lead(p_lead uuid, p_actor uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('wc.actor', p_actor::text, true);
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and active) then raise exception 'somente admin' using errcode = '42501'; end if;
  update public.leads set status = 'discarded', note = p_note where id = p_lead;
  perform public.wc_audit('lead.discard', 'leads', p_lead::text, null, jsonb_build_object('note', p_note));
end $$;
revoke all on function public.wc_discard_lead(uuid,uuid,text) from public, anon, authenticated;

-- Catálogo público (somente campos não sensíveis) para o simulador da landing
create or replace function public.wc_public_catalog()
returns table (product_id uuid, name text, principal_cents bigint, monthly_rate numeric, allowed_terms int[], fee_cents bigint, version int)
language sql stable security definer set search_path = public as $$
  select distinct on (p.id) p.id, p.name, p.principal_cents, pv.monthly_rate, pv.allowed_terms, pv.fee_cents, pv.version
  from public.products p join public.product_versions pv on pv.product_id = p.id
  where p.active and p.modality = 'fixed' and pv.valid_from <= public.sp_today() and (pv.valid_to is null or pv.valid_to >= public.sp_today())
  order by p.id, pv.version desc
$$;
grant execute on function public.wc_public_catalog() to anon, authenticated;
