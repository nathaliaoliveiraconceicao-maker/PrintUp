-- Roda por último. Importação (migration 0005): invariantes de dados, isolamento e Storage.
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; end $$;

reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
update public.subscriptions set trial_ends_at = now() + interval '5 days' where status = 'trialing';
-- B (superadmin do teste anterior) volta a cliente comum para este bloco
update public.profiles set role = 'customer' where id = '22222222-2222-2222-2222-222222222222';

-- ═════ A: modelos e perfis ═════
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set request.jwt.claim.role = 'authenticated';
insert into public.imported_models (id, title, source, file_path, file_name, file_size, file_kind)
values ('cccccccc-0000-0000-0000-000000000001', 'Suporte', 'arquivo', '11111111-1111-1111-1111-111111111111/a.3mf', 'a.3mf', 1000, '3mf');
select pg_temp.assert((select count(*) from public.imported_models) = 1, 'A cria modelo com arquivo na própria pasta');

-- arquivo na pasta de outro usuário é rejeitado pelo próprio banco
do $$ begin
  begin
    insert into public.imported_models (title, source, file_path, file_kind)
    values ('x', 'arquivo', '22222222-2222-2222-2222-222222222222/b.3mf', '3mf');
    raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
-- miniatura também precisa estar na pasta do próprio usuário
do $$ begin
  begin insert into public.imported_models (title, source, thumb_path) values ('x', 'arquivo', '22222222-2222-2222-2222-222222222222/thumbs/t.png');
    raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
-- tipo de arquivo fora da lista (ex.: stl) é rejeitado
do $$ begin
  begin insert into public.imported_models (title, source, file_path, file_kind) values ('x', 'arquivo', '11111111-1111-1111-1111-111111111111/m.stl', 'stl');
    raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
-- caminho sem tipo (ou tipo sem caminho) é rejeitado
do $$ begin
  begin insert into public.imported_models (title, source, file_path) values ('x', 'arquivo', '11111111-1111-1111-1111-111111111111/c.3mf');
    raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;

-- perfil sem dados: peso e tempo NULL com origem NULL
insert into public.print_profiles (id, model_id, name) values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Perfil 1');
-- nunca inventar: valor sem origem é rejeitado, e origem sem valor também
do $$ begin
  begin update public.print_profiles set weight_g = 50 where id = 'dddddddd-0000-0000-0000-000000000001'; raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
do $$ begin
  begin update public.print_profiles set time_origin = 'arquivo' where id = 'dddddddd-0000-0000-0000-000000000001'; raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
-- zero ou negativo não é dado válido
do $$ begin
  begin update public.print_profiles set weight_g = 0, weight_origin = 'manual' where id = 'dddddddd-0000-0000-0000-000000000001'; raise exception 'deveria ter falhado';
  exception when sqlstate '23514' then null; end;
end $$;
update public.print_profiles set weight_g = 80, weight_origin = 'manual', print_minutes = 150, time_origin = 'arquivo' where id = 'dddddddd-0000-0000-0000-000000000001';
select pg_temp.assert((select weight_g from public.print_profiles) = 80, 'perfil com dados e origens é aceito');

-- ═════ B não vê nem toca nos dados de A ═════
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.assert((select count(*) from public.imported_models) = 0, 'B não vê modelos de A');
select pg_temp.assert((select count(*) from public.print_profiles) = 0, 'B não vê perfis de A');
do $$ begin
  begin insert into public.print_profiles (model_id, name) values ('cccccccc-0000-0000-0000-000000000001', 'invasor'); raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
update public.print_profiles set weight_g = 1, weight_origin = 'manual';
delete from public.imported_models;
reset role;
select pg_temp.assert((select weight_g from public.print_profiles) = 80, 'perfil de A intacto');
select pg_temp.assert((select count(*) from public.imported_models) = 1, 'modelo de A intacto');

-- ═════ Storage ═════
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into storage.objects (bucket_id, name) values ('model-files', '11111111-1111-1111-1111-111111111111/a.3mf');
select pg_temp.assert((select count(*) from storage.objects) = 1, 'A envia arquivo para a própria pasta');
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('model-files', '22222222-2222-2222-2222-222222222222/invasao.3mf'); raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
do $$ begin
  begin insert into storage.objects (bucket_id, name) values ('model-files', 'solto.3mf'); raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.assert((select count(*) from storage.objects) = 0, 'B não lista arquivos de A');
delete from storage.objects;
update storage.objects set name = 'roubado' where true;
reset role;
select pg_temp.assert((select count(*) from storage.objects where name = '11111111-1111-1111-1111-111111111111/a.3mf') = 1, 'arquivo de A intacto');
select pg_temp.assert((select public from storage.buckets where id = 'model-files') = false, 'bucket é privado');
select pg_temp.assert((select file_size_limit from storage.buckets where id = 'model-files') = 52428800, 'limite de 50 MB no bucket');

