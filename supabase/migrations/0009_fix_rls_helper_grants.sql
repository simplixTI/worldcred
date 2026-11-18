-- As políticas RLS executam estas funções com os privilégios do usuário logado;
-- 0005 revogou EXECUTE de authenticated e quebrou o acesso ("permission denied for function").
-- Mantém revogado para anon (não deve chamar via API) e restaura para authenticated.
grant execute on function public.admin_write_ok() to authenticated;
grant execute on function public.agent_has_customer(uuid) to authenticated;
grant execute on function public.current_wc_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_agent() to authenticated;
grant execute on function public.mfa_enforced() to authenticated;
grant execute on function public.my_customer_id() to authenticated;
grant execute on function public.is_aal2() to authenticated;
