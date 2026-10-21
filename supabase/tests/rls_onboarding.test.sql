-- Roda por último. Configuração inicial guiada (migration 0007).
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; end $$;

reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
select pg_temp.assert(not exists (select 1 from public.profiles where onboarding_done_at is null), 'usuários antigos não voltam ao assistente');

-- usuário novo: perfil criado pelo gatilho, assistente pendente
insert into auth.users (id) values ('33333333-3333-3333-3333-333333333333');
select pg_temp.assert((select onboarding_done_at is null from public.profiles where id = '33333333-3333-3333-3333-333333333333'), 'novo usuário começa com o assistente pendente');

set role authenticated; set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333'; set request.jwt.claim.role = 'authenticated';
update public.profiles set onboarding_done_at = now(), business_name = 'Oficina Nova' where id = auth.uid();
select pg_temp.assert((select onboarding_done_at is not null and business_name = 'Oficina Nova' from public.profiles where id = auth.uid()), 'o usuário conclui o próprio assistente');

-- não mexe no assistente de outro usuário
update public.profiles set onboarding_done_at = null where id = '11111111-1111-1111-1111-111111111111';
reset role;
select pg_temp.assert((select onboarding_done_at is not null from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'usuário não altera o perfil de outro');

-- e continua sem poder virar superadmin
set role authenticated; set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$ begin
  begin update public.profiles set role = 'superadmin' where id = auth.uid(); raise exception 'deveria ter falhado';
  exception when others then if sqlerrm like 'deveria%' then raise; end if; end;
end $$;
reset role;
\echo 'RLS onboarding OK'
