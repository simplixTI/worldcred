-- WorldCred — funções transacionais (security definer)
-- O servidor chama estas funções com a chave de serviço e informa o ator via
-- set_config('wc.actor', '<uuid>', true) quando necessário. Funções chamadas
-- pelo cliente autenticado usam auth.uid().

-- ---------- Ator e auditoria ----------
create or replace function public.wc_actor() returns uuid
language sql stable as $$
  select coalesce(nullif(current_setting('wc.actor', true), '')::uuid, auth.uid())
$$;

create or replace function public.wc_audit(
  p_action text, p_entity text, p_entity_id text,
  p_before jsonb default null, p_after jsonb default null, p_meta jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := public.wc_actor(); v_role text;
begin
  select role::text into v_role from public.profiles where id = v_actor;
  insert into public.audit_log (actor_id, actor_role, action, entity, entity_id, before, after, meta)
  values (v_actor, coalesce(v_role, case when v_actor is null then 'system' else 'unknown' end), p_action, p_entity, p_entity_id, p_before, p_after, p_meta);
end $$;

create or replace function public.wc_audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  v_id := coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', (to_jsonb(coalesce(new, old)) ->> 'key'));
  perform public.wc_audit(lower(tg_op), tg_table_name, v_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_products after insert or update or delete on public.products for each row execute function public.wc_audit_trigger();
create trigger audit_product_versions after insert or update or delete on public.product_versions for each row execute function public.wc_audit_trigger();
create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.wc_audit_trigger();
create trigger audit_settings after insert or update or delete on public.settings for each row execute function public.wc_audit_trigger();
create trigger audit_lenders after insert or update or delete on public.lenders for each row execute function public.wc_audit_trigger();
create trigger audit_cases after update on public.collection_cases for each row execute function public.wc_audit_trigger();
create trigger audit_reconciliation after update on public.reconciliation_items for each row execute function public.wc_audit_trigger();
create trigger audit_disbursements after update on public.disbursements for each row execute function public.wc_audit_trigger();

-- ---------- Clientes: reutilizar cadastro sem expor dados entre agentes ----------
create or replace function public.wc_find_or_link_customer(
  p_full_name text, p_cpf text, p_cpf_hash text, p_phone text, p_email text, p_agent uuid default null
) returns table (customer_id uuid, reused boolean)
language plpgsql security definer set search_path = public as $$
declare v_agent uuid := coalesce(p_agent, auth.uid()); v_id uuid; v_reused boolean := false;
begin
  if v_agent is null or not exists (select 1 from public.profiles where id = v_agent and role in ('agent','admin') and active) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  select id into v_id from public.customers where cpf_hash = p_cpf_hash;
  if v_id is null then
    insert into public.customers (full_name, cpf, cpf_hash, phone, email, created_by)
    values (p_full_name, p_cpf, p_cpf_hash, p_phone, p_email, v_agent) returning id into v_id;
  else
    v_reused := true;
  end if;
  insert into public.agent_customers (agent_id, customer_id) values (v_agent, v_id) on conflict do nothing;
  perform public.wc_audit(case when v_reused then 'customer.link' else 'customer.create' end, 'customers', v_id::text, null, jsonb_build_object('agent', v_agent));
  return query select v_id, v_reused;
end $$;

-- ---------- Aceite da proposta (cliente autenticado) ----------
create or replace function public.wc_accept_proposal(p_proposal_id uuid, p_evidence jsonb)
returns public.proposals language plpgsql security definer set search_path = public as $$
declare v public.proposals; v_customer uuid := public.my_customer_id();
begin
  select * into v from public.proposals where id = p_proposal_id for update;
  if v.id is null or v.customer_id is distinct from v_customer then raise exception 'proposta não encontrada' using errcode = 'P0002'; end if;
  if v.status <> 'sent' then raise exception 'proposta não está disponível para aceite (status %)', v.status; end if;
  if v.expires_at is not null and v.expires_at < now() then
    update public.proposals set status = 'expired' where id = v.id;
    raise exception 'proposta expirada';
  end if;
  update public.proposals set status = 'accepted', accepted_at = now(),
    acceptance_evidence = coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object('user_id', auth.uid(), 'accepted_at', now())
  where id = v.id returning * into v;
  perform public.wc_audit('proposal.accept', 'proposals', v.id::text, null, jsonb_build_object('status', v.status));
  return v;
end $$;

-- ---------- Aprovação: cria contrato e desembolso pendente ----------
create or replace function public.wc_approve_proposal(p_proposal_id uuid, p_actor uuid, p_note text default null)
returns public.contracts language plpgsql security definer set search_path = public as $$
declare p public.proposals; c public.contracts; l public.lenders; cust public.customers; v_number text; v_snap jsonb;
begin
  perform set_config('wc.actor', p_actor::text, true);
  select * into p from public.proposals where id = p_proposal_id for update;
  if p.id is null then raise exception 'proposta não encontrada'; end if;
  if p.status <> 'accepted' then raise exception 'somente propostas aceitas podem ser aprovadas (status %)', p.status; end if;
  select * into l from public.lenders where id = p.lender_id;
  select * into cust from public.customers where id = p.customer_id;
  v_snap := p.schedule_snapshot;
  v_number := 'WC' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMM') || '-' || lpad(p.number::text, 6, '0');
  insert into public.contracts (number, proposal_id, customer_id, agent_id, lender_id, product_version_id, status, conditions,
    principal_cents, net_cents, total_cents, term_months, monthly_rate, annual_rate, cet_monthly, cet_annual, accepted_at)
  values (v_number, p.id, p.customer_id, p.agent_id, p.lender_id, p.product_version_id, 'pending_disbursement',
    jsonb_build_object('schedule', v_snap, 'lender', jsonb_build_object('legal_name', l.legal_name, 'cnpj', l.cnpj),
      'acceptance', p.acceptance_evidence, 'conditions_version', v_snap -> 'conditions_version'),
    p.principal_cents, (v_snap ->> 'net_cents')::bigint, (v_snap ->> 'total_cents')::bigint, p.term_months, p.monthly_rate,
    (v_snap ->> 'annual_rate')::numeric, (v_snap ->> 'cet_monthly')::numeric, (v_snap ->> 'cet_annual')::numeric, p.accepted_at)
  returning * into c;
  insert into public.disbursements (contract_id, reference, amount_cents, pix_key, pix_key_type, status, requested_by)
  values (c.id, 'WCD' || replace(c.number, '-', '') || '-' || upper(substr(md5(c.id::text), 1, 6)), c.net_cents,
    coalesce(cust.pix_key, ''), cust.pix_key_type, 'pending', p_actor);
  update public.proposals set status = 'approved', decided_by = p_actor, decided_at = now(), decision_note = p_note where id = p.id;
  update public.proposals set status = 'contracted' where id = p.id;
  perform public.wc_audit('proposal.approve', 'proposals', p.id::text, jsonb_build_object('status', 'accepted'), jsonb_build_object('status', 'contracted', 'contract_id', c.id, 'note', p_note));
  return c;
end $$;

create or replace function public.wc_decline_proposal(p_proposal_id uuid, p_actor uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('wc.actor', p_actor::text, true);
  update public.proposals set status = 'declined', decided_by = p_actor, decided_at = now(), decision_note = p_note
  where id = p_proposal_id and status = 'accepted';
  if not found then raise exception 'proposta não está aguardando decisão'; end if;
  perform public.wc_audit('proposal.decline', 'proposals', p_proposal_id::text, null, jsonb_build_object('note', p_note));
end $$;

-- ---------- Confirmação do desembolso: ativa contrato e gera parcelas ----------
create or replace function public.wc_confirm_disbursement(p_disbursement_id uuid, p_provider_tx_id text, p_confirmed_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.disbursements; c public.contracts; v_base date; v_sched jsonb; v_item jsonb; v_k int := 0; v_due date;
begin
  select * into d from public.disbursements where id = p_disbursement_id for update;
  if d.id is null then raise exception 'desembolso não encontrado'; end if;
  if d.status = 'confirmed' then return jsonb_build_object('outcome', 'already_confirmed', 'contract_id', d.contract_id); end if;
  if d.status not in ('authorized','sent','timeout') then raise exception 'desembolso em estado % não pode ser confirmado', d.status; end if;
  select * into c from public.contracts where id = d.contract_id for update;
  update public.disbursements set status = 'confirmed', provider_tx_id = coalesce(p_provider_tx_id, provider_tx_id), confirmed_at = p_confirmed_at where id = d.id;
  v_base := (p_confirmed_at at time zone 'America/Sao_Paulo')::date;
  v_sched := c.conditions -> 'schedule' -> 'installments';
  for v_item in select * from jsonb_array_elements(v_sched) loop
    v_k := v_k + 1;
    v_due := ((v_base + 30) + ((v_k - 1) || ' months')::interval)::date;
    insert into public.installments (contract_id, number, due_date, amount_cents, principal_cents, interest_cents)
    values (c.id, v_k, v_due, (v_item ->> 'amount_cents')::bigint, (v_item ->> 'principal_cents')::bigint, (v_item ->> 'interest_cents')::bigint)
    on conflict (contract_id, number) do nothing;
  end loop;
  update public.contracts set status = 'active', activated_at = p_confirmed_at where id = c.id;
  perform public.wc_audit('disbursement.confirm', 'disbursements', d.id::text, jsonb_build_object('status', d.status), jsonb_build_object('status', 'confirmed', 'provider_tx_id', p_provider_tx_id));
  return jsonb_build_object('outcome', 'confirmed', 'contract_id', c.id, 'installments', v_k, 'first_due_date', v_base + 30);
end $$;

-- ---------- Crédito em parcela (interno) ----------
create or replace function public.wc__credit_installment(p_installment_id uuid, p_amount bigint, p_paid_at timestamptz)
returns public.installments language plpgsql security definer set search_path = public as $$
declare i public.installments; v_remaining bigint; v_open int;
begin
  select * into i from public.installments where id = p_installment_id for update;
  v_remaining := i.amount_cents - i.paid_cents;
  if p_amount > v_remaining then raise exception 'crédito maior que o saldo da parcela'; end if;
  if p_amount = v_remaining then
    update public.installments set paid_cents = amount_cents, status = 'paid', paid_at = p_paid_at, in_review = false, review_hold_until = null where id = i.id returning * into i;
    update public.pix_charges set status = 'paid' where installment_id = i.id and status = 'active';
    update public.message_queue set status = 'cancelled', skip_reason = 'parcela paga' where installment_id = i.id and status in ('queued','failed','sending');
    update public.collection_cases set status = 'resolved', resolution = 'Pagamento confirmado (automático)', resolved_at = now() where installment_id = i.id and status <> 'resolved';
    update public.payment_claims set status = 'confirmed', reviewed_at = now() where installment_id = i.id and status = 'open';
    select count(*) into v_open from public.installments where contract_id = i.contract_id and status in ('open','partial');
    if v_open = 0 then update public.contracts set status = 'settled', settled_at = p_paid_at where id = i.contract_id and status = 'active'; end if;
  else
    update public.installments set paid_cents = paid_cents + p_amount, status = 'partial', in_review = false, review_hold_until = null where id = i.id returning * into i;
    -- a cobrança ativa não reflete mais o saldo: será substituída na próxima emissão
    update public.pix_charges set status = 'superseded' where installment_id = i.id and status = 'active';
  end if;
  return i;
end $$;

-- ---------- Registro de pagamento vindo do provedor (idempotente, transacional) ----------
create or replace function public.wc_apply_payment(
  p_provider text, p_external_payment_id text, p_reference text, p_amount_cents bigint,
  p_paid_at timestamptz, p_provider_event_id uuid, p_payer jsonb default null, p_receiver_account text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare ch public.pix_charges; i public.installments; pay public.payments; v_remaining bigint; v_outcome text; v_kind public.payment_kind;
begin
  select * into pay from public.payments where provider = p_provider and external_payment_id = p_external_payment_id;
  if pay.id is not null then
    return jsonb_build_object('outcome', 'duplicate_event', 'payment_id', pay.id, 'installment_id', pay.installment_id);
  end if;

  select * into ch from public.pix_charges where reference = p_reference for update;
  if ch.id is null then
    insert into public.payments (provider, external_payment_id, reference, amount_cents, kind, status, paid_at, payer, provider_event_id)
    values (p_provider, p_external_payment_id, p_reference, p_amount_cents, 'unlinked', 'reconciliation', p_paid_at, p_payer, p_provider_event_id) returning * into pay;
    insert into public.reconciliation_items (payment_id, reason, note) values (pay.id, 'unlinked', 'Pagamento sem cobrança correspondente');
    return jsonb_build_object('outcome', 'unlinked', 'payment_id', pay.id);
  end if;

  select * into i from public.installments where id = ch.installment_id for update;

  if p_receiver_account is not null and ch.receiver_account is not null and p_receiver_account <> ch.receiver_account then
    insert into public.payments (installment_id, charge_id, provider, external_payment_id, reference, amount_cents, kind, status, paid_at, payer, provider_event_id)
    values (i.id, ch.id, p_provider, p_external_payment_id, p_reference, p_amount_cents, 'unlinked', 'reconciliation', p_paid_at, p_payer, p_provider_event_id) returning * into pay;
    insert into public.reconciliation_items (payment_id, installment_id, reason, note) values (pay.id, i.id, 'receiver_mismatch', 'Conta recebedora diverge da cobrança');
    return jsonb_build_object('outcome', 'receiver_mismatch', 'payment_id', pay.id);
  end if;

  v_remaining := i.amount_cents - i.paid_cents;

  if i.status = 'paid' or i.status = 'cancelled' then
    insert into public.payments (installment_id, charge_id, provider, external_payment_id, reference, amount_cents, kind, status, paid_at, payer, provider_event_id)
    values (i.id, ch.id, p_provider, p_external_payment_id, p_reference, p_amount_cents, 'duplicate', 'reconciliation', p_paid_at, p_payer, p_provider_event_id) returning * into pay;
    insert into public.reconciliation_items (payment_id, installment_id, reason, note) values (pay.id, i.id, 'duplicate_payment', 'Parcela já estava liquidada');
    return jsonb_build_object('outcome', 'duplicate_payment', 'payment_id', pay.id, 'installment_id', i.id);
  end if;

  if p_amount_cents = v_remaining then
    v_kind := case when ch.status in ('expired','superseded','cancelled') or p_paid_at::date > i.due_date then 'late' else 'full' end;
    insert into public.payments (installment_id, charge_id, provider, external_payment_id, reference, amount_cents, applied_cents, kind, status, paid_at, payer, provider_event_id)
    values (i.id, ch.id, p_provider, p_external_payment_id, p_reference, p_amount_cents, p_amount_cents, v_kind, 'applied', p_paid_at, p_payer, p_provider_event_id) returning * into pay;
    perform public.wc__credit_installment(i.id, p_amount_cents, p_paid_at);
    v_outcome := 'applied';
  elsif p_amount_cents < v_remaining then
    insert into public.payments (installment_id, charge_id, provider, external_payment_id, reference, amount_cents, applied_cents, kind, status, paid_at, payer, provider_event_id)
    values (i.id, ch.id, p_provider, p_external_payment_id, p_reference, p_amount_cents, 0, 'partial', 'reconciliation', p_paid_at, p_payer, p_provider_event_id) returning * into pay;
    insert into public.reconciliation_items (payment_id, installment_id, reason, note) values (pay.id, i.id, 'partial_payment', format('Recebido %s de %s centavos', p_amount_cents, v_remaining));
    update public.installments set in_review = true where id = i.id;
    insert into public.collection_cases (installment_id, contract_id, customer_id, reason, detail)
    select i.id, i.contract_id, c.customer_id, 'reconciliation', 'Pagamento parcial aguardando conciliação' from public.contracts c where c.id = i.contract_id
    on conflict (installment_id, reason) where status <> 'resolved' do nothing;
    v_outcome := 'partial_reconciliation';
  else
    insert into public.payments (installment_id, charge_id, provider, external_payment_id, reference, amount_cents, applied_cents, kind, status, paid_at, payer, provider_event_id)
    values (i.id, ch.id, p_provider, p_external_payment_id, p_reference, p_amount_cents, v_remaining, 'overpaid', 'applied', p_paid_at, p_payer, p_provider_event_id) returning * into pay;
    perform public.wc__credit_installment(i.id, v_remaining, p_paid_at);
    insert into public.reconciliation_items (payment_id, installment_id, reason, note) values (pay.id, i.id, 'overpayment', format('Excedente de %s centavos', p_amount_cents - v_remaining));
    v_outcome := 'applied_with_excess';
  end if;

  perform public.wc_audit('payment.' || v_outcome, 'payments', pay.id::text, null, jsonb_build_object('installment_id', i.id, 'amount_cents', p_amount_cents, 'reference', p_reference));
  return jsonb_build_object('outcome', v_outcome, 'payment_id', pay.id, 'installment_id', i.id, 'contract_id', i.contract_id);
end $$;

-- ---------- Estorno informado pelo provedor ----------
create or replace function public.wc_register_refund(p_provider text, p_external_payment_id text, p_refund_id text, p_amount_cents bigint, p_provider_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pay public.payments; r public.payments;
begin
  select * into pay from public.payments where provider = p_provider and external_payment_id = p_external_payment_id for update;
  if pay.id is null then return jsonb_build_object('outcome', 'refund_without_payment'); end if;
  if exists (select 1 from public.payments where provider = p_provider and external_payment_id = p_refund_id) then return jsonb_build_object('outcome', 'duplicate_event'); end if;
  insert into public.payments (installment_id, charge_id, provider, external_payment_id, reference, amount_cents, kind, status, paid_at, provider_event_id, note)
  values (pay.installment_id, pay.charge_id, p_provider, p_refund_id, pay.reference, -p_amount_cents, 'refund', 'reconciliation', now(), p_provider_event_id, 'Estorno de ' || pay.external_payment_id) returning * into r;
  insert into public.reconciliation_items (payment_id, installment_id, reason, note) values (r.id, pay.installment_id, 'refund', 'Estorno recebido do provedor; revisar baixa');
  if pay.installment_id is not null then
    update public.installments set in_review = true where id = pay.installment_id;
    insert into public.collection_cases (installment_id, contract_id, customer_id, reason, detail)
    select i.id, i.contract_id, c.customer_id, 'reconciliation', 'Estorno recebido' from public.installments i join public.contracts c on c.id = i.contract_id where i.id = pay.installment_id
    on conflict (installment_id, reason) where status <> 'resolved' do nothing;
  end if;
  return jsonb_build_object('outcome', 'refund_reconciliation', 'payment_id', r.id);
end $$;

-- ---------- Resolução de conciliação (admin, auditada) ----------
create or replace function public.wc_resolve_reconciliation(p_item_id uuid, p_action text, p_actor uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it public.reconciliation_items; pay public.payments; i public.installments; v_apply bigint;
begin
  perform set_config('wc.actor', p_actor::text, true);
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and active) then raise exception 'somente admin' using errcode = '42501'; end if;
  select * into it from public.reconciliation_items where id = p_item_id for update;
  if it.id is null or it.status = 'resolved' then raise exception 'item não encontrado ou já resolvido'; end if;
  select * into pay from public.payments where id = it.payment_id for update;

  if p_action = 'apply' then
    if pay.installment_id is null then raise exception 'pagamento sem parcela; use vincular'; end if;
    select * into i from public.installments where id = pay.installment_id for update;
    v_apply := least(pay.amount_cents - pay.applied_cents, i.amount_cents - i.paid_cents);
    if v_apply <= 0 then raise exception 'nada a aplicar'; end if;
    perform public.wc__credit_installment(i.id, v_apply, pay.paid_at);
    update public.payments set applied_cents = applied_cents + v_apply, status = 'applied', note = coalesce(p_note, note) where id = pay.id;
  elsif p_action = 'reject' then
    update public.payments set status = 'rejected', note = coalesce(p_note, note) where id = pay.id;
  elsif p_action = 'acknowledge' then
    update public.payments set note = coalesce(p_note, note) where id = pay.id;
  else
    raise exception 'ação inválida: %', p_action;
  end if;

  update public.reconciliation_items set status = 'resolved', resolution = p_action, resolved_by = p_actor, resolved_at = now(), note = coalesce(p_note, note) where id = it.id;
  update public.installments set in_review = false where id = pay.installment_id and not exists (select 1 from public.reconciliation_items r where r.installment_id = pay.installment_id and r.status = 'open');
  update public.collection_cases set status = 'resolved', resolution = 'Conciliação: ' || p_action, resolved_by = p_actor, resolved_at = now()
    where installment_id = pay.installment_id and reason = 'reconciliation' and status <> 'resolved'
    and not exists (select 1 from public.reconciliation_items r where r.installment_id = pay.installment_id and r.status = 'open');
  perform public.wc_audit('reconciliation.' || p_action, 'reconciliation_items', it.id::text, to_jsonb(it), jsonb_build_object('note', p_note, 'applied_cents', v_apply));
  return jsonb_build_object('outcome', p_action, 'applied_cents', v_apply);
end $$;

-- vincular pagamento sem vínculo a uma parcela (admin)
create or replace function public.wc_link_payment(p_item_id uuid, p_installment_id uuid, p_actor uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it public.reconciliation_items;
begin
  perform set_config('wc.actor', p_actor::text, true);
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and active) then raise exception 'somente admin' using errcode = '42501'; end if;
  select * into it from public.reconciliation_items where id = p_item_id for update;
  update public.payments set installment_id = p_installment_id where id = it.payment_id;
  update public.reconciliation_items set installment_id = p_installment_id where id = it.id;
  return public.wc_resolve_reconciliation(p_item_id, 'apply', p_actor, coalesce(p_note, 'Vinculado manualmente'));
end $$;

-- ---------- "Já paguei" (cliente autenticado) ----------
create or replace function public.wc_claim_payment(p_installment_id uuid, p_note text default null)
returns public.payment_claims language plpgsql security definer set search_path = public as $$
declare i public.installments; c public.contracts; cl public.payment_claims; v_hours int;
begin
  select i.* into i from public.installments i where i.id = p_installment_id for update;
  select * into c from public.contracts where id = i.contract_id;
  if c.id is null or c.customer_id is distinct from public.my_customer_id() then raise exception 'parcela não encontrada' using errcode = 'P0002'; end if;
  if i.status = 'paid' then raise exception 'parcela já consta como paga'; end if;
  if exists (select 1 from public.payment_claims where installment_id = i.id and status = 'open') then
    select * into cl from public.payment_claims where installment_id = i.id and status = 'open' limit 1; return cl;
  end if;
  select coalesce((value ->> 'review_pause_hours')::int, 48) into v_hours from public.settings where key = 'collection';
  insert into public.payment_claims (installment_id, customer_id, note) values (i.id, c.customer_id, p_note) returning * into cl;
  update public.installments set in_review = true, review_hold_until = now() + make_interval(hours => coalesce(v_hours, 48)) where id = i.id;
  insert into public.collection_cases (installment_id, contract_id, customer_id, reason, detail)
  values (i.id, c.id, c.customer_id, 'payment_review', 'Cliente informou pagamento; aguardando conferência')
  on conflict (installment_id, reason) where status <> 'resolved' do nothing;
  perform public.wc_audit('installment.claim_paid', 'installments', i.id::text, null, jsonb_build_object('claim_id', cl.id));
  return cl;
end $$;

create or replace function public.wc_review_claim(p_claim_id uuid, p_actor uuid, p_confirmed boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cl public.payment_claims;
begin
  perform set_config('wc.actor', p_actor::text, true);
  select * into cl from public.payment_claims where id = p_claim_id for update;
  if cl.id is null or cl.status <> 'open' then raise exception 'solicitação não encontrada'; end if;
  update public.payment_claims set status = case when p_confirmed then 'confirmed' else 'rejected' end::public.claim_status, reviewed_by = p_actor, reviewed_at = now() where id = cl.id;
  if not p_confirmed then
    update public.installments set in_review = false, review_hold_until = null where id = cl.installment_id;
    update public.collection_cases set status = 'resolved', resolution = coalesce(p_note, 'Conferência: pagamento não localizado'), resolved_by = p_actor, resolved_at = now()
      where installment_id = cl.installment_id and reason = 'payment_review' and status <> 'resolved';
  end if;
  perform public.wc_audit('claim.review', 'payment_claims', cl.id::text, to_jsonb(cl), jsonb_build_object('confirmed', p_confirmed, 'note', p_note));
end $$;

-- ---------- Régua: enfileirar lembretes e abrir casos ----------
create or replace function public.wc_enqueue_reminders() returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; st jsonb; v_today date := public.sp_today(); v_msgs int := 0; v_cases int := 0; v_n int;
  v_channel public.message_channel; v_start time; v_tpl text; v_case_days int;
begin
  select value into cfg from public.settings where key = 'collection';
  cfg := coalesce(cfg, '{}'::jsonb);
  v_channel := coalesce(cfg ->> 'channel', 'sms')::public.message_channel;
  v_start := coalesce(cfg ->> 'window_start', '08:00')::time;
  v_case_days := coalesce((cfg ->> 'case_after_days')::int, 10);
  v_tpl := coalesce(cfg ->> 'template', 'WorldCred: sua parcela {{n}} vence em {{due}}. Pague pelo portal: {{link}}');

  for st in select * from jsonb_array_elements(coalesce(cfg -> 'stages', '[{"code":"D0","offset_days":0},{"code":"D3","offset_days":3},{"code":"D7","offset_days":7}]'::jsonb)) loop
    insert into public.message_queue (installment_id, customer_id, stage, channel, recipient, body, scheduled_for)
    select i.id, c.customer_id, st ->> 'code', v_channel, coalesce(cu.phone, ''), v_tpl,
      greatest(now(), (v_today::timestamp + v_start) at time zone 'America/Sao_Paulo')
    from public.installments i
    join public.contracts c on c.id = i.contract_id and c.status = 'active'
    join public.customers cu on cu.id = c.customer_id
    where i.status in ('open','partial') and not i.in_review
      and v_today >= i.due_date + (st ->> 'offset_days')::int
      and v_today <= i.due_date + (st ->> 'offset_days')::int + 1
    on conflict (installment_id, stage, channel) do nothing;
    get diagnostics v_n = row_count; v_msgs := v_msgs + v_n;
  end loop;

  insert into public.collection_cases (installment_id, contract_id, customer_id, reason, detail)
  select i.id, c.id, c.customer_id, 'overdue', format('Parcela %s vencida há %s dias', i.number, v_today - i.due_date)
  from public.installments i join public.contracts c on c.id = i.contract_id and c.status = 'active'
  where i.status in ('open','partial') and not i.in_review and v_today >= i.due_date + v_case_days
  on conflict (installment_id, reason) where status <> 'resolved' do nothing;
  get diagnostics v_cases = row_count;

  -- expira a pausa de conferência vencida
  update public.installments set in_review = false, review_hold_until = null
  where in_review and review_hold_until is not null and review_hold_until < now()
    and not exists (select 1 from public.reconciliation_items r where r.installment_id = installments.id and r.status = 'open');

  return jsonb_build_object('messages_enqueued', v_msgs, 'cases_opened', v_cases, 'today', v_today);
end $$;

-- ---------- Casos: ações ----------
create or replace function public.wc_case_action(p_case_id uuid, p_action text, p_actor uuid, p_target uuid default null, p_note text default null, p_until timestamptz default null)
returns public.collection_cases language plpgsql security definer set search_path = public as $$
declare cs public.collection_cases; v_role public.user_role;
begin
  perform set_config('wc.actor', p_actor::text, true);
  select role into v_role from public.profiles where id = p_actor and active;
  select * into cs from public.collection_cases where id = p_case_id for update;
  if cs.id is null then raise exception 'caso não encontrado'; end if;
  if v_role is distinct from 'admin' and cs.assigned_to is distinct from p_actor and p_action <> 'take' then raise exception 'não autorizado' using errcode = '42501'; end if;
  if p_action = 'take' then
    update public.collection_cases set assigned_to = p_actor, status = 'assigned' where id = cs.id returning * into cs;
  elsif p_action = 'reassign' then
    if v_role is distinct from 'admin' then raise exception 'somente admin reatribui' using errcode = '42501'; end if;
    update public.collection_cases set assigned_to = p_target, status = 'assigned' where id = cs.id returning * into cs;
  elsif p_action = 'pause' then
    update public.collection_cases set status = 'paused', paused_until = coalesce(p_until, now() + interval '48 hours'), pause_reason = p_note where id = cs.id returning * into cs;
    update public.installments set in_review = true, review_hold_until = cs.paused_until where id = cs.installment_id;
  elsif p_action = 'resume' then
    update public.collection_cases set status = case when assigned_to is null then 'open' else 'assigned' end::public.case_status, paused_until = null where id = cs.id returning * into cs;
    update public.installments set in_review = false, review_hold_until = null where id = cs.installment_id;
  elsif p_action = 'resolve' then
    update public.collection_cases set status = 'resolved', resolution = p_note, resolved_by = p_actor, resolved_at = now() where id = cs.id returning * into cs;
    update public.installments set in_review = false, review_hold_until = null where id = cs.installment_id
      and not exists (select 1 from public.collection_cases c2 where c2.installment_id = cs.installment_id and c2.status = 'paused');
  else
    raise exception 'ação inválida';
  end if;
  return cs;
end $$;

-- ---------- Painel ----------
create or replace function public.wc_dashboard(p_from date, p_to date, p_product uuid default null, p_agent uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_today date := public.sp_today(); r jsonb;
begin
  with ctr as (
    select c.* from public.contracts c join public.product_versions pv on pv.id = c.product_version_id
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

-- ---------- Desativar agente: revoga acesso, preserva autoria ----------
create or replace function public.wc_set_agent_active(p_agent uuid, p_active boolean, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('wc.actor', p_actor::text, true);
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and active) then raise exception 'somente admin' using errcode = '42501'; end if;
  update public.profiles set active = p_active where id = p_agent and role = 'agent';
  if not p_active then
    update public.collection_cases set assigned_to = null, status = 'open' where assigned_to = p_agent and status in ('assigned');
  end if;
end $$;

-- ---------- Permissões de execução ----------
revoke all on function public.wc_apply_payment(text,text,text,bigint,timestamptz,uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.wc_register_refund(text,text,text,bigint,uuid) from public, anon, authenticated;
revoke all on function public.wc_confirm_disbursement(uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.wc_approve_proposal(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.wc_decline_proposal(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.wc_resolve_reconciliation(uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function public.wc_link_payment(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.wc_review_claim(uuid,uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.wc_enqueue_reminders() from public, anon, authenticated;
revoke all on function public.wc_case_action(uuid,text,uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.wc_dashboard(date,date,uuid,uuid) from public, anon, authenticated;
revoke all on function public.wc_set_agent_active(uuid,boolean,uuid) from public, anon, authenticated;
revoke all on function public.wc__credit_installment(uuid,bigint,timestamptz) from public, anon, authenticated;
revoke all on function public.wc_audit(text,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
-- chamadas pelo cliente autenticado:
grant execute on function public.wc_find_or_link_customer(text,text,text,text,text,uuid) to authenticated;
grant execute on function public.wc_accept_proposal(uuid,jsonb) to authenticated;
grant execute on function public.wc_claim_payment(uuid,text) to authenticated;
