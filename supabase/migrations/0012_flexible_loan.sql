-- Crédito com valor livre e prazo de 4 a 20x: propostas/contratos deixam de depender do catálogo fixo.
alter table public.proposals alter column product_version_id drop not null;
alter table public.contracts alter column product_version_id drop not null;

insert into public.settings (key, value) values
 ('loan', '{"monthly_rate":"0.15","min_cents":50000,"max_cents":1000000,"step_cents":10000,"min_term":4,"max_term":20}')
on conflict (key) do nothing;

-- Painel: contratos sem versão de produto continuam contando
create or replace function public.wc_dashboard(p_from date, p_to date, p_product uuid default null, p_agent uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_today date := public.sp_today(); r jsonb;
begin
  with ctr as (
    select c.* from public.contracts c left join public.product_versions pv on pv.id = c.product_version_id
    where (p_product is null or pv.product_id = p_product) and (p_agent is null or c.agent_id = p_agent)
  ), inst as (
    select i.*, (i.amount_cents - i.paid_cents) as balance from public.installments i join ctr on ctr.id = i.contract_id where i.status in ('open','partial')
  )
  select jsonb_build_object(
    'disbursed_cents', coalesce((select sum(d.amount_cents) from public.disbursements d join ctr on ctr.id = d.contract_id where d.status = 'confirmed' and (d.confirmed_at at time zone 'America/Sao_Paulo')::date between p_from and p_to), 0),
    'received_cents', coalesce((select sum(p.applied_cents) from public.payments p join public.installments i on i.id = p.installment_id join ctr on ctr.id = i.contract_id where p.status = 'applied' and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_from and p_to), 0),
    'open_to_fall_due_cents', coalesce((select sum(balance) from inst where due_date >= v_today), 0),
    'due_7_cents', coalesce((select sum(balance) from inst where due_date between v_today and v_today + 6), 0),
    'due_15_cents', coalesce((select sum(balance) from inst where due_date between v_today and v_today + 14), 0),
    'due_30_cents', coalesce((select sum(balance) from inst where due_date between v_today and v_today + 29), 0),
    'overdue_cents', coalesce((select sum(balance) from inst where due_date < v_today), 0),
    'overdue_count', (select count(*) from inst where due_date < v_today),
    'auto_settled_cents', coalesce((select sum(p.applied_cents) from public.payments p join public.installments i on i.id = p.installment_id join ctr on ctr.id = i.contract_id where p.status = 'applied' and p.created_by is null and p.kind in ('full','late','overpaid') and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_from and p_to), 0),
    'auto_settled_count', (select count(*) from public.payments p join public.installments i on i.id = p.installment_id join ctr on ctr.id = i.contract_id where p.status = 'applied' and p.created_by is null and p.kind in ('full','late','overpaid') and (p.paid_at at time zone 'America/Sao_Paulo')::date between p_from and p_to),
    'human_interventions', (select count(*) from public.reconciliation_items ri left join public.installments i on i.id = ri.installment_id left join ctr on ctr.id = i.contract_id where ri.resolved_at is not null and (ri.resolved_at at time zone 'America/Sao_Paulo')::date between p_from and p_to and (p_product is null and p_agent is null or ctr.id is not null))
      + (select count(*) from public.collection_cases cc join ctr on ctr.id = cc.contract_id where cc.resolved_by is not null and (cc.resolved_at at time zone 'America/Sao_Paulo')::date between p_from and p_to),
    'open_cases', (select count(*) from public.collection_cases cc join ctr on ctr.id = cc.contract_id where cc.status <> 'resolved'),
    'today', v_today
  ) into r;
  return r;
end $$;
