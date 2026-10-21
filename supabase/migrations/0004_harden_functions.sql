-- PrintUp · Etapa 0: endurecimento de funções.
--
-- Problema: `current_entitlements(p_user)` é SECURITY DEFINER e aceitava qualquer id. Com os privilégios
-- padrão do Supabase (EXECUTE para anon/authenticated), qualquer pessoa que conhecesse o UUID de um usuário
-- (inclusive sem login) lia plano, status e limites dele via RPC.

-- 1) A função só responde sobre o próprio chamador; superadmin e service_role podem consultar qualquer um.
create or replace function public.current_entitlements(p_user uuid default auth.uid())
returns table (plan_code text, status public.subscription_status, limits jsonb, features jsonb, active boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_user is distinct from auth.uid()
     and coalesce(auth.role(), 'service_role') <> 'service_role'
     and not public.is_superadmin() then
    raise exception 'Permissão negada' using errcode = '42501';
  end if;

  return query
    select p.code, s.status, p.limits, p.features,
      (s.status in ('active', 'past_due')
        or (s.status = 'trialing' and coalesce(s.trial_ends_at, now()) > now())) as active
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.user_id = p_user and s.status in ('trialing', 'active', 'past_due')
    order by s.created_at desc
    limit 1;
end $$;

-- 2) Visitantes sem login não executam nada daqui. (Os grants padrão do Supabase dão EXECUTE a `anon`
--    explicitamente, então revogar de PUBLIC não basta.)
revoke execute on function public.current_entitlements(uuid) from public, anon;
revoke execute on function public.is_superadmin() from public, anon;

-- 3) Funções de gatilho não devem ser chamáveis por RPC por ninguém além do dono/serviço.
--    (Gatilhos continuam disparando normalmente: o privilégio só é checado na criação do gatilho.)
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.protect_profile_role() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_operation() from public, anon, authenticated;
revoke execute on function public.log_operation_slim() from public, anon, authenticated;
revoke execute on function public.enforce_plan_limit() from public, anon, authenticated;
