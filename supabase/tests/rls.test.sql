-- Execução: psql -v ON_ERROR_STOP=1 -f 00_supabase_stub.sql -f ../migrations/0001_core.sql -f rls.test.sql
grant all on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; end $$;

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');

-- criação automática de perfil e assinatura em teste
select pg_temp.assert((select count(*) from public.profiles) = 2, 'perfis criados');
select pg_temp.assert((select count(*) from public.subscriptions where status = 'trialing') = 2, 'trial criado');

-- usuário A cria impressora
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set request.jwt.claim.role = 'authenticated';
insert into public.printers (name) values ('A1 mini');
select pg_temp.assert((select count(*) from public.printers) = 1, 'A vê sua impressora');

-- limite do trial (1 impressora) bloqueado no banco
do $$ begin
  begin insert into public.printers (name) values ('segunda'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;

-- A não consegue inserir em nome de B
do $$ begin
  begin insert into public.filaments (user_id, name, price_per_kg) values ('22222222-2222-2222-2222-222222222222','x',100);
    raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;

-- A não se promove a superadmin
do $$ begin
  begin update public.profiles set role = 'superadmin' where id = auth.uid(); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;

-- A não se concede plano melhor nem altera assinatura
update public.subscriptions set status = 'active';  -- RLS: 0 linhas afetadas
select pg_temp.assert((select status from public.subscriptions limit 1) = 'trialing', 'assinatura intacta');

-- A não lê billing_events
reset role; insert into public.billing_events (gateway, event_id, event_type, payload) values ('x','1','t','{}');
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.assert((select count(*) from public.billing_events) = 0, 'cliente não lê billing_events');
-- (sem policy + sem grant explícito para anon; no Supabase real revogue grants padrão)

-- usuário B não vê nada de A
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.assert((select count(*) from public.printers) = 0, 'B não vê impressoras de A');
select pg_temp.assert((select count(*) from public.audit_log) = 0, 'B não vê auditoria de A');
update public.printers set name = 'hack'; delete from public.printers;
reset role;
select pg_temp.assert((select name from public.printers) = 'A1 mini', 'dados de A intactos');
select pg_temp.assert((select count(*) from public.audit_log where entity = 'printers') = 1, 'auditoria gravada');

-- plano expirado bloqueia criação
update public.subscriptions set trial_ends_at = now() - interval '1 day' where user_id = '22222222-2222-2222-2222-222222222222';
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  begin insert into public.filaments (name, price_per_kg) values ('PLA', 100); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
reset role;
\echo 'RLS OK'
