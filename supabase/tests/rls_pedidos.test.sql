-- Roda por último. Pedidos, produção e estoque (migration 0008).
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; end $$;

\set A '11111111-1111-1111-1111-111111111111'
\set B '22222222-2222-2222-2222-222222222222'

reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
update public.subscriptions set trial_ends_at = now() + interval '5 days', status = 'trialing' where user_id in (:'A', :'B');
delete from public.quotes where user_id in (:'A', :'B');
delete from public.products where user_id in (:'A', :'B');
delete from public.filaments where user_id in (:'A', :'B');
delete from public.printers where user_id in (:'A', :'B');

insert into public.printers (id, user_id, name) values ('a0000000-0000-0000-0000-000000000001', :'A', 'Impressora A');
insert into public.filaments (id, user_id, name, material, color, price_per_kg) values ('f0000000-0000-0000-0000-000000000001', :'A', 'PLA Preto', 'PLA', 'Preto', 100);
insert into public.products (id, user_id, name, weight_g, print_minutes, material_cost, machine_cost, other_costs, production_cost, sale_price, printer_id, filament_id)
values ('b0000000-0000-0000-0000-000000000001', :'A', 'Vaso', 100, 120, 10, 8, 3, 21, 50, 'a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001');

set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set request.jwt.claim.role = 'authenticated';

-- ═════ Pedido manual ═════
create temp table o1 as select public.save_order(null,
  '{"customer_name":"Ana","customer_phone":"11999990000","due_date":"2099-01-01","payment_method":"pix","notes":"","subtotal":225,"discount_total":22.5,"total":202.5}'::jsonb,
  '[{"kind":"produto","product_id":"b0000000-0000-0000-0000-000000000001","name":"Vaso","quantity":4,"unit_price":50,"discount_percent":0,"line_total":200},
    {"kind":"personalizacao","name":"Nome gravado","quantity":1,"unit_price":25,"discount_percent":0,"line_total":25}]'::jsonb) as id;
select pg_temp.assert((select number from public.orders where id = (select id from o1)) = 1, 'primeiro pedido é o nº 1');
select pg_temp.assert((select estimated_cost from public.orders where id = (select id from o1)) = 84, 'custo estimado = custo do produto × quantidade (R$ 84)');
select pg_temp.assert((select weight_g from public.order_items where order_id = (select id from o1) and kind = 'produto') = 100, 'item guarda o peso do produto');
select pg_temp.assert((select needs_production from public.order_items where order_id = (select id from o1) and kind = 'personalizacao') = false, 'personalização não vai para a produção');
select pg_temp.assert((select payment_status from public.orders where id = (select id from o1)) = 'pendente', 'pagamento começa pendente');
do $$ begin
  begin perform public.save_order(null, '{"customer_name":"X","subtotal":999,"discount_total":0,"total":999}'::jsonb,
    '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"line_total":10}]'::jsonb);
    raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
select pg_temp.assert((select count(*) from public.orders) = 1, 'totais que não fecham: nada fica gravado');
-- edição enquanto novo
select public.save_order((select id from o1), '{"customer_name":"Ana Souza","due_date":"2099-01-05","subtotal":225,"discount_total":22.5,"total":202.5}'::jsonb,
  '[{"kind":"produto","product_id":"b0000000-0000-0000-0000-000000000001","name":"Vaso","quantity":4,"unit_price":50,"line_total":200},
    {"kind":"personalizacao","name":"Nome gravado","quantity":1,"unit_price":25,"line_total":25}]'::jsonb);
select pg_temp.assert((select customer_name from public.orders where id = (select id from o1)) = 'Ana Souza', 'pedido novo é editável');
-- cliente de outro usuário não entra
do $$ begin
  begin update public.orders set customer_id = gen_random_uuid() where id = (select id from o1); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' or sqlstate '23503' then null; end;
end $$;

-- ═════ Estoque: bobinas, entradas e proteção do saldo ═════
create temp table sp as
  select public.create_spool('f0000000-0000-0000-0000-000000000001', 'Marca X', null, null, 1000, 100, '2026-01-10', 'Prateleira 1', null, 'k-sp1') as s1,
         public.create_spool('f0000000-0000-0000-0000-000000000001', 'Marca Y', 'PLA', 'Preto', 500, 60, '2026-01-11', 'Prateleira 2', null, 'k-sp2') as s2;