-- ═════ Precificação ligada ao perfil ═════
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.products (id, name) values ('aaaaaaaa-0000-0000-0000-0000000000f1', 'Produto do perfil');
insert into public.pricings (id, product_id, print_profile_id, quantity, pricing_mode, unit_cost, unit_price, unit_profit, margin_percent, markup_percent, input, result, import_info)
values ('bbbbbbbb-0000-0000-0000-0000000000f1', 'aaaaaaaa-0000-0000-0000-0000000000f1', 'dddddddd-0000-0000-0000-000000000001', 1, 'margin', 10, 20, 5, 25, 50, '{}', '{}', '{"weightOrigin":"manual"}');
select pg_temp.assert((select count(*) from public.pricings where id = 'bbbbbbbb-0000-0000-0000-0000000000f1') = 1, 'A precifica usando o próprio perfil');

-- B não consegue ligar uma precificação própria ao perfil de A
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into public.products (id, name) values ('aaaaaaaa-0000-0000-0000-0000000000f2', 'Produto de B');
do $$ begin
  begin
    insert into public.pricings (product_id, print_profile_id, quantity, pricing_mode, unit_cost, unit_price, unit_profit, margin_percent, markup_percent, input, result)
    values ('aaaaaaaa-0000-0000-0000-0000000000f2', 'dddddddd-0000-0000-0000-000000000001', 1, 'margin', 1, 2, 1, 50, 100, '{}', '{}');
    raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;

-- apagar o modelo remove perfis, mas o histórico de preços permanece (vínculo vira NULL)
reset role; set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
delete from public.imported_models where id = 'cccccccc-0000-0000-0000-000000000001';
select pg_temp.assert((select count(*) from public.print_profiles) = 0, 'apagar modelo apaga os perfis');
select pg_temp.assert((select print_profile_id from public.pricings where id = 'bbbbbbbb-0000-0000-0000-0000000000f1') is null, 'precificação permanece, vínculo vira NULL');
select pg_temp.assert((select unit_price from public.pricings where id = 'bbbbbbbb-0000-0000-0000-0000000000f1') = 20, 'preço salvo não muda');

-- ═════ Produto ligado ao modelo ═════
reset role; delete from public.products where user_id = '11111111-1111-1111-1111-111111111111';
update public.subscriptions set trial_ends_at = now() + interval '5 days' where status = 'trialing';
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.imported_models (id, title, source) values ('cccccccc-0000-0000-0000-000000000002', 'Modelo para produto', 'manual');
insert into public.products (id, name, model_id) values ('aaaaaaaa-0000-0000-0000-0000000000f3', 'Produto com modelo', 'cccccccc-0000-0000-0000-000000000002');
select pg_temp.assert((select count(*) from public.products where id = 'aaaaaaaa-0000-0000-0000-0000000000f3') = 1, 'A liga produto ao próprio modelo');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  begin insert into public.products (name, model_id) values ('invasor', 'cccccccc-0000-0000-0000-000000000002'); raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
-- apagar o modelo não apaga o produto
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
delete from public.imported_models where id = 'cccccccc-0000-0000-0000-000000000002';
select pg_temp.assert((select model_id from public.products where id = 'aaaaaaaa-0000-0000-0000-0000000000f3') is null, 'produto permanece, vínculo vira NULL');

-- ═════ Limite de armazenamento por plano ═════
reset role;
select pg_temp.assert((select limits ->> 'max_storage_mb' from public.plans where code = 'trial') = '50', 'plano trial tem limite de armazenamento');
delete from storage.objects;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- consumo atual = 0: pode enviar
insert into storage.objects (bucket_id, name, metadata) values ('model-files', '11111111-1111-1111-1111-111111111111/grande.3mf', '{"size": 60000000}');
select pg_temp.assert(public.storage_used_bytes() = 60000000, 'consumo é somado dos tamanhos reais');
-- 60 MB > 50 MB do trial: o próximo envio é bloqueado pela policy
do $$ begin
  begin insert into storage.objects (bucket_id, name, metadata) values ('model-files', '11111111-1111-1111-1111-111111111111/outro.3mf', '{"size": 10}'); raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
-- apagar libera espaço
delete from storage.objects where name like '%grande.3mf';
insert into storage.objects (bucket_id, name, metadata) values ('model-files', '11111111-1111-1111-1111-111111111111/pequeno.3mf', '{"size": 1000}');
select pg_temp.assert((select count(*) from storage.objects) = 1, 'após apagar, volta a aceitar envios');
-- ninguém consulta o consumo de outro usuário
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.assert(public.can_store_upload('11111111-1111-1111-1111-111111111111') = false, 'consumo de terceiros não é consultável');
-- anônimo não executa as funções
reset role; set role anon;
do $$ begin
  begin perform public.storage_used_bytes('11111111-1111-1111-1111-111111111111'); raise exception 'deveria ter falhado';
  exception when sqlstate '42501' then null; end;
end $$;
reset role;

-- assinatura expirada bloqueia novos modelos
reset role;
update public.subscriptions set trial_ends_at = now() - interval '1 day' where user_id = '11111111-1111-1111-1111-111111111111';
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  begin insert into public.imported_models (title, source) values ('x', 'manual'); raise exception 'deveria ter falhado';
  exception when sqlstate 'P0001' then null; end;
end $$;
reset role;
\echo 'RLS importação OK'
