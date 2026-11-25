-- Régua por WhatsApp com QR Code do Pix: D-1, D0, D+2. Baixa manual auditada no admin.

-- 1) Fila de mensagens: anexos (QR) e conteúdo enviado
alter table public.message_queue
  add column if not exists media_kind text,          -- 'pix_qr' quando a mensagem leva o QR
  add column if not exists payload jsonb,            -- referência da cobrança, valor, vencimento (sem dados sensíveis)
  add column if not exists sent_body text;           -- texto efetivamente enviado (auditoria)

-- Etapas podem ser negativas (antes do vencimento); o code vira 'D-1'
comment on column public.message_queue.stage is 'Etapa da régua: D-1 (véspera), D0 (vencimento), D2 (2 dias após)...';

-- 2) Régua padrão: aviso na véspera, no dia e 2 dias depois; caso em D+10
update public.settings
set value = value
  || jsonb_build_object('stages', '[{"code":"D-1","offset_days":-1},{"code":"D0","offset_days":0},{"code":"D2","offset_days":2}]'::jsonb)
  || jsonb_build_object('channel', 'whatsapp')
  || jsonb_build_object('fallback_sms', true)
  || jsonb_build_object('confirm_on_payment', true)
where key = 'collection';

-- 3) Enfileiramento: aceita deslocamento negativo e grava o alvo do dia
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
  v_tpl := coalesce(cfg ->> 'template', 'WorldCred: parcela {{n}} de {{total}} vence em {{due}}.');

  for st in select * from jsonb_array_elements(coalesce(cfg -> 'stages', '[{"code":"D-1","offset_days":-1},{"code":"D0","offset_days":0},{"code":"D2","offset_days":2}]'::jsonb)) loop
    insert into public.message_queue (installment_id, customer_id, stage, channel, recipient, body, scheduled_for, media_kind, payload)
    select i.id, c.customer_id, st ->> 'code', v_channel, coalesce(cu.phone, ''), v_tpl,
      greatest(now(), (v_today::timestamp + v_start) at time zone 'America/Sao_Paulo'),
      'pix_qr', jsonb_build_object('due_date', i.due_date, 'number', i.number, 'offset_days', (st ->> 'offset_days')::int)
    from public.installments i
    join public.contracts c on c.id = i.contract_id and c.status = 'active'
    join public.customers cu on cu.id = c.customer_id
    where i.status in ('open','partial') and not i.in_review
      and v_today = i.due_date + (st ->> 'offset_days')::int
    on conflict (installment_id, stage, channel) do nothing;
    get diagnostics v_n = row_count; v_msgs := v_msgs + v_n;
  end loop;

  insert into public.collection_cases (installment_id, contract_id, customer_id, reason, detail)
  select i.id, c.id, c.customer_id, 'overdue', format('Parcela %s vencida há %s dias', i.number, v_today - i.due_date)
  from public.installments i join public.contracts c on c.id = i.contract_id and c.status = 'active'
  where i.status in ('open','partial') and not i.in_review and v_today >= i.due_date + v_case_days
  on conflict (installment_id, reason) where status <> 'resolved' do nothing;
  get diagnostics v_cases = row_count;

  update public.installments set in_review = false, review_hold_until = null
  where in_review and review_hold_until is not null and review_hold_until < now()
    and not exists (select 1 from public.reconciliation_items r where r.installment_id = installments.id and r.status = 'open');

  return jsonb_build_object('messages_enqueued', v_msgs, 'cases_opened', v_cases, 'today', v_today);
end $$;
revoke all on function public.wc_enqueue_reminders() from public, anon, authenticated;

