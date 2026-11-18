-- Endurecimento conforme Supabase Security Advisor
-- 1) funções auxiliares security definer não devem ser chamáveis via API pelo anon (e, quando internas, nem por authenticated)
revoke execute on function public.admin_write_ok() from public, anon, authenticated;
revoke execute on function public.agent_has_customer(uuid) from public, anon, authenticated;
revoke execute on function public.current_wc_role() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.is_agent() from public, anon, authenticated;
revoke execute on function public.mfa_enforced() from public, anon, authenticated;
revoke execute on function public.my_customer_id() from public, anon, authenticated;
revoke execute on function public.wc_audit_trigger() from public, anon, authenticated;
revoke execute on function public.is_aal2() from public, anon;
-- RPCs legítimas do cliente autenticado: bloquear apenas anon
revoke execute on function public.wc_accept_proposal(uuid, jsonb) from public, anon;
revoke execute on function public.wc_claim_payment(uuid, text) from public, anon;
revoke execute on function public.wc_find_or_link_customer(text, text, text, text, text, uuid) from public, anon;

-- 2) search_path fixo nas funções utilitárias
alter function public.is_aal2() set search_path = public;
alter function public.wc_actor() set search_path = public;
alter function public.sp_today() set search_path = public;
alter function public.mask_cpf(text) set search_path = public;
alter function public.mask_pix_key(text) set search_path = public;
alter function public.set_updated_at() set search_path = public;
