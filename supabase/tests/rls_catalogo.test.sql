-- Roda por último. Catálogo, clientes, perfil do negócio, orçamentos (migration 0006).
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; end $$;

reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
-- estado limpo vindo dos testes anteriores
update public.subscriptions set trial_ends_at = now() + interval '5 days', status = 'trialing' where user_id in
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
delete from storage.objects;

-- ═════ Preenchimento retroativo do produto legado ═════
select pg_temp.assert((select production_cost from public.products where id = 'eeeeeeee-0000-0000-0000-000000000001') = 20, 'backfill: custo');
select pg_temp.assert((select sale_price from public.products where id = 'eeeeeeee-0000-0000-0000-000000000001') = 40, 'backfill: preço');
select pg_temp.assert((select material_cost from public.products where id = 'eeeeeeee-0000-0000-0000-000000000001') = 5, 'backfill: material');
select pg_temp.assert((select machine_cost from public.products where id = 'eeeeeeee-0000-0000-0000-000000000001') = 9, 'backfill: máquina = hora+energia+desgaste');
select pg_temp.assert((select other_costs from public.products where id = 'eeeeeeee-0000-0000-0000-000000000001') = 6, 'backfill: outros = fixo+perdas+mão de obra+embalagem');
select pg_temp.assert((select weight_g from public.products where id = 'eeeeeeee-0000-0000-0000-000000000001') = 100, 'backfill: peso');
select pg_temp.assert((select print_minutes from public.products where id = 'eeeeeeee-0000-0000-0000-000000000001') = 120, 'backfill: tempo');
select pg_temp.assert((select pricing_id from public.products where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'eeeeeeee-0000-0000-0000-0000000000a1', 'backfill: vínculo com o cálculo');
select pg_temp.assert((select margin_basis from public.products where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'liquida', 'backfill: base da margem');

-- ═════ A: produto, cliente, perfil ═════
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set request.jwt.claim.role = 'authenticated';
insert into public.products (id, name, category, production_cost, sale_price, stock_qty, source_url)
values ('eeeeeeee-0000-0000-0000-000000000002', 'Vaso', 'Decoração', 10, 25, 3, 'https://makerworld.com/x');
select pg_temp.assert((select count(*) from public.products where id in ('eeeeeeee-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000002')) = 2 and not exists (select 1 from public.products where user_id <> auth.uid()), 'A vê só os seus produtos');
-- URL de origem precisa ser http(s)
do $$ begin
  begin insert into public.products (name, source_url) values ('x', 'javascript:alert(1)'); raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
-- estoque negativo é rejeitado
do $$ begin
  begin update public.products set stock_qty = -1 where id = 'eeeeeeee-0000-0000-0000-000000000002'; raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
-- foto na pasta de outro usuário é rejeitada
do $$ begin
  begin update public.products set photo_path = '22222222-2222-2222-2222-222222222222/p.png' where id = 'eeeeeeee-0000-0000-0000-000000000002'; raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
update public.products set archived_at = now() where id = 'eeeeeeee-0000-0000-0000-000000000002';
select pg_temp.assert((select archived_at is not null from public.products where id = 'eeeeeeee-0000-0000-0000-000000000002'), 'arquivar produto');

insert into public.customers (id, name, phone) values ('ffffffff-0000-0000-0000-000000000001', 'Cliente A', '11999990000');
insert into public.business_profiles (business_name, brand_color) values ('Oficina A', '#112233');
do $$ begin
  begin update public.business_profiles set brand_color = 'vermelho'; raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
do $$ begin
  begin update public.business_profiles set default_validity_days = 0; raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
do $$ begin
  begin update public.business_profiles set logo_path = '22222222-2222-2222-2222-222222222222/l.png'; raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;

-- ═════ A: orçamento via save_quote ═════
create temp table q as select public.save_quote(null,
  '{"customer_id":"ffffffff-0000-0000-0000-000000000001","customer_name":"Cliente A","customer_phone":"11999990000","issue_date":"2026-01-10","valid_until":"2026-01-20","production_days":5,"payment_terms":"50% na entrada","notes":"","discount_type":"percentual","discount_value":10,"subtotal":105,"discount_total":10.5,"total":94.5,"internal_cost_total":42}'::jsonb,
  '[{"kind":"produto","product_id":"eeeeeeee-0000-0000-0000-000000000001","name":"Produto legado","quantity":2,"list_price":40,"unit_price":40,"discount_percent":0,"line_total":80,"unit_cost":20},
    {"kind":"personalizacao","name":"Nome gravado","quantity":1,"unit_price":25,"discount_percent":0,"line_total":25,"unit_cost":null}]'::jsonb) as id;
grant select on q to authenticated;
select pg_temp.assert((select number from public.quotes where id = (select id from q)) = 1, 'primeiro orçamento do usuário é o nº 1');
select pg_temp.assert((select count(*) from public.quote_items where quote_id = (select id from q)) = 2, 'orçamento tem 2 itens');
select pg_temp.assert((select total from public.quotes where id = (select id from q)) = 94.5, 'total gravado');

-- totais que não fecham com os itens: rejeitado e nada fica gravado
do $$ begin
  begin perform public.save_quote(null,
    '{"customer_name":"X","issue_date":"2026-01-10","valid_until":"2026-01-20","discount_type":"nenhum","discount_value":0,"subtotal":999,"discount_total":0,"total":999}'::jsonb,
    '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"discount_percent":0,"line_total":10}]'::jsonb);
    raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;
select pg_temp.assert((select count(*) from public.quotes) = 1, 'transação desfeita: sem orçamento órfão');
-- sem itens: rejeitado
do $$ begin
  begin perform public.save_quote(null, '{"customer_name":"X","issue_date":"2026-01-10","valid_until":"2026-01-20","discount_type":"nenhum","discount_value":0,"subtotal":0,"discount_total":0,"total":0}'::jsonb, '[]'::jsonb);
    raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;
-- constraints do cabeçalho: total != subtotal - desconto, validade anterior à emissão, desconto > 100%
do $$ begin
  begin update public.quotes set total = 1 where id = (select id from q); raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
do $$ begin
  begin update public.quotes set valid_until = '2025-01-01' where id = (select id from q); raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
-- produto de outro usuário não entra no orçamento
reset role; set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into public.products (id, name) values ('eeeeeeee-0000-0000-0000-0000000000b1', 'Produto do B');
select pg_temp.assert((select count(*) from public.products where id in ('eeeeeeee-0000-0000-0000-000000000001','eeeeeeee-0000-0000-0000-000000000002')) = 0 and exists (select 1 from public.products where id = 'eeeeeeee-0000-0000-0000-0000000000b1'), 'B não vê produtos de A');
select pg_temp.assert((select count(*) from public.quotes) = 0, 'B não vê orçamentos de A');
select pg_temp.assert((select count(*) from public.quote_items) = 0, 'B não vê itens de A');
select pg_temp.assert((select count(*) from public.customers) = 0, 'B não vê clientes de A');
select pg_temp.assert((select count(*) from public.business_profiles) = 0, 'B não vê o perfil de A');
-- B tenta alterar/apagar o orçamento de A: 0 linhas afetadas
update public.quotes set notes = 'invadido';
delete from public.quotes;
delete from public.quote_items;
-- B tenta editar orçamento de A via RPC
do $$ begin
  begin perform public.save_quote((select id from q),
    '{"customer_name":"X","issue_date":"2026-01-10","valid_until":"2026-01-20","discount_type":"nenhum","discount_value":0,"subtotal":10,"discount_total":0,"total":10}'::jsonb,
    '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"discount_percent":0,"line_total":10}]'::jsonb);
    raise exception 'deveria ter falhado';
  exception when sqlstate 'P0002' then null; end;
end $$;
-- B tenta criar orçamento com cliente de A / item com produto de A
do $$ begin
  begin perform public.save_quote(null,
    '{"customer_id":"ffffffff-0000-0000-0000-000000000001","customer_name":"X","issue_date":"2026-01-10","valid_until":"2026-01-20","discount_type":"nenhum","discount_value":0,"subtotal":10,"discount_total":0,"total":10}'::jsonb,
    '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"discount_percent":0,"line_total":10}]'::jsonb);
    raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
do $$ begin
  begin perform public.save_quote(null,
    '{"customer_name":"X","issue_date":"2026-01-10","valid_until":"2026-01-20","discount_type":"nenhum","discount_value":0,"subtotal":10,"discount_total":0,"total":10}'::jsonb,
    '[{"kind":"produto","product_id":"eeeeeeee-0000-0000-0000-000000000001","name":"a","quantity":1,"unit_price":10,"discount_percent":0,"line_total":10}]'::jsonb);
    raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
-- B tenta usar produto de A em produto próprio (impressora/cálculo alheios)
do $$ begin
  begin insert into public.products (name, pricing_id) values ('x', 'eeeeeeee-0000-0000-0000-0000000000a1'); raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
-- numeração é por usuário: o primeiro de B também é nº 1
create temp table qb as select public.save_quote(null,
  '{"customer_name":"Cliente B","issue_date":"2026-01-10","valid_until":"2026-01-20","discount_type":"nenhum","discount_value":0,"subtotal":10,"discount_total":0,"total":10}'::jsonb,
  '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"discount_percent":0,"line_total":10}]'::jsonb) as id;
select pg_temp.assert((select number from public.quotes where id = (select id from qb)) = 1, 'numeração por usuário');
-- B não escolhe o número
insert into public.quotes (number, customer_name, valid_until, subtotal, discount_total, total) values (99, 'Y', current_date, 0, 0, 0);
select pg_temp.assert((select max(number) from public.quotes) = 2, 'o banco atribui o número (ignora o enviado)');
reset role;

-- ═════ A: ciclo de vida do orçamento ═════
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.assert((select notes from public.quotes where id = (select id from q)) = '', 'A intacto após tentativas de B');
-- rascunho é editável
select public.save_quote((select id from q),
  '{"customer_name":"Cliente A","issue_date":"2026-01-10","valid_until":"2026-01-20","discount_type":"nenhum","discount_value":0,"subtotal":105,"discount_total":0,"total":105,"internal_cost_total":42}'::jsonb,
  '[{"kind":"produto","name":"Produto legado","quantity":2,"unit_price":40,"discount_percent":0,"line_total":80},
    {"kind":"personalizacao","name":"Nome gravado","quantity":1,"unit_price":25,"discount_percent":0,"line_total":25}]'::jsonb);
select pg_temp.assert((select total from public.quotes where id = (select id from q)) = 105, 'rascunho editável');
update public.quotes set status = 'enviado', sent_at = now() where id = (select id from q);
-- enviado: conteúdo travado
do $$ begin
  begin update public.quotes set total = 1, subtotal = 1 where id = (select id from q); raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;
do $$ begin
  begin update public.quotes set customer_name = 'Outro' where id = (select id from q); raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;
do $$ begin
  begin update public.quote_items set unit_price = 1 where quote_id = (select id from q); raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;
do $$ begin
  begin delete from public.quote_items where quote_id = (select id from q); raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;
do $$ begin
  begin perform public.save_quote((select id from q),
    '{"customer_name":"Cliente A","issue_date":"2026-01-10","valid_until":"2026-01-20","discount_type":"nenhum","discount_value":0,"subtotal":10,"discount_total":0,"total":10}'::jsonb,
    '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"discount_percent":0,"line_total":10}]'::jsonb);
    raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;
select pg_temp.assert((select count(*) from public.quote_items where quote_id = (select id from q)) = 2, 'itens do enviado preservados');
-- compartilhar não mexe no conteúdo
update public.quotes set shared_at = now() where id = (select id from q);
-- editar o produto depois não altera o retrato do orçamento
update public.products set sale_price = 999, name = 'Renomeado' where id = 'eeeeeeee-0000-0000-0000-000000000001';
select pg_temp.assert((select unit_price from public.quote_items where quote_id = (select id from q) and kind = 'produto') = 40, 'retrato do preço preservado');
select pg_temp.assert((select name from public.quote_items where quote_id = (select id from q) and kind = 'produto') = 'Produto legado', 'retrato do nome preservado');
-- transições
update public.quotes set status = 'aprovado', decided_at = now() where id = (select id from q);
do $$ begin
  begin update public.quotes set status = 'enviado' where id = (select id from q); raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;
do $$ begin
  begin update public.quotes set status = 'rascunho' where id = (select id from q); raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;
-- novo orçamento de A recebe nº 2 (não reutiliza)
create temp table qa2 as select public.save_quote(null,
  '{"customer_name":"Cliente A2","issue_date":"2026-01-10","valid_until":"2026-01-20","discount_type":"nenhum","discount_value":0,"subtotal":10,"discount_total":0,"total":10}'::jsonb,
  '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"discount_percent":0,"line_total":10}]'::jsonb) as id;
select pg_temp.assert((select number from public.quotes where id = (select id from qa2)) = 2, 'segundo orçamento de A é o nº 2');
-- excluir cliente mantém o retrato no orçamento
delete from public.customers where id = 'ffffffff-0000-0000-0000-000000000001';
select pg_temp.assert((select customer_name from public.quotes where id = (select id from q)) = 'Cliente A', 'retrato do cliente sobrevive à exclusão');
select pg_temp.assert((select customer_id from public.quotes where id = (select id from q)) is null, 'vínculo some, retrato fica');

-- ═════ Anônimo ═════
reset role; set role anon;
do $$ begin
  begin perform public.save_quote(null, '{}'::jsonb, '[]'::jsonb); raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
-- sem policy para anon: a tabela pode ser lida (privilégio padrão do Supabase), mas nenhuma linha é visível
select pg_temp.assert((select count(*) from public.quotes) = 0 and (select count(*) from public.quote_items) = 0
  and (select count(*) from public.customers) = 0 and (select count(*) from public.business_profiles) = 0, 'anônimo não vê nada');
reset role;

-- ═════ Limite do plano ═════
-- trial permite 10 orçamentos: A já tem 2
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ declare i int; begin
  for i in 1..8 loop
    perform public.save_quote(null, '{"customer_name":"L","issue_date":"2026-01-10","valid_until":"2026-01-20","discount_type":"nenhum","discount_value":0,"subtotal":10,"discount_total":0,"total":10}'::jsonb,
      '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"discount_percent":0,"line_total":10}]'::jsonb);
  end loop;
  begin
    perform public.save_quote(null, '{"customer_name":"L","issue_date":"2026-01-10","valid_until":"2026-01-20","discount_type":"nenhum","discount_value":0,"subtotal":10,"discount_total":0,"total":10}'::jsonb,
      '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"discount_percent":0,"line_total":10}]'::jsonb);
    raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;
select pg_temp.assert((select count(*) from public.quotes) = 10, 'limite do plano trial: 10 orçamentos');
reset role;

-- ═════ Storage ═════
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into storage.objects (bucket_id, name, metadata) values ('user-images', '11111111-1111-1111-1111-111111111111/foto.png', '{"size": 1000}');
insert into storage.objects (bucket_id, name, metadata) values ('quote-pdfs', '11111111-1111-1111-1111-111111111111/q1.pdf', '{"size": 2000}');
select pg_temp.assert(public.storage_used_bytes() = 3000, 'consumo soma os três buckets');
do $$ begin
  begin insert into storage.objects (bucket_id, name, metadata) values ('user-images', '22222222-2222-2222-2222-222222222222/x.png', '{"size": 1}'); raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
do $$ begin
  begin insert into storage.objects (bucket_id, name, metadata) values ('quote-pdfs', '22222222-2222-2222-2222-222222222222/x.pdf', '{"size": 1}'); raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
-- B não enxerga os arquivos de A
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.assert((select count(*) from storage.objects) = 0, 'B não lista arquivos de A');
-- a cota (50 MB no trial) vale para as imagens também
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into storage.objects (bucket_id, name, metadata) values ('user-images', '11111111-1111-1111-1111-111111111111/grande.png', '{"size": 52428800}');
do $$ begin
  begin insert into storage.objects (bucket_id, name, metadata) values ('quote-pdfs', '11111111-1111-1111-1111-111111111111/q2.pdf', '{"size": 10}'); raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
reset role;
\echo 'RLS catálogo e orçamentos OK'