-- 4) Confirmação de pagamento: enfileira mensagem quando a parcela é quitada
create or replace function public.wc_queue_payment_confirmation(p_installment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i public.installments; c public.contracts; cu public.customers; cfg jsonb; v_channel public.message_channel;
begin
  select value into cfg from public.settings where key = 'collection';
  if coalesce((cfg ->> 'confirm_on_payment')::boolean, true) is not true then return; end if;
  select * into i from public.installments where id = p_installment;
  if i.id is null or i.status <> 'paid' then return; end if;
  select * into c from public.contracts where id = i.contract_id;
  select * into cu from public.customers where id = c.customer_id;
  v_channel := coalesce(cfg ->> 'channel', 'sms')::public.message_channel;
  insert into public.message_queue (installment_id, customer_id, stage, channel, recipient, body, scheduled_for, media_kind, payload)
  values (i.id, c.customer_id, 'PAGO', v_channel, coalesce(cu.phone, ''), 'confirmação de pagamento', now(), null,
          jsonb_build_object('number', i.number, 'amount_cents', i.amount_cents))
  on conflict (installment_id, stage, channel) do nothing;
end $$;
revoke all on function public.wc_queue_payment_confirmation(uuid) from public, anon, authenticated;

-- 5) Baixa: ao quitar, cancela lembretes e enfileira a confirmação
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
    perform public.wc_queue_payment_confirmation(i.id);
    select count(*) into v_open from public.installments where contract_id = i.contract_id and status in ('open','partial');
    if v_open = 0 then update public.contracts set status = 'settled', settled_at = p_paid_at where id = i.contract_id and status = 'active'; end if;
  else
    update public.installments set paid_cents = paid_cents + p_amount, status = 'partial', in_review = false, review_hold_until = null where id = i.id returning * into i;
    update public.pix_charges set status = 'superseded' where installment_id = i.id and status = 'active';
  end if;
  return i;
end $$;
revoke all on function public.wc__credit_installment(uuid,bigint,timestamptz) from public, anon, authenticated;

-- 6) Baixa manual pelo admin (pagamento fora do fluxo automático), auditada
create or replace function public.wc_manual_settle(p_installment uuid, p_amount_cents bigint, p_actor uuid, p_note text, p_paid_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public as $$
declare i public.installments; pay public.payments; v_remaining bigint; v_ref text;
begin
  perform set_config('wc.actor', p_actor::text, true);
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and active) then raise exception 'somente admin' using errcode = '42501'; end if;
  select * into i from public.installments where id = p_installment for update;
  if i.id is null then raise exception 'parcela não encontrada'; end if;
  if i.status = 'paid' then return jsonb_build_object('outcome', 'already_paid'); end if;
  v_remaining := i.amount_cents - i.paid_cents;
  if p_amount_cents <= 0 or p_amount_cents > v_remaining then raise exception 'valor inválido (saldo: % centavos)', v_remaining; end if;
  v_ref := 'MANUAL-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || left(p_installment::text, 8);
  insert into public.payments (installment_id, provider, external_payment_id, reference, amount_cents, applied_cents, kind, status, paid_at, note, created_by)
  values (i.id, 'manual', v_ref, v_ref, p_amount_cents, p_amount_cents, 'manual', 'applied', p_paid_at, p_note, p_actor) returning * into pay;
  perform public.wc__credit_installment(i.id, p_amount_cents, p_paid_at);
  perform public.wc_audit('payment.manual_settle', 'payments', pay.id::text, null, jsonb_build_object('installment_id', i.id, 'amount_cents', p_amount_cents, 'note', p_note));
  return jsonb_build_object('outcome', 'settled', 'payment_id', pay.id, 'remaining_cents', v_remaining - p_amount_cents);
end $$;
revoke all on function public.wc_manual_settle(uuid,bigint,uuid,text,timestamptz) from public, anon, authenticated;

-- 7) Configuração do WhatsApp (provedor é lido do ambiente; aqui ficam só preferências)
insert into public.settings (key, value) values
 ('whatsapp', '{"authorized": true, "send_qr_image": true, "send_copy_paste": true, "daily_cap": 300}')
on conflict (key) do nothing;
