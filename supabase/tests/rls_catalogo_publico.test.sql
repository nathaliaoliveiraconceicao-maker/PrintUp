-- Roda depois da migration 0012. Catálogo compartilhável: acesso anônimo só pelo token e só campos de vitrine.
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; end $$;
create or replace function pg_temp.denied(q text, st text default '42501', msg text default null) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then
    if sqlstate <> st then raise exception 'FALHOU: [%] esperado %, veio % (%)', q, st, sqlstate, sqlerrm; end if;
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

\set ASX 'set role authenticated; set request.jwt.claim.sub = ''d0000000-0000-0000-0000-000000000001''; set request.jwt.claim.role = ''authenticated'';'
\set ASY 'set role authenticated; set request.jwt.claim.sub = ''d0000000-0000-0000-0000-000000000002''; set request.jwt.claim.role = ''authenticated'';'
\set ASANON 'set role anon; reset request.jwt.claim.sub; set request.jwt.claim.role = ''anon'';'
\set ASSU 'reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;'
:ASSU
insert into auth.users (id, email) values ('d0000000-0000-0000-0000-000000000001', 'cat1@exemplo.com'), ('d0000000-0000-0000-0000-000000000002', 'cat2@exemplo.com');

:ASX
insert into public.business_profiles (user_id, business_name, phone, city) values (auth.uid(), 'Loja do Teste', '21999990000', 'Itaboraí');
insert into public.products (name, category, sale_price, production_cost, stock_qty, photo_path) values
  ('Com estoque', 'Cat', 10, 3, 5, auth.uid()::text || '/produtos/11111111-1111-1111-1111-111111111111.jpg'),
  ('Sem estoque', 'Cat', 12, 4, 0, null),
  ('Sem preço', 'Cat', null, 4, 9, null),
  ('Arquivado', 'Cat', 9, 2, 9, null);
update public.products set archived_at = now() where name = 'Arquivado';
insert into public.catalog_shares (title) values ('Vitrine');
select pg_temp.assert((select token ~ '^[0-9a-f]{32}$' from public.catalog_shares), 'token aleatório de 32 hex gerado');
select token as tok from public.catalog_shares \gset
select id as pid from public.products where name = 'Com estoque' \gset
select id as pid_zero from public.products where name = 'Sem estoque' \gset

-- outro usuário não vê nem altera o link alheio
:ASY
select pg_temp.assert((select count(*) from public.catalog_shares) = 0, 'outro usuário não vê o link alheio');
do $$ declare n int; begin update public.catalog_shares set enabled = false; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: outro usuário alterou o link alheio'; end if; end $$;

-- anônimo: sem acesso direto às tabelas
:ASANON
select pg_temp.denied($$select * from public.catalog_shares$$);
select pg_temp.hidden('select * from public.products', 'anônimo não lê produtos');
-- anônimo com token válido: só o que é vitrine
select pg_temp.assert((select count(*) from public.public_catalog_items(:'tok')) = 1, 'vitrine mostra só produto ativo, com preço e estoque');
select pg_temp.assert((select name from public.public_catalog_items(:'tok')) = 'Com estoque', 'produto certo na vitrine');
select pg_temp.assert((select business_name from public.public_catalog_info(:'tok')) = 'Loja do Teste', 'nome da loja na vitrine');
select pg_temp.assert((select has_photo from public.public_catalog_items(:'tok')), 'indica que há foto');
select pg_temp.assert((select public.public_catalog_photo(:'tok', :'pid')) like '%/produtos/11111111-1111-1111-1111-111111111111.jpg', 'caminho da foto só com token + produto válidos');
select pg_temp.assert((select public.public_catalog_photo(:'tok', :'pid_zero')) is null, 'produto fora da vitrine não entrega foto');
-- a vitrine não expõe custo/margem (as colunas nem existem no retorno)
select pg_temp.assert((select count(*) from information_schema.columns where table_name = 'public_catalog_items' and column_name in ('production_cost','margin_percent')) = 0, 'sem colunas de custo');
-- token errado / aleatório: nada
select pg_temp.assert((select count(*) from public.public_catalog_items('00000000000000000000000000000000')) = 0, 'token desconhecido não devolve nada');
select pg_temp.assert((select count(*) from public.public_catalog_info('x')) = 0, 'token malformado não devolve nada');
select pg_temp.assert((select public.public_catalog_photo('00000000000000000000000000000000', :'pid')) is null, 'foto com token desconhecido: nada');

-- opções do dono
:ASX
update public.catalog_shares set show_out_of_stock = true;
:ASANON
select pg_temp.assert((select count(*) from public.public_catalog_items(:'tok')) = 2, 'com a opção ligada, produto sem estoque também aparece');
:ASX
update public.catalog_shares set show_prices = false;
:ASANON
select pg_temp.assert((select count(*) from public.public_catalog_items(:'tok') where sale_price is not null) = 0, 'sem preços: o preço não sai do banco');
:ASX
update public.catalog_shares set enabled = false;
:ASANON
select pg_temp.assert((select count(*) from public.public_catalog_items(:'tok')) = 0 and (select count(*) from public.public_catalog_info(:'tok')) = 0, 'link desativado não devolve nada');
-- o dono pode gerar um novo link (o antigo deixa de valer)
:ASX
update public.catalog_shares set enabled = true, token = replace(gen_random_uuid()::text, '-', '');
:ASANON
select pg_temp.assert((select count(*) from public.public_catalog_items(:'tok')) = 0, 'link antigo não vale depois de gerar outro');
:ASSU
select 'RLS catálogo público OK' as resultado;
