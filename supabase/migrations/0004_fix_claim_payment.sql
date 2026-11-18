-- Corrige ambiguidade entre variável e alias em wc_claim_payment
create or replace function public.wc_claim_payment(p_installment_id uuid, p_note text default null)
returns public.payment_claims language plpgsql security definer set search_path = public as $$
declare v_inst public.installments; v_c public.contracts; cl public.payment_claims; v_hours int;
begin
  select * into v_inst from public.installments where id = p_installment_id for update;
  select * into v_c from public.contracts where id = v_inst.contract_id;
  if v_c.id is null or v_c.customer_id is distinct from public.my_customer_id() then raise exception 'parcela não encontrada' using errcode = 'P0002'; end if;
  if v_inst.status = 'paid' then raise exception 'parcela já consta como paga'; end if;
  if exists (select 1 from public.payment_claims where installment_id = v_inst.id and status = 'open') then
    select * into cl from public.payment_claims where installment_id = v_inst.id and status = 'open' limit 1; return cl;
  end if;
  select coalesce((value ->> 'review_pause_hours')::int, 48) into v_hours from public.settings where key = 'collection';
  insert into public.payment_claims (installment_id, customer_id, note) values (v_inst.id, v_c.customer_id, p_note) returning * into cl;
  update public.installments set in_review = true, review_hold_until = now() + make_interval(hours => coalesce(v_hours, 48)) where id = v_inst.id;
  insert into public.collection_cases (installment_id, contract_id, customer_id, reason, detail)
  values (v_inst.id, v_c.id, v_c.customer_id, 'payment_review', 'Cliente informou pagamento; aguardando conferência')
  on conflict (installment_id, reason) where status <> 'resolved' do nothing;
  perform public.wc_audit('installment.claim_paid', 'installments', v_inst.id::text, null, jsonb_build_object('claim_id', cl.id));
  return cl;
end $$;
grant execute on function public.wc_claim_payment(uuid,text) to authenticated;
