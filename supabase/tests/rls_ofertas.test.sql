-- Roda por último (depois da migration 0017). Central de ofertas: leitura pública restrita, travas de dados e isolamento.
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
create or replace function pg_temp.hidden(q text, msg text) returns void language plpgsql as $$
declare n int;
begin
  begin execute 'select count(*) from (' || q || ') t' into n;
  exception when insufficient_privilege then return;
  end;
  if n <> 0 then raise exception 'FALHOU: %', msg; end if;
end $$;

\set ASX 'set role authenticated; set request.jwt.claim.sub = ''f0000000-0000-0000-0000-000000000001''; set request.jwt.claim.role = ''authenticated'';'
\set ASY 'set role authenticated; set request.jwt.claim.sub = ''f0000000-0000-0000-0000-000000000002''; set request.jwt.claim.role = ''authenticated'';'
\set ASANON 'set role anon; reset request.jwt.claim.sub; set request.jwt.claim.role = ''anon'';'
\set ASSU 'reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;'
:ASSU
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-000000000001', 'of1@exemplo.com'), ('f0000000-0000-0000-0000-000000000002', 'of2@exemplo.com');

-- cenário (feito pelo servidor)
insert into public.offer_stores (code, name, kind, allowed_hosts, is_active, affiliate_config) values ('lojaa', 'Loja A', 'afiliado', '{lojaa.com.br}', true, '{"params":{"aff":"SEGREDO"}}'), ('simu', 'Simulada', 'simulado', '{simu.com.br}', true, '{}');
update public.offer_stores set is_simulated = true where code = 'simu';
select id as st from public.offer_stores where code = 'lojaa' \gset
select id as st_sim from public.offer_stores where code = 'simu' \gset
insert into public.offer_products (store_id, external_id, title, brand, category, product_url, image_url, canonical_key) values
  (:'st', 'p1', 'Filamento PLA 1kg', 'Marca', 'filamento-pla', 'https://lojaa.com.br/p1', 'https://lojaa.com.br/p1.jpg', 'k1'),
  (:'st', 'p2', 'Filamento PETG 1kg', 'Marca', 'filamento-petg', 'https://lojaa.com.br/p2', null, 'k2'),
  (:'st_sim', 's1', 'Produto simulado', 'Sim', 'acessorios', 'https://simu.com.br/s1', null, null);
select id as p1 from public.offer_products where external_id = 'p1' \gset
select id as p2 from public.offer_products where external_id = 'p2' \gset
select id as ps from public.offer_products where external_id = 's1' \gset
insert into public.offers (product_id, status, price_cents, previous_price_cents, previous_basis, discount_pct, link_url, is_affiliate, score, score_detail, flags, review_reason)
  values (:'p1', 'publicada', 8000, 10000, 'loja', 20.0, 'https://lojaa.com.br/p1?aff=SEGREDO', true, 80, '{"x":1}', '{a}', 'interno');
insert into public.offers (product_id, status, price_cents, link_url, score) values (:'p2', 'revisao', 5000, 'https://lojaa.com.br/p2', 60);
insert into public.offer_price_history (product_id, price_cents, source) values (:'p1', 9000, 'feed'), (:'p1', 8000, 'feed'), (:'p2', 5100, 'feed');
insert into public.offer_coupons (store_id, code, kind, value, source) values (:'st', 'PRINT10', 'percent', 10, 'loja'), (:'st', 'VELHO10', 'percent', 10, 'loja');
update public.offer_coupons set valid_until = now() - interval '1 day' where code = 'VELHO10';
insert into public.offer_clicks (offer_id, store_id) select id, :'st' from public.offers limit 1;
insert into public.offer_errors (kind, message) values ('teste', 'erro interno');

