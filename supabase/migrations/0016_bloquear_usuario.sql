-- Superadmin pode bloquear e liberar uma conta (ex.: fraude, inadimplência). Os dados do cliente ficam guardados.
-- Só a função administrativa muda o bloqueio: nem o próprio cliente consegue se liberar.
alter table public.profiles
  add column blocked_at timestamptz,
  add column blocked_reason text check (blocked_reason is null or char_length(blocked_reason) <= 200);

create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'Alteração de papel não permitida' using errcode = '42501';
  end if;
  if (new.blocked_at is distinct from old.blocked_at or new.blocked_reason is distinct from old.blocked_reason)
     and coalesce(auth.role(), 'service_role') <> 'service_role'
     and coalesce(current_setting('printup.admin_block', true), '') <> 'on' then
    raise exception 'Alteração de bloqueio não permitida' using errcode = '42501';
  end if;
  return new;
end $$;

create function public.admin_set_user_blocked(p_user uuid, p_blocked boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare t public.profiles;
begin
  perform public.assert_superadmin();
  if p_user = auth.uid() then raise exception 'Você não pode bloquear a si mesma' using errcode = 'P0001'; end if;
  select * into t from public.profiles where id = p_user;
  if t.id is null then raise exception 'Usuário não encontrado' using errcode = 'P0001'; end if;
  if t.role = 'superadmin' then raise exception 'Não é possível bloquear um superadmin' using errcode = 'P0001'; end if;
  if p_blocked and char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Informe o motivo' using errcode = 'P0001'; end if;
  perform set_config('printup.admin_block', 'on', true);
  if p_blocked then
    update public.profiles set blocked_at = coalesce(blocked_at, now()), blocked_reason = left(trim(p_reason), 200) where id = p_user;
    -- encerra as sessões abertas (no Supabase real; o ambiente de teste não tem essa tabela)
    if to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions where user_id = $1' using p_user; end if;
    perform public.admin_log('usuario.bloqueado', 'profiles', p_user::text, jsonb_build_object('motivo', left(trim(p_reason), 200)));
  else
    update public.profiles set blocked_at = null, blocked_reason = null where id = p_user;
    perform public.admin_log('usuario.liberado', 'profiles', p_user::text, jsonb_build_object('motivo', left(trim(coalesce(p_reason, '')), 200)));
  end if;
  perform set_config('printup.admin_block', 'off', true);
end $$;

create function public.admin_user_block_state(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_superadmin();
  return (select jsonb_build_object('bloqueada_em', blocked_at, 'motivo', blocked_reason) from public.profiles where id = p_user);
end $$;

revoke execute on function public.admin_set_user_blocked(uuid, boolean, text), public.admin_user_block_state(uuid) from public, anon;
grant execute on function public.admin_set_user_blocked(uuid, boolean, text), public.admin_user_block_state(uuid) to authenticated;