select pg_temp.assert((select remaining_g from public.filament_spools where id = (select s1 from sp)) = 1000, 'bobina nasce com o peso inicial');
select pg_temp.assert((select material || color from public.filament_spools where id = (select s1 from sp)) = 'PLAPreto', 'material e cor herdados do filamento');
select pg_temp.assert((select count(*) from public.stock_movements where kind = 'entrada') = 2, 'cada bobina gera uma entrada no livro-razão');
select pg_temp.assert(public.create_spool('f0000000-0000-0000-0000-000000000001', 'Marca X', null, null, 1000, 100, null, null, null, 'k-sp1') = (select s1 from sp), 'repetir a mesma operação não cria bobina duplicada');
select pg_temp.assert((select count(*) from public.filament_spools) = 2, 'continuam 2 bobinas');
do $$ begin
  begin update public.filament_spools set remaining_g = 99999 where id = (select s1 from sp); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
do $$ begin
  begin insert into public.filament_spools (material, initial_g, remaining_g) values ('PLA', 100, 100); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;
do $$ begin
  begin insert into public.stock_movements (spool_id, kind, balance_remaining, balance_reserved) values ((select s1 from sp), 'ajuste', 1, 0); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;
-- sem policy de UPDATE/DELETE: o livro-razão é imutável (0 linhas afetadas, nada muda)
update public.stock_movements set delta_remaining = 5;
delete from public.stock_movements;
select pg_temp.assert((select count(*) from public.stock_movements) = 2 and (select count(*) from public.stock_movements where delta_remaining = 5) = 0, 'livro-razão não pode ser alterado nem apagado pelo usuário');
update public.filament_spools set location = 'Gaveta 3' where id = (select s1 from sp);
select pg_temp.assert((select location from public.filament_spools where id = (select s1 from sp)) = 'Gaveta 3', 'dados descritivos da bobina são editáveis');