-- ═════ Dados inválidos são barrados no banco ═════
select pg_temp.denied(format($$insert into public.offers (product_id, status, price_cents, previous_price_cents, previous_basis, discount_pct, link_url) values ('%s', 'rascunho', 9000, 8000, 'loja', 10, 'https://lojaa.com.br/x')$$, :'ps'), '23514');
select pg_temp.denied(format($$insert into public.offers (product_id, status, price_cents, previous_price_cents, link_url) values ('%s', 'rascunho', 8000, 9000, 'https://lojaa.com.br/x')$$, :'ps'), '23514');
select pg_temp.denied(format($$insert into public.offers (product_id, status, price_cents, discount_pct, link_url) values ('%s', 'rascunho', 8000, 10, 'https://lojaa.com.br/x')$$, :'ps'), '23514');
select pg_temp.denied(format($$insert into public.offers (product_id, status, price_cents, link_url) values ('%s', 'rascunho', 8000, 'http://lojaa.com.br/x')$$, :'ps'), '23514');
select pg_temp.denied(format($$insert into public.offers (product_id, status, price_cents, link_url) values ('%s', 'revisao', 7000, 'https://lojaa.com.br/dup')$$, :'p2'), '23505'); -- duplicata em aberto
select pg_temp.denied($$insert into public.offer_stores (code, name, allowed_hosts) values ('ruim', 'Ruim', '{localhost}')$$, '23514');
select pg_temp.denied($$insert into public.offer_coupons (store_id, code, kind, value, source) select id, 'abc', 'percent', 10, 'x' from public.offer_stores limit 1$$, '23514');
select pg_temp.denied($$insert into public.offer_coupons (store_id, code, kind, value, source) select id, 'TESTE100', 'percent', 100, 'x' from public.offer_stores limit 1$$, '23514');
-- oferta simulada nunca é publicada (configuração padrão)
select pg_temp.denied(format($$insert into public.offers (product_id, status, price_cents, link_url, is_simulated) values ('%s', 'publicada', 5000, 'https://simu.com.br/s1', true)$$, :'ps'), 'P0001', 'Oferta simulada não pode ser publicada');
-- oferta expirada libera nova oferta para o mesmo produto
update public.offers set status = 'expirada' where product_id = :'p2';
insert into public.offers (product_id, status, price_cents, link_url, score) values (:'p2', 'revisao', 4900, 'https://lojaa.com.br/p2', 61);
-- uma execução por fonte por vez
insert into public.offer_sources (store_id, connector, name) values (:'st', 'feed_manual', 'Feed A');
select id as src from public.offer_sources limit 1 \gset
insert into public.offer_runs (source_id, trigger) values (:'src', 'cron');
select pg_temp.denied(format($$insert into public.offer_runs (source_id, trigger) values ('%s', 'manual')$$, :'src'), '23505');

-- ═════ Visitante (anônimo): só o que está publicado, só colunas de vitrine ═════
:ASANON
select pg_temp.assert((select count(*) from public.offers) = 1, 'anônimo vê só a oferta publicada');
select pg_temp.assert((select count(*) from public.offer_products) = 1, 'anônimo vê só produtos com oferta publicada');
select pg_temp.assert((select count(*) from public.offer_price_history) = 2, 'histórico só do produto publicado');
select pg_temp.assert((select count(*) from public.offer_coupons) = 1, 'cupom vencido não aparece');
select pg_temp.assert((select count(*) from public.offer_stores) = 1, 'loja simulada não aparece');
select pg_temp.denied($$select score_detail from public.offers$$);
select pg_temp.denied($$select flags from public.offers$$);
select pg_temp.denied($$select review_reason from public.offers$$);
select pg_temp.denied($$select affiliate_config from public.offer_stores$$);
select pg_temp.denied($$select source from public.offer_price_history$$);
select pg_temp.denied($$select * from public.offer_settings$$);
select pg_temp.denied($$select * from public.offer_sources$$);
select pg_temp.denied($$select * from public.offer_runs$$);
select pg_temp.denied($$select * from public.offer_errors$$);
select pg_temp.denied($$select * from public.offer_clicks$$);
select pg_temp.denied($$select * from public.offer_conversions$$);
select pg_temp.denied($$insert into public.offers (product_id, price_cents, link_url) values (gen_random_uuid(), 1, 'https://x.com')$$);
select pg_temp.denied($$update public.offers set featured = true$$);
select pg_temp.denied($$delete from public.offer_clicks$$);
select pg_temp.denied($$insert into public.offer_alerts (rule) values ('{"kind":"preco_abaixo"}')$$);

-- ═════ Cliente logado: também só a vitrine; alertas isolados ═════
:ASX
select pg_temp.assert((select count(*) from public.offers) = 1, 'cliente vê só a oferta publicada');
select pg_temp.denied($$select * from public.offer_errors$$);
select pg_temp.denied($$update public.offers set featured = true$$);
insert into public.offer_alerts (rule) values ('{"kind":"preco_abaixo","maxPriceCents":6000}');
select pg_temp.denied($$insert into public.offer_alerts (rule) values ('{"kind":"qualquer"}')$$, '23514');
:ASY
select pg_temp.assert((select count(*) from public.offer_alerts) = 0, 'outro usuário não vê alertas alheios');
do $$ declare n int; begin update public.offer_alerts set is_active = false; get diagnostics n = row_count; if n <> 0 then raise exception 'FALHOU: alterou alerta alheio'; end if; end $$;
:ASX
-- limite de 20 alertas por pessoa
do $$ begin for i in 1..19 loop insert into public.offer_alerts (rule) values ('{"kind":"desconto_acima","minDiscountPct":10}'); end loop; end $$;
select pg_temp.denied($$insert into public.offer_alerts (rule) values ('{"kind":"desconto_acima","minDiscountPct":10}')$$, 'P0001', 'Limite de alertas atingido%');

-- ═════ Ativar simulação (só para desenvolvimento) permite publicar simulada ═════
:ASSU
update public.offer_settings set value = 'true' where key = 'allow_simulated';
insert into public.offers (product_id, status, price_cents, link_url, is_simulated) values (:'ps', 'publicada', 5000, 'https://simu.com.br/s1', true);
update public.offer_settings set value = 'false' where key = 'allow_simulated';
:ASANON
select pg_temp.assert((select count(*) from public.offers) = 1, 'simulada some de novo ao desligar a configuração');
:ASSU
select 'RLS ofertas OK' as resultado;
