-- Nome público (primeiro nome) do agente a partir do slug de indicação, para a landing
create or replace function public.wc_public_agent_name(p_slug text) returns text
language sql stable security definer set search_path = public as $$
  select split_part(full_name, ' ', 1) from public.profiles where referral_slug = lower(p_slug) and role = 'agent' and active
$$;
grant execute on function public.wc_public_agent_name(text) to anon, authenticated;
