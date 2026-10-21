-- Roda por último. Regressão do endurecimento de funções (migration 0004).
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; end $$;

reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
update public.subscriptions set trial_ends_at = now() + interval '5 days'
  where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') and status = 'trialing';

-- anônimo não executa
set role anon;
do $$ begin
  begin perform * from public.current_entitlements('22222222-2222-2222-2222-222222222222'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;

-- usuário A não lê direitos de B, mas lê os próprios (sem argumento e com o próprio id)
reset role; set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set request.jwt.claim.role = 'authenticated';
do $$ begin
  begin perform * from public.current_entitlements('22222222-2222-2222-2222-222222222222'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;
select pg_temp.assert((select count(*) from public.current_entitlements()) = 1, 'A lê os próprios direitos (padrão)');
select pg_temp.assert((select count(*) from public.current_entitlements('11111111-1111-1111-1111-111111111111')) = 1, 'A lê os próprios direitos (id explícito)');

-- funções de gatilho não são chamáveis por RPC
do $$ begin
  begin perform public.enforce_plan_limit(); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;

-- limites de plano continuam funcionando via gatilho após a revogação (A: trial com 1 impressora já cadastrada)
do $$ begin
  begin insert into public.printers (name) values ('outra'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;

-- service_role (ex.: webhooks) consulta qualquer usuário
reset role; set role service_role; reset request.jwt.claim.sub; set request.jwt.claim.role = 'service_role';
select pg_temp.assert((select count(*) from public.current_entitlements('22222222-2222-2222-2222-222222222222')) = 1, 'service_role consulta qualquer usuário');

-- superadmin consulta qualquer usuário
reset role; update public.profiles set role = 'superadmin' where id = '22222222-2222-2222-2222-222222222222';
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; set request.jwt.claim.role = 'authenticated';
select pg_temp.assert((select count(*) from public.current_entitlements('11111111-1111-1111-1111-111111111111')) = 1, 'superadmin consulta qualquer usuário');
reset role;
\echo 'RLS etapa 0 OK'
