-- Roda depois de 0002. Estado herdado de rls.test.sql: A tem trial ativo e 1 impressora; B está com trial expirado.
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; end $$;

grant all on all tables in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated;

-- B volta a ter assinatura válida
update public.subscriptions set trial_ends_at = now() + interval '5 days' where user_id = '22222222-2222-2222-2222-222222222222';

-- A cria produto e precificação
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set request.jwt.claim.role = 'authenticated';
insert into public.products (id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Suporte de celular');
insert into public.pricings (id, product_id, printer_id, quantity, pricing_mode, unit_cost, unit_price, unit_profit, margin_percent, markup_percent, input, result, printer_name)
  select 'bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', p.id, 1, 'margin', 10, 20, 5, 25, 50, '{"big":1}', '{"big":2}', p.name from public.printers p limit 1;
select pg_temp.assert((select count(*) from public.pricings) = 1, 'A vê sua precificação');
select pg_temp.assert((select unit_price from public.latest_pricings) = 20, 'view latest_pricings funciona');

-- snapshot é imutável para o cliente
update public.pricings set unit_price = 1;
select pg_temp.assert((select unit_price from public.pricings) = 20, 'UPDATE em pricings não altera nada');

-- B não vê nada de A, nem pela view
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.assert((select count(*) from public.products) = 0, 'B não vê produtos de A');
select pg_temp.assert((select count(*) from public.pricings) = 0, 'B não vê precificações de A');
select pg_temp.assert((select count(*) from public.latest_pricings) = 0, 'B não vê a view de A');

-- B não consegue precificar o produto de A
do $$ begin
  begin
    insert into public.pricings (product_id, quantity, pricing_mode, unit_cost, unit_price, unit_profit, margin_percent, markup_percent, input, result)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 1, 'margin', 1, 2, 1, 50, 100, '{}', '{}');
    raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;

-- B não consegue apontar uma precificação própria para a impressora de A
insert into public.products (id, name) values ('aaaaaaaa-0000-0000-0000-000000000002', 'Produto de B');
do $$ declare v_printer uuid; begin
  reset role; select id into v_printer from public.printers limit 1;
  set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  begin
    insert into public.pricings (product_id, printer_id, quantity, pricing_mode, unit_cost, unit_price, unit_profit, margin_percent, markup_percent, input, result)
    values ('aaaaaaaa-0000-0000-0000-000000000002', v_printer, 1, 'margin', 1, 2, 1, 50, 100, '{}', '{}');
    raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;

-- B não apaga nada de A
delete from public.pricings; delete from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000001';
reset role;
select pg_temp.assert((select count(*) from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 1, 'produto de A intacto');

-- auditoria enxuta: sem input/result
select pg_temp.assert((select count(*) from public.audit_log where entity = 'pricings' and changes ? 'input') = 0, 'auditoria de pricings sem JSONs grandes');
select pg_temp.assert((select count(*) from public.audit_log where entity = 'pricings' and action = 'insert') = 1, 'auditoria de pricings registrada');

-- limite de produtos do trial (10): A já tem 1, cria mais 9 e o 11º falha
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.products (name) select 'p' || g from generate_series(1, 9) g;
do $$ begin
  begin insert into public.products (name) values ('11o'); raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;

-- excluir produto leva as precificações junto
delete from public.products where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.assert((select count(*) from public.pricings) = 0, 'cascade apaga precificações do produto');

-- assinatura expirada bloqueia nova precificação
reset role;
update public.subscriptions set trial_ends_at = now() - interval '1 day' where user_id = '11111111-1111-1111-1111-111111111111';
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ declare v_prod uuid; begin
  select id into v_prod from public.products limit 1;
  begin
    insert into public.pricings (product_id, quantity, pricing_mode, unit_cost, unit_price, unit_profit, margin_percent, markup_percent, input, result)
    values (v_prod, 1, 'margin', 1, 2, 1, 50, 100, '{}', '{}');
    raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;
reset role;
\echo 'RLS etapa 2 OK'
