-- Roda por último (depois da migration 0011). Configurações completas e canais de venda.
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

\set ASX 'set role authenticated; set request.jwt.claim.sub = ''c0000000-0000-0000-0000-000000000001''; set request.jwt.claim.role = ''authenticated'';'
\set ASY 'set role authenticated; set request.jwt.claim.sub = ''c0000000-0000-0000-0000-000000000002''; set request.jwt.claim.role = ''authenticated'';'
\set ASSU 'reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;'
:ASSU
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-000000000001', 'cfg1@exemplo.com'), ('c0000000-0000-0000-0000-000000000002', 'cfg2@exemplo.com');

-- ═════ Configurações: novos campos e validações ═════
:ASX
insert into public.cost_settings (user_id, packaging_per_unit, shipping_per_unit, fixed_items, expected_revenue, fixed_allocation, pricing_mode, markup_percent, price_rounding, monthly_fixed_costs)
values (auth.uid(), 7, 3.5, '{"aluguel": 500, "softwares": 35, "publicidade": 100}', 3000, 'revenue_percent', 'markup', 200, 'real', 635);
select pg_temp.assert((select packaging_per_unit + shipping_per_unit from public.cost_settings) = 10.5, 'embalagem e frete padrão salvos');
select pg_temp.assert((select price_rounding from public.cost_settings) = 'real' and (select fixed_allocation from public.cost_settings) = 'revenue_percent', 'arredondamento e rateio pelo faturamento salvos');
select pg_temp.denied($$update public.cost_settings set fixed_allocation = 'qualquer'$$, '23514');
select pg_temp.denied($$update public.cost_settings set price_rounding = 'metade'$$, '23514');
select pg_temp.denied($$update public.cost_settings set pricing_mode = 'x'$$, '23514');
select pg_temp.denied($$update public.cost_settings set packaging_per_unit = -1$$, '23514');
select pg_temp.denied($$update public.cost_settings set markup_percent = 99999$$, '23514');
select pg_temp.denied($$update public.cost_settings set fixed_items = '{"chave_inventada": 5}'$$, 'P0001', 'Despesa mensal desconhecida%');
select pg_temp.denied($$update public.cost_settings set fixed_items = '{"aluguel": -5}'$$, 'P0001', 'Valor inválido%');
select pg_temp.denied($$update public.cost_settings set fixed_items = '{"aluguel": "muito"}'$$, 'P0001', 'Valor inválido%');
select pg_temp.denied($$update public.cost_settings set fixed_items = '[1,2]'$$, '23514');
-- cada pessoa só vê as próprias configurações
:ASY
select pg_temp.assert((select count(*) from public.cost_settings) = 0, 'outro usuário não vê as configurações alheias');
:ASX

-- ═════ Canais de venda ═════
insert into public.sales_channels (name, fee_percent, fee_fixed) values ('Shopee', 20, 4), ('Mercado Livre', 19, 0);
select pg_temp.assert((select count(*) from public.sales_channels) = 2, 'canais cadastrados');
select pg_temp.denied($$insert into public.sales_channels (name) values (' shopee ')$$, '23505');                    -- nome repetido (sem diferenciar maiúsculas/espaços)
select pg_temp.denied($$insert into public.sales_channels (name, fee_percent) values ('Taxa alta', 100)$$, '23514');
select pg_temp.denied($$insert into public.sales_channels (name, fee_percent) values ('Negativa', -1)$$, '23514');
select pg_temp.denied($$insert into public.sales_channels (name, fee_fixed) values ('Fixa negativa', -1)$$, '23514');
select pg_temp.denied($$insert into public.sales_channels (name) values ('   ')$$, '23514');
select pg_temp.denied($$insert into public.sales_channels (name, user_id) values ('De outro', 'c0000000-0000-0000-0000-000000000002')$$);   -- não cria em nome de outro
update public.sales_channels set fee_percent = 21 where name = 'Shopee';
select pg_temp.assert((select fee_percent from public.sales_channels where name = 'Shopee') = 21, 'taxa editada');
insert into public.sales_channels (name) select 'Canal ' || g from generate_series(1, 8) g;
select pg_temp.denied($$insert into public.sales_channels (name) values ('Canal 11')$$, 'P0001', 'Limite de canais de venda atingido (10)');
-- isolamento
:ASY
select pg_temp.assert((select count(*) from public.sales_channels) = 0, 'outro usuário não vê canais alheios');
update public.sales_channels set fee_percent = 1;
delete from public.sales_channels;
:ASSU
select pg_temp.assert((select count(*) from public.sales_channels) = 10 and (select fee_percent from public.sales_channels where name = 'Shopee') = 21, 'outro usuário não altera nem apaga canais alheios');
set role anon;
select pg_temp.assert((select count(*) from public.sales_channels) = 0, 'visitante sem login não vê canais');
reset role;
\echo RLS configurações OK
