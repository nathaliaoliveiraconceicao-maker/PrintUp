-- Roda depois da migration 0016. Bloqueio de conta: só superadmin, nunca a si mesma nem outro superadmin, auditado.
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; end $$;
create or replace function pg_temp.denied(q text, st text default '42501', msg text default null) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if sqlstate <> st then raise exception 'FALHOU: [%] esperado %, veio % (%)', q, st, sqlstate, sqlerrm; end if;
    if msg is not null and sqlerrm not like msg then raise exception 'FALHOU: [%] mensagem "%" (esperado "%")', q, sqlerrm, msg; end if;
    return;
  end;
  raise exception 'FALHOU: deveria ter sido negado: %', q;
end $$;

\set ASADM 'set role authenticated; set request.jwt.claim.sub = ''b1000000-0000-0000-0000-000000000001''; set request.jwt.claim.role = ''authenticated'';'
\set ASU1 'set role authenticated; set request.jwt.claim.sub = ''b1000000-0000-0000-0000-000000000002''; set request.jwt.claim.role = ''authenticated'';'
\set ASSU 'reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;'
:ASSU
insert into auth.users (id, email) values ('b1000000-0000-0000-0000-000000000001', 'dona-bloq@printup.test'), ('b1000000-0000-0000-0000-000000000002', 'cli-bloq@exemplo.com'), ('b1000000-0000-0000-0000-000000000003', 'outro-adm@printup.test');
select public.grant_superadmin('dona-bloq@printup.test');
select public.grant_superadmin('outro-adm@printup.test');

-- cliente não bloqueia ninguém nem se libera
:ASU1
select pg_temp.denied($$select public.admin_set_user_blocked('b1000000-0000-0000-0000-000000000002', true, 'teste')$$, '42501', 'Acesso restrito');
select pg_temp.denied($$update public.profiles set blocked_at = now() where id = auth.uid()$$, '42501', 'Alteração de bloqueio não permitida');

-- superadmin bloqueia e libera
:ASADM
select pg_temp.denied($$select public.admin_set_user_blocked('b1000000-0000-0000-0000-000000000001', true, 'eu mesma')$$, 'P0001', 'Você não pode bloquear a si mesma');
select pg_temp.denied($$select public.admin_set_user_blocked('b1000000-0000-0000-0000-000000000003', true, 'outro adm')$$, 'P0001', 'Não é possível bloquear um superadmin');
select pg_temp.denied($$select public.admin_set_user_blocked('b1000000-0000-0000-0000-000000000002', true, '')$$, 'P0001', 'Informe o motivo');
select public.admin_set_user_blocked('b1000000-0000-0000-0000-000000000002', true, 'fraude confirmada');
select pg_temp.assert((select (public.admin_user_block_state('b1000000-0000-0000-0000-000000000002') ->> 'motivo') = 'fraude confirmada'), 'estado de bloqueio visível ao superadmin');
:ASU1
select pg_temp.assert((select blocked_at is not null from public.profiles where id = auth.uid()), 'cliente vê que está bloqueado (para mostrar o aviso)');
select pg_temp.denied($$update public.profiles set blocked_at = null where id = auth.uid()$$, '42501', 'Alteração de bloqueio não permitida');
:ASADM
select public.admin_set_user_blocked('b1000000-0000-0000-0000-000000000002', false, 'regularizado');
:ASU1
select pg_temp.assert((select blocked_at is null and blocked_reason is null from public.profiles where id = auth.uid()), 'liberada');
:ASSU
select pg_temp.assert((select count(*) from public.admin_audit_log where action in ('usuario.bloqueado', 'usuario.liberado')) = 2, 'bloqueio e liberação auditados');
select 'RLS bloqueio de usuário OK' as resultado;
