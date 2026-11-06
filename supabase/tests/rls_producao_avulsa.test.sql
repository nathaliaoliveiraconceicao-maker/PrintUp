-- Roda depois da migration 0013. Produção avulsa: baixa de filamento + estoque do produto, atômica e idempotente.
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

\set ASX 'set role authenticated; set request.jwt.claim.sub = ''e0000000-0000-0000-0000-000000000001''; set request.jwt.claim.role = ''authenticated'';'
\set ASY 'set role authenticated; set request.jwt.claim.sub = ''e0000000-0000-0000-0000-000000000002''; set request.jwt.claim.role = ''authenticated'';'
\set ASANON 'set role anon; reset request.jwt.claim.sub; set request.jwt.claim.role = ''anon'';'
\set ASSU 'reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;'
:ASSU
insert into auth.users (id, email) values ('e0000000-0000-0000-0000-000000000001', 'prod1@exemplo.com'), ('e0000000-0000-0000-0000-000000000002', 'prod2@exemplo.com');

:ASX
insert into public.filaments (name, material, color, price_per_kg) values ('PLA Branco', 'PLA', 'Branco', 100);
select id as fil from public.filaments where name = 'PLA Branco' \gset
insert into public.products (name, sale_price, stock_qty) values ('Porta-chaves', 5, 10), ('Outro', 5, 0);
select id as prod from public.products where name = 'Porta-chaves' \gset
select id as prod2 from public.products where name = 'Outro' \gset
select public.create_spool(:'fil', 'Marca', null, null, 1000, 90, null, null, null, 'spool-a') as sp \gset

-- O exemplo do pedido: 50 porta-chaves, 800 g de uma bobina de 1 kg => sobram 200 g
select pg_temp.assert(public.register_production(:'prod', 50, :'fil', 800, 'prod-0001') = 60, 'estoque do produto: 10 + 50 = 60');
select pg_temp.assert((select remaining_g from public.filament_spools where id = :'sp') = 200, 'bobina ficou com 200 g');
select pg_temp.assert((select status from public.filament_spools where id = :'sp') = 'em_uso', 'bobina passa a "em uso"');
select pg_temp.assert((select count(*) from public.stock_movements where kind = 'consumo' and delta_remaining = -800 and note like 'Produção avulsa: 50× Porta-chaves') = 1, 'livro-razão registra o consumo de 800 g');
-- repetir a mesma operação (duplo clique) não baixa de novo
select pg_temp.assert(public.register_production(:'prod', 50, :'fil', 800, 'prod-0001') = 60, 'repetição devolve o mesmo resultado');
select pg_temp.assert((select remaining_g from public.filament_spools where id = :'sp') = 200 and (select stock_qty from public.products where id = :'prod') = 60, 'repetição não baixa nem soma de novo');
-- falta de material: nada muda (nem o estoque do produto)
select pg_temp.denied($$select public.register_production('$$ || :'prod' || $$', 5, '$$ || :'fil' || $$', 300, 'prod-0002')$$, 'P0001', 'Estoque insuficiente: faltam 100%');
select pg_temp.assert((select remaining_g from public.filament_spools where id = :'sp') = 200 and (select stock_qty from public.products where id = :'prod') = 60, 'falha não altera nada');
-- duas bobinas: consome primeiro a que está em uso, depois a próxima
select public.create_spool(:'fil', 'Marca', null, null, 500, 40, null, null, null, 'spool-b') as sp2 \gset
select pg_temp.assert(public.register_production(:'prod2', 3, :'fil', 300, 'prod-0003') = 3, 'segundo produto: 3 peças');
select pg_temp.assert((select remaining_g from public.filament_spools where id = :'sp') = 0 and (select status from public.filament_spools where id = :'sp') = 'vazia', 'primeira bobina esgotada (200 g)');
select pg_temp.assert((select remaining_g from public.filament_spools where id = :'sp2') = 400, 'segunda bobina cobre o resto (100 g)');
-- validações
select pg_temp.denied($$select public.register_production('$$ || :'prod' || $$', 0, '$$ || :'fil' || $$', 10, 'prod-0004')$$, 'P0001');
select pg_temp.denied($$select public.register_production('$$ || :'prod' || $$', 1, '$$ || :'fil' || $$', 0, 'prod-0005')$$, 'P0001');
select pg_temp.denied($$select public.register_production('$$ || :'prod' || $$', 1, '$$ || :'fil' || $$', -5, 'prod-0006')$$, 'P0001');
select pg_temp.denied($$select public.register_production('$$ || :'prod' || $$', 1, '$$ || :'fil' || $$', 10, 'x')$$, 'P0001');
-- reservado de pedidos não é consumido
:ASSU
select set_config('printup.ledger', 'on', false);
update public.filament_spools set reserved_g = 380 where id = :'sp2';
select set_config('printup.ledger', 'off', false);
:ASX
select pg_temp.denied($$select public.register_production('$$ || :'prod' || $$', 1, '$$ || :'fil' || $$', 50, 'prod-0007')$$, 'P0001', 'Estoque insuficiente: faltam 30%');

-- outro usuário não usa produto nem filamento alheios
:ASY
select pg_temp.denied($$select public.register_production('$$ || :'prod' || $$', 1, '$$ || :'fil' || $$', 10, 'prod-0008')$$, 'P0002');
-- anônimo não executa
:ASANON
select pg_temp.denied($$select public.register_production('$$ || :'prod' || $$', 1, '$$ || :'fil' || $$', 10, 'prod-0009')$$);
:ASSU
select 'RLS produção avulsa OK' as resultado;
