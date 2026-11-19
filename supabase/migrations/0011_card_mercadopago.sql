-- Crédito via cartão (checkout hospedado Mercado Pago): campos de ciclo de vida e função idempotente de confirmação
alter table public.card_operations
  add column if not exists monthly_rate numeric(12,8),
  add column if not exists schedule jsonb,
  add column if not exists provider_preference_id text,
  add column if not exists provider_payment_id text unique,
  add column if not exists checkout_url text,
  add column if not exists paid_at timestamptz,
  add column if not exists release_at timestamptz,
  add column if not exists pix_key text,
  add column if not exists disbursed_at timestamptz,
  add column if not exists provider_tx_id text,
  add column if not exists authorized_by uuid references public.profiles(id),
  add column if not exists raw jsonb;

-- Registro idempotente do resultado do pagamento no cartão (chamado pelo webhook com a chave de serviço)
create or replace function public.wc_card_payment_result(
  p_operation uuid, p_payment_id text, p_status text, p_amount_cents bigint, p_installments int, p_paid_at timestamptz, p_release_at timestamptz, p_raw jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare op public.card_operations;
begin
  select * into op from public.card_operations where id = p_operation for update;
  if op.id is null then return jsonb_build_object('outcome', 'unknown_operation'); end if;
  if op.status in ('disbursed') then return jsonb_build_object('outcome', 'already_final', 'status', op.status); end if;
  if p_status = 'approved' then
    if op.provider_payment_id is not null and op.provider_payment_id <> p_payment_id then
      return jsonb_build_object('outcome', 'duplicate_payment_other_id', 'existing', op.provider_payment_id);
    end if;
    if p_amount_cents <> op.gross_cents then
      update public.card_operations set authorization_status = 'amount_mismatch', raw = p_raw where id = op.id;
      return jsonb_build_object('outcome', 'amount_mismatch', 'expected', op.gross_cents, 'received', p_amount_cents);
    end if;
    update public.card_operations set status = case when p_release_at is not null and p_release_at <= now() then 'settled' else 'authorized' end::public.card_op_status,
      authorization_status = 'approved', settlement_status = case when p_release_at is not null and p_release_at <= now() then 'released' else 'pending_release' end,
      provider_payment_id = p_payment_id, installments = coalesce(p_installments, installments), paid_at = p_paid_at, release_at = p_release_at, raw = p_raw
    where id = op.id;
    perform public.wc_audit('card.approved', 'card_operations', op.id::text, jsonb_build_object('status', op.status), jsonb_build_object('payment_id', p_payment_id, 'amount_cents', p_amount_cents));
    return jsonb_build_object('outcome', 'approved');
  elsif p_status in ('rejected', 'cancelled') then
    if op.status = 'draft' then update public.card_operations set authorization_status = p_status, raw = p_raw where id = op.id; end if;
    return jsonb_build_object('outcome', p_status);
  elsif p_status in ('refunded', 'charged_back') then
    update public.card_operations set status = 'disputed', dispute_status = p_status, raw = p_raw where id = op.id;
    perform public.wc_audit('card.dispute', 'card_operations', op.id::text, null, jsonb_build_object('payment_id', p_payment_id, 'status', p_status));
    return jsonb_build_object('outcome', 'disputed');
  else
    update public.card_operations set authorization_status = p_status where id = op.id and status = 'draft';
    return jsonb_build_object('outcome', 'pending', 'status', p_status);
  end if;
end $$;
revoke all on function public.wc_card_payment_result(uuid,text,text,bigint,int,timestamptz,timestamptz,jsonb) from public, anon, authenticated;

-- Liberação do Pix da operação de cartão: marca como desembolsada (idempotente por referência)
create or replace function public.wc_card_mark_disbursed(p_operation uuid, p_reference text, p_tx_id text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare op public.card_operations;
begin
  perform set_config('wc.actor', p_actor::text, true);
  select * into op from public.card_operations where id = p_operation for update;
  if op.status = 'disbursed' then return jsonb_build_object('outcome', 'already'); end if;
  update public.card_operations set status = 'disbursed', disbursement_status = 'confirmed', disbursement_reference = coalesce(disbursement_reference, p_reference), provider_tx_id = p_tx_id, disbursed_at = now(), authorized_by = p_actor where id = op.id;
  perform public.wc_audit('card.disbursed', 'card_operations', op.id::text, jsonb_build_object('status', op.status), jsonb_build_object('reference', p_reference, 'tx', p_tx_id));
  return jsonb_build_object('outcome', 'disbursed');
end $$;
revoke all on function public.wc_card_mark_disbursed(uuid,text,text,uuid) from public, anon, authenticated;