-- ═════ Produção: lotes, reserva, estoque insuficiente ═════
create temp table item1 as select id from public.order_items where order_id = (select id from o1) and kind = 'produto';
create temp table j1 as select public.create_job((select id from item1), 3, 'a0000000-0000-0000-0000-000000000001', null, null, null, 0, 'reservar') as id;
select pg_temp.assert((select est_grams from public.production_jobs where id = (select id from j1)) = 300, 'gramas estimadas = peso × quantidade (300 g)');
select pg_temp.assert((select est_minutes from public.production_jobs where id = (select id from j1)) = 360, 'tempo estimado = 360 min');
select pg_temp.assert((select sum(reserved_g) from public.filament_spools) = 300, 'material reservado: 300 g');
select pg_temp.assert((select sum(remaining_g) from public.filament_spools) = 1500, 'reservar NÃO baixa o estoque físico');
select pg_temp.assert((select count(*) from public.stock_movements where kind = 'reserva') >= 1, 'reserva registrada no livro-razão');
create temp table j2 as select public.create_job((select id from item1), 1, null, null, null, null, 0, 'reservar') as id;
select pg_temp.assert((select sum(reserved_g) from public.filament_spools) = 400, 'segundo lote reserva mais 100 g');
do $$ begin
  begin perform public.create_job((select id from item1), 1, null, null, null, null, 0, 'reservar'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Quantidade maior%' then raise; end if; end;
end $$;

-- pedido grande: 20 × 100 g = 2000 g > 1100 g livres
create temp table o2 as select public.save_order(null, '{"customer_name":"Bia","subtotal":1000,"discount_total":0,"total":1000}'::jsonb,
  '[{"kind":"produto","product_id":"b0000000-0000-0000-0000-000000000001","name":"Vaso","quantity":20,"unit_price":50,"line_total":1000}]'::jsonb) as id;
create temp table item2 as select id from public.order_items where order_id = (select id from o2);
do $$ begin
  begin perform public.create_job((select id from item2), 20, null, null, null, null, 0, 'reservar'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Estoque insuficiente: faltam 900%' then raise exception 'mensagem inesperada: %', sqlerrm; end if; end;
end $$;
select pg_temp.assert((select count(*) from public.production_jobs where order_item_id = (select id from item2)) = 0, 'estoque insuficiente: a tarefa não é criada');
select pg_temp.assert((select sum(reserved_g) from public.filament_spools) = 400, 'estoque insuficiente: nada foi reservado pela metade');
-- lote que atravessa duas bobinas: 12 × 100 g = 1200 g (livres: 600 + 500 = 1100) -> ainda insuficiente; 10 × 100 = 1000 g cabe
create temp table j3 as select public.create_job((select id from item2), 10, null, null, null, null, 0, 'reservar') as id;
select pg_temp.assert((select count(*) from public.job_reservations where job_id = (select id from j3)) = 2, 'a reserva atravessa 2 bobinas');
select pg_temp.assert((select sum(grams) from public.job_reservations where job_id = (select id from j3)) = 1000, 'reservou 1000 g no total');
select pg_temp.assert((select count(*) from public.filament_spools where reserved_g > remaining_g) = 0, 'nunca reserva além do físico');
-- sem reserva: cria mesmo assim; reservar depois só com estoque
create temp table j4 as select public.create_job((select id from item2), 5, null, null, null, null, 0, 'sem_reserva') as id;
select pg_temp.assert((select count(*) from public.job_reservations where job_id = (select id from j4)) = 0, 'tarefa criada sem reserva');
do $$ begin
  begin perform public.reserve_job((select id from j4)); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Estoque insuficiente%' then raise; end if; end;
end $$;
select public.create_spool('f0000000-0000-0000-0000-000000000001', 'Marca Z', null, null, 1000, 90, null, null, null, 'k-sp3');
select pg_temp.assert(public.reserve_job((select id from j4)) = 500, 'depois de comprar uma bobina, a reserva funciona');
-- libera e cancela o lote de 5 e o de 10 para seguir com valores simples
select public.cancel_job((select id from j4));
select public.cancel_job((select id from j3));
select public.cancel_job((select id from j3));
select pg_temp.assert((select sum(reserved_g) from public.filament_spools) = 400, 'cancelar tarefas libera o material reservado (e repetir não libera de novo)');

-- ═════ Andamento, consumo real diferente do previsto, falha ═════
select public.set_job_stage((select id from j1), 'imprimindo');
select pg_temp.assert((select status from public.orders where id = (select id from o1)) = 'em_producao', 'iniciar produção move o pedido para "em produção"');
do $$ begin
  begin update public.order_items set quantity = 1 where order_id = (select id from o1); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
do $$ begin
  begin update public.orders set total = 1, subtotal = 1 where id = (select id from o1); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
-- consumo real (340 g) > estimado (300 g); tempo real 400 min > 360
select public.complete_job((select id from j1), 340, 400, 'sobrou suporte');
select pg_temp.assert((select sum(remaining_g) from public.filament_spools where manufacturer in ('Marca X', 'Marca Y')) = 1160, 'estoque físico baixou o consumo REAL (340 g), não o estimado');
select pg_temp.assert((select sum(reserved_g) from public.filament_spools) = 100, 'a reserva do lote concluído foi liberada (sobra só o lote 2)');
select pg_temp.assert((select real_material_cost from public.production_jobs where id = (select id from j1)) = 34, 'custo real do material = gramas × preço pago por grama (R$ 34)');
select pg_temp.assert((select real_machine_cost from public.production_jobs where id = (select id from j1)) = 26.67, 'custo real da máquina acompanha o tempo real (8 × 3 × 400/360)');
select pg_temp.assert((select actual_grams from public.production_jobs where id = (select id from j1)) = 340, 'consumo real registrado');
select pg_temp.assert(public.complete_job((select id from j1), 340, 400, null) ->> 'already' = 'true', 'concluir de novo é reconhecido');
select pg_temp.assert((select sum(remaining_g) from public.filament_spools where manufacturer in ('Marca X', 'Marca Y')) = 1160, 'concluir de novo NÃO baixa o estoque outra vez');
select pg_temp.assert((select count(*) from public.stock_movements where job_id = (select id from j1) and kind = 'consumo') between 1 and 2, 'consumo registrado no livro-razão');
-- falha de impressão no lote 2
select pg_temp.assert(public.report_failure((select id from j2), 30, 20, 'descolou da mesa', 'k-f1') ->> 'duplicate' = 'false', 'falha registrada');
select pg_temp.assert((select failed_grams from public.production_jobs where id = (select id from j2)) = 30 and (select failed_count from public.production_jobs where id = (select id from j2)) = 1, 'falha acumulada na tarefa');
select pg_temp.assert((select sum(remaining_g) from public.filament_spools where manufacturer in ('Marca X', 'Marca Y')) = 1130, 'a falha baixa o material perdido do estoque');
select pg_temp.assert((select sum(reserved_g) from public.filament_spools) = 100, 'a reserva da reimpressão continua');
select pg_temp.assert(public.report_failure((select id from j2), 30, 20, 'descolou da mesa', 'k-f1') ->> 'duplicate' = 'true', 'repetir a mesma falha é ignorado');
select pg_temp.assert((select sum(remaining_g) from public.filament_spools where manufacturer in ('Marca X', 'Marca Y')) = 1130, 'falha duplicada não baixa duas vezes');
select pg_temp.assert((select failed_cost from public.production_jobs where id = (select id from j2)) = 3, 'custo da falha = 30 g × R$ 0,10');
select public.complete_job((select id from j2), 105, 130, null);
select pg_temp.assert((select status from public.orders where id = (select id from o1)) = 'pronto', 'todas as unidades concluídas: pedido fica "pronto"');
select pg_temp.assert((select count(*) from public.filament_spools where reserved_g <> 0) = 0, 'nenhuma reserva sobrando');
select pg_temp.assert((select sum(delta_remaining) from public.stock_movements where spool_id in (select id from public.filament_spools)) = (select sum(remaining_g) from public.filament_spools), 'livro-razão fecha com o saldo das bobinas');
select pg_temp.assert((select count(*) from public.filament_spools s where s.remaining_g <> (select sum(delta_remaining) from public.stock_movements m where m.spool_id = s.id)) = 0, 'cada bobina fecha com o seu livro-razão');

-- ═════ Pagamentos ═════
insert into public.order_payments (order_id, amount, method) values ((select id from o1), 100, 'pix');
select pg_temp.assert((select payment_status from public.orders where id = (select id from o1)) = 'parcial' and (select amount_paid from public.orders where id = (select id from o1)) = 100, 'pagamento parcial');
do $$ begin
  begin insert into public.order_payments (order_id, amount) values ((select id from o1), 150); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
insert into public.order_payments (order_id, amount, method) values ((select id from o1), 102.5, 'dinheiro');
select pg_temp.assert((select payment_status from public.orders where id = (select id from o1)) = 'pago', 'quitado');
insert into public.order_payments (order_id, kind, amount) values ((select id from o1), 'estorno', 50);
select pg_temp.assert((select payment_status from public.orders where id = (select id from o1)) = 'parcial' and (select amount_paid from public.orders where id = (select id from o1)) = 152.5, 'estorno reduz o recebido');
do $$ begin
  begin insert into public.order_payments (order_id, kind, amount) values ((select id from o1), 'estorno', 9999); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
do $$ begin
  begin update public.orders set amount_paid = 0; raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;

-- ═════ Entrega e cancelamento ═════
do $$ begin
  begin update public.orders set status = 'novo' where id = (select id from o1); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
update public.orders set status = 'entregue' where id = (select id from o1);
select pg_temp.assert((select delivered_at is not null from public.orders where id = (select id from o1)), 'pedido entregue');
do $$ begin
  begin perform public.cancel_order((select id from o1)); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;

create temp table j5 as select public.create_job((select id from item2), 4, null, null, null, null, 0, 'reservar') as id;
select pg_temp.assert((select sum(reserved_g) from public.filament_spools) = 400, 'lote do pedido 2 reservado');
do $$ begin
  begin update public.orders set status = 'cancelado' where id = (select id from o2); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
do $$ begin
  begin update public.orders set status = 'entregue' where id = (select id from o2); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
select public.cancel_order((select id from o2));
select pg_temp.assert((select status from public.orders where id = (select id from o2)) = 'cancelado', 'pedido cancelado');
select pg_temp.assert((select sum(reserved_g) from public.filament_spools) = 0, 'cancelar o pedido libera o estoque reservado');
select pg_temp.assert((select stage from public.production_jobs where id = (select id from j5)) = 'cancelado', 'tarefas do pedido cancelado são encerradas');
select public.cancel_order((select id from o2));
select pg_temp.assert((select count(*) from public.stock_movements where kind = 'liberacao' and job_id = (select id from j5)) = 1, 'cancelar de novo não libera duas vezes');
do $$ begin
  begin insert into public.order_payments (order_id, amount) values ((select id from o2), 10); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
do $$ begin
  begin perform public.create_job((select id from item2), 1, null, null, null, null, 0, 'reservar'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;

-- ajuste manual com registro
select public.adjust_spool((select s1 from sp), 400, 'contagem física', 'k-adj1');
select pg_temp.assert((select remaining_g from public.filament_spools where id = (select s1 from sp)) = 400, 'ajuste de saldo');
select public.adjust_spool((select s1 from sp), 400, 'contagem física', 'k-adj1');
select pg_temp.assert((select count(*) from public.stock_movements where kind = 'ajuste') = 1, 'ajuste repetido não gera segundo movimento');

-- ═════ Conversão de orçamento ═════
create temp table q1 as select public.save_quote(null,
  '{"customer_name":"Carla","customer_phone":"11988887777","issue_date":"2026-01-10","valid_until":"2099-01-20","production_days":5,"discount_type":"nenhum","discount_value":0,"subtotal":130,"discount_total":0,"total":130,"internal_cost_total":42}'::jsonb,
  '[{"kind":"produto","product_id":"b0000000-0000-0000-0000-000000000001","name":"Vaso","quantity":2,"list_price":50,"unit_price":50,"discount_percent":0,"line_total":100,"unit_cost":21},
    {"kind":"personalizacao","name":"Nome","quantity":1,"unit_price":30,"discount_percent":0,"line_total":30}]'::jsonb) as id;
do $$ begin
  begin perform public.convert_quote_to_order((select id from q1)); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Só orçamentos aprovados%' then raise; end if; end;
end $$;
update public.quotes set status = 'aprovado', decided_at = now() where id = (select id from q1);
create temp table cv as select public.convert_quote_to_order((select id from q1)) as r;
select pg_temp.assert((select (r ->> 'created')::boolean from cv), 'orçamento aprovado vira pedido');
select pg_temp.assert((select count(*) from public.order_items where order_id = ((select r ->> 'order_id' from cv)::uuid)) = 2, 'itens copiados');
select pg_temp.assert((select estimated_cost from public.orders where id = ((select r ->> 'order_id' from cv)::uuid)) = 42, 'custo estimado vem do orçamento (42)');
select pg_temp.assert((select total from public.orders where id = ((select r ->> 'order_id' from cv)::uuid)) = 130, 'total igual ao orçamento');
select pg_temp.assert((select due_date from public.orders where id = ((select r ->> 'order_id' from cv)::uuid)) = current_date + 5, 'prazo = hoje + prazo de produção do orçamento');
create temp table cv2 as select public.convert_quote_to_order((select id from q1)) as r;
select pg_temp.assert(not (select (r ->> 'created')::boolean from cv2) and (select r ->> 'order_id' from cv2) = (select r ->> 'order_id' from cv), 'converter de novo devolve o mesmo pedido (sem duplicar)');
select pg_temp.assert((select count(*) from public.orders where quote_id = (select id from q1)) = 1, 'um orçamento, um pedido');
do $$ begin
  begin insert into public.orders (quote_id, customer_name, subtotal, total) values ((select id from q1), 'dup', 0, 0); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when unique_violation then null; end;
end $$;
reset role;

-- exclusão de pedidos pelo usuário
do $$ begin
  begin delete from public.orders where id = (select id from pg_temp.o1); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
create temp table o3 as select public.save_order(null, '{"customer_name":"Del","subtotal":10,"discount_total":0,"total":10}'::jsonb,
  '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"line_total":10}]'::jsonb) as id;
delete from public.orders where id = (select id from o3);
select pg_temp.assert((select count(*) from public.orders where id = (select id from o3)) = 0, 'pedido novo, sem produção, pode ser excluído');
reset role;
create temp table ids as select (select id from public.order_items where product_id is not null limit 1) as item,
  (select id from public.production_jobs limit 1) as job, (select id from public.filament_spools limit 1) as spool,
  (select id from public.quotes limit 1) as quote, (select id from public.orders limit 1) as ord;
grant select on ids to authenticated;

-- ═════ B: isolamento ═════
set role authenticated; set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222'; set request.jwt.claim.role = 'authenticated';
select pg_temp.assert((select count(*) from public.orders) = 0 and (select count(*) from public.order_items) = 0 and (select count(*) from public.order_payments) = 0, 'B não vê pedidos, itens nem pagamentos de A');
select pg_temp.assert((select count(*) from public.production_jobs) = 0 and (select count(*) from public.job_reservations) = 0, 'B não vê tarefas de A');
select pg_temp.assert((select count(*) from public.filament_spools) = 0 and (select count(*) from public.stock_movements) = 0, 'B não vê bobinas nem movimentos de A');
update public.orders set notes = 'invadido'; delete from public.orders; update public.filament_spools set location = 'x'; delete from public.filament_spools;
insert into public.order_payments (order_id, amount) select id, 1 from public.orders;
do $$ begin
  begin insert into public.order_payments (order_id, amount) values ((select id from pg_temp.o1), 5); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' or sqlstate '42P01' then null; end;
end $$;
do $$ declare v_item uuid; v_job uuid; v_spool uuid; v_quote uuid; v_ord uuid;
begin
  select item, job, spool, quote, ord into v_item, v_job, v_spool, v_quote, v_ord from ids;
  begin perform public.create_job(v_item, 1, null, null, null, null, 0, 'sem_reserva'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.complete_job(v_job, 1, 1, null); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.set_job_stage(v_job, 'imprimindo'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.report_failure(v_job, 1, 1, null); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.cancel_job(v_job); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.adjust_spool(v_spool, 1, 'x'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.cancel_order(v_ord); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.convert_quote_to_order(v_quote); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0002' then null; end;
end $$;
-- B usa o filamento de A em uma bobina própria: recusado
do $$ begin
  begin perform public.create_spool('f0000000-0000-0000-0000-000000000001', null, null, null, 100, 10, null, null, null); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0002' then null; end;
end $$;
reset role;
select pg_temp.assert((select count(*) from public.orders where notes = 'invadido') = 0 and (select count(*) from public.filament_spools where user_id = :'A') = 3, 'nada de A foi alterado por B');

-- anônimo
set role anon;
do $$ begin
  begin perform public.create_job(gen_random_uuid(), 1, null, null, null, null, 0, 'reservar'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;
do $$ begin
  begin perform public.cancel_order(gen_random_uuid()); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;
do $$ begin
  begin perform public.stock_ledger_move(gen_random_uuid(), 'ajuste', 1, 0, null, null, null, null); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;
select pg_temp.assert((select count(*) from public.orders) = 0, 'anônimo não vê nada');
reset role;

-- Preparação para o teste de concorrência (dados confirmados; usado por concurrency.sh)
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
delete from public.orders where user_id = :'A';
delete from public.filament_spools where user_id = :'A';
delete from public.quotes where user_id = :'A';
insert into public.orders (id, user_id, customer_name, subtotal, total) values ('c0000000-0000-0000-0000-0000000000f1', :'A', 'Conc', 120, 120);
insert into public.order_items (id, user_id, order_id, kind, product_id, name, quantity, unit_price, line_total, weight_g, print_minutes, filament_id, needs_production)
values ('c0000000-0000-0000-0000-0000000000f2', :'A', 'c0000000-0000-0000-0000-0000000000f1', 'produto', 'b0000000-0000-0000-0000-000000000001', 'Vaso', 12, 10, 120, 100, 120, 'f0000000-0000-0000-0000-000000000001', true);
insert into public.quotes (id, user_id, customer_name, status, valid_until, subtotal, discount_total, total)
values ('c0000000-0000-0000-0000-0000000000f3', :'A', 'Conc', 'rascunho', current_date + 30, 50, 0, 50);
insert into public.quote_items (user_id, quote_id, kind, name, quantity, unit_price, line_total)
values (:'A', 'c0000000-0000-0000-0000-0000000000f3', 'personalizacao', 'Item', 1, 50, 50);
update public.quotes set status = 'aprovado' where id = 'c0000000-0000-0000-0000-0000000000f3';
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111'; set request.jwt.claim.role = 'authenticated';
select public.create_spool('f0000000-0000-0000-0000-000000000001', 'Conc', null, null, 1000, 100, null, null, null, 'k-conc') is not null as bobina;
reset role;
\echo 'RLS pedidos OK'
