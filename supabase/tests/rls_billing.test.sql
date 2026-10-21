-- Roda por último (depois da migration 0009). Planos, assinaturas, webhooks, cotas e acesso por recurso.
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; end $$;

\set E '55555555-5555-5555-5555-555555555555'
\set F '66666666-6666-6666-6666-666666666666'
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;

-- ═════ Planos vêm do banco (nada fixo no código) ═════
select pg_temp.assert((select count(*) from public.plans where code in ('gratuito', 'pro', 'business', 'trial')) = 4, 'planos gratuito, pro, business e trial existem');
select pg_temp.assert((select (limits ->> 'max_products')::int from public.plans where code = 'gratuito') = 5, 'limite de produtos do Gratuito vem da tabela');
select pg_temp.assert((select price_cents from public.plans where code = 'gratuito') = 0, 'Gratuito custa zero');

-- ═════ Cadastro: teste habilitado => em teste; desabilitado => Gratuito ═════
select pg_temp.assert((select state from public.current_entitlements('11111111-1111-1111-1111-111111111111')) in ('em_teste', 'expirado', 'gratuito'), 'usuários anteriores têm estado calculado');
update public.platform_settings set value = 'false' where key = 'trial_enabled';
insert into auth.users (id) values (:'E');
select pg_temp.assert(not exists (select 1 from public.subscriptions where user_id = :'E'), 'cadastro sem teste: nenhuma assinatura criada');
select pg_temp.assert((select plan_code || '/' || state from public.current_entitlements(:'E')) = 'gratuito/gratuito', 'cadastro cai no plano Gratuito');
update public.platform_settings set value = 'true' where key = 'trial_enabled';
insert into auth.users (id) values (:'F');
select pg_temp.assert((select plan_code || '/' || state from public.current_entitlements(:'F')) = 'trial/em_teste', 'com o teste habilitado, o cadastro começa em teste');
delete from public.subscriptions where user_id = :'F';

-- ═════ Gratuito: limites e recursos ═════
set role authenticated; set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555'; set request.jwt.claim.role = 'authenticated';
insert into public.products (name) select 'P' || g from generate_series(1, 5) g;
select pg_temp.assert((select count(*) from public.products) = 5, 'Gratuito cadastra até 5 produtos');
do $$ begin
  begin insert into public.products (name) values ('P6'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Limite do plano atingido (max_products)%' then raise; end if; end;
end $$;
insert into public.printers (name) values ('Uma');
do $$ begin
  begin insert into public.printers (name) values ('Duas'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
-- recursos pagos
do $$ begin
  begin perform public.save_order(null, '{"customer_name":"X","subtotal":10,"discount_total":0,"total":10}'::jsonb, '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"line_total":10}]'::jsonb);
    raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Recurso não disponível%(orders)%' then raise; end if; end;
end $$;
do $$ begin
  begin perform public.save_quote(null, '{"customer_name":"X","issue_date":"2026-01-10","valid_until":"2099-01-20","discount_type":"nenhum","discount_value":0,"subtotal":10,"discount_total":0,"total":10}'::jsonb, '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"discount_percent":0,"line_total":10}]'::jsonb);
    raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Recurso não disponível%(quotes)%' then raise; end if; end;
end $$;
do $$ begin
  begin perform public.create_spool(null, null, 'PLA', null, 1000, 100, null, null, null); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Recurso não disponível%(stock)%' then raise; end if; end;
end $$;
do $$ begin
  begin perform public.create_job(gen_random_uuid(), 1, null, null, null, null, 0, 'reservar'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Recurso não disponível%(production)%' then raise; end if; end;
end $$;
do $$ begin
  begin perform public.consume_quota('pdf_month', gen_random_uuid()); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Recurso não disponível%(quotes)%' then raise; end if; end;
end $$;
-- importações mensais: 3 por mês
insert into public.imported_models (title, source) values ('m1', 'manual'), ('m2', 'manual'), ('m3', 'manual');
do $$ begin
  begin insert into public.imported_models (title, source) values ('m4', 'manual'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Limite do plano atingido (max_imports_month)%' then raise; end if; end;
end $$;
-- histórico de precificações: só a primeira por produto no Gratuito
create temp table pr as select id from public.products limit 1;
insert into public.pricings (product_id, quantity, pricing_mode, unit_cost, unit_price, unit_profit, margin_percent, markup_percent, input, result)
select id, 1, 'margin', 1, 2, 1, 50, 100, '{}', '{}' from pr;
do $$ begin
  begin insert into public.pricings (product_id, quantity, pricing_mode, unit_cost, unit_price, unit_profit, margin_percent, markup_percent, input, result)
    select id, 1, 'margin', 1, 2, 1, 50, 100, '{}', '{}' from pg_temp.pr; raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Recurso não disponível%(pricing_history)%' then raise; end if; end;
end $$;
-- o cliente não mexe no próprio plano nem no financeiro
do $$ begin
  begin insert into public.subscriptions (user_id, plan_id, status) select auth.uid(), id, 'active' from public.plans where code = 'business'; raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;
do $$ begin
  begin perform public.apply_billing_event('{"gateway":"g","event_id":"x","type":"charge.confirmed"}'::jsonb); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;
select pg_temp.assert((select count(*) from public.billing_events) = 0, 'cliente não lê eventos de webhook');
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;

-- Linha do tempo relativa a AGORA (os estados dependem da data atual).
create temp table tm as select date_trunc('second', now()) as t;
create function pg_temp.ev(p_id text, p_type text, p_at timestamptz, p_extra jsonb default '{}') returns jsonb language sql as
$$ select jsonb_build_object('gateway', 'simulado', 'event_id', p_id, 'type', p_type, 'occurred_at', p_at, 'paid_at', p_at, 'gateway_subscription_id', 'sub_E') || p_extra $$;

-- ═════ Upgrade confirmado pelo gateway (webhook) ═════
insert into public.billing_checkouts (id, user_id, plan_id, cycle, gateway, gateway_ref)
select 'cccccccc-0000-0000-0000-0000000000e1', :'E', id, 'mensal', 'simulado', 'ref1' from public.plans where code = 'pro';
-- um evento que alega um plano diferente no payload não decide nada
select pg_temp.assert(public.apply_billing_event(pg_temp.ev('ev1', 'charge.confirmed', (select t from tm) - interval '5 days',
  '{"gateway_customer_id":"cus_E","gateway_charge_id":"ch_1","external_reference":"cccccccc-0000-0000-0000-0000000000e1","amount_cents":4990,"method":"cartao","plan_code":"business"}')) ->> 'result' = 'processado', 'pagamento confirmado é processado');
select pg_temp.assert((select plan_code || '/' || state from public.current_entitlements(:'E')) = 'pro/ativo', 'upgrade: plano vem do checkout (Pro), não do payload');
select pg_temp.assert((select count(*) from public.billing_charges where user_id = :'E' and status = 'recebida') = 1, 'cobrança registrada como recebida');
select pg_temp.assert((select status from public.billing_checkouts where id = 'cccccccc-0000-0000-0000-0000000000e1') = 'pago', 'checkout marcado como pago');
select pg_temp.assert((select count(*) from public.billing_customers where user_id = :'E') = 1, 'cliente do gateway vinculado');
select pg_temp.assert((select current_period_end from public.subscriptions where user_id = :'E') = (select t from tm) - interval '5 days' + interval '1 month', 'próximo vencimento = pagamento + 1 mês');
select pg_temp.assert((select count(*) from public.subscription_changes where user_id = :'E' and reason = 'webhook: charge.confirmed') = 1, 'histórico de alterações registrou o upgrade');

-- webhook duplicado
select pg_temp.assert(public.apply_billing_event(pg_temp.ev('ev1', 'charge.confirmed', (select t from tm) - interval '5 days', '{"gateway_charge_id":"ch_1","amount_cents":4990}')) ->> 'result' = 'duplicado', 'webhook duplicado é reconhecido');
select pg_temp.assert((select count(*) from public.billing_events where event_id = 'ev1') = 1 and (select count(*) from public.billing_charges where user_id = :'E') = 1 and (select count(*) from public.subscriptions where user_id = :'E') = 1, 'duplicado não cria nada de novo');

-- agora o usuário tem recursos do Pro
set role authenticated; set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555'; set request.jwt.claim.role = 'authenticated';
insert into public.products (name) values ('P6'), ('P7');
select pg_temp.assert((select count(*) from public.products) = 7, 'após o upgrade, passa do limite do Gratuito');
select public.save_order(null, '{"customer_name":"X","subtotal":10,"discount_total":0,"total":10}'::jsonb, '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"line_total":10}]'::jsonb) is not null as pedido_ok;
select pg_temp.assert((public.consume_quota('pdf_month', 'dddddddd-0000-0000-0000-0000000000a1') ->> 'consumed')::boolean, 'PDF consome cota');
select pg_temp.assert(not (public.consume_quota('pdf_month', 'dddddddd-0000-0000-0000-0000000000a1') ->> 'consumed')::boolean, 'o mesmo orçamento no mesmo mês não consome outra cota');
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
update public.plans set limits = limits || '{"max_pdf_month":2}' where code = 'pro';
set role authenticated; set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555'; set request.jwt.claim.role = 'authenticated';
select public.consume_quota('pdf_month', 'dddddddd-0000-0000-0000-0000000000a2');
do $$ begin
  begin perform public.consume_quota('pdf_month', 'dddddddd-0000-0000-0000-0000000000a3'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then if sqlerrm not like 'Limite do plano atingido (max_pdf_month)%' then raise; end if; end;
end $$;
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
update public.plans set limits = limits || '{"max_pdf_month":100}' where code = 'pro';

-- ═════ Eventos fora de ordem ═════
select public.apply_billing_event(pg_temp.ev('ev2', 'charge.confirmed', (select t from tm), '{"gateway_charge_id":"ch_2","amount_cents":4990}'));
select pg_temp.assert((select current_period_end from public.subscriptions where user_id = :'E') = (select t from tm) - interval '5 days' + interval '1 month' + interval '1 month', 'renovação estende o período a partir do fim anterior');
select pg_temp.assert(public.apply_billing_event(pg_temp.ev('ev3', 'charge.failed', (select t from tm) - interval '1 day', '{"gateway_charge_id":"ch_2","amount_cents":4990}')) ->> 'result' = 'ignorado_fora_de_ordem', 'evento de falha ANTERIOR à confirmação chega depois e é ignorado');
select pg_temp.assert((select status from public.subscriptions where user_id = :'E') = 'active' and (select status from public.billing_charges where gateway_charge_id = 'ch_2') = 'recebida', 'fora de ordem não desfaz o pagamento');

-- ═════ Falha de pagamento: carência e inadimplência ═════
select public.apply_billing_event(pg_temp.ev('ev4', 'charge.failed', (select t from tm) + interval '1 minute', '{"gateway_charge_id":"ch_3","amount_cents":4990,"method":"cartao"}'));
select pg_temp.assert((select status::text from public.subscriptions where user_id = :'E') = 'past_due', 'falha de pagamento: assinatura pendente');
update public.subscriptions set past_due_since = now() - interval '2 days' where user_id = :'E';
select pg_temp.assert((select plan_code || '/' || state from public.current_entitlements(:'E')) = 'pro/pagamento_pendente', 'dentro da carência mantém o plano');
update public.subscriptions set past_due_since = now() - interval '8 days' where user_id = :'E';
select pg_temp.assert((select plan_code || '/' || state from public.current_entitlements(:'E')) = 'gratuito/inadimplente', 'carência esgotada: inadimplente, com limites do Gratuito');
set role authenticated; set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555'; set request.jwt.claim.role = 'authenticated';
select pg_temp.assert((select count(*) from public.products) = 7 and (select count(*) from public.orders) = 1, 'inadimplente: os dados continuam visíveis (nada foi apagado)');
do $$ begin
  begin insert into public.products (name) values ('P8'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
do $$ begin
  begin perform public.save_order(null, '{"customer_name":"X","subtotal":10,"discount_total":0,"total":10}'::jsonb, '[{"kind":"personalizacao","name":"a","quantity":1,"unit_price":10,"line_total":10}]'::jsonb); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate 'P0001' then null; end;
end $$;
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
-- recuperação
select public.apply_billing_event(pg_temp.ev('ev5', 'charge.confirmed', (select t from tm) + interval '2 minutes', '{"gateway_charge_id":"ch_3","amount_cents":4990}'));
select pg_temp.assert((select plan_code || '/' || state from public.current_entitlements(:'E')) = 'pro/ativo' and (select past_due_since is null from public.subscriptions where user_id = :'E'), 'pagamento regularizado volta ao plano');

-- ═════ Downgrade agendado, aplicado na renovação ═════
update public.subscriptions set plan_id = (select id from public.plans where code = 'business'), pending_plan_id = (select id from public.plans where code = 'pro'), current_period_end = now() + interval '5 days' where user_id = :'E';
select pg_temp.assert((select pending_plan_code from public.current_entitlements(:'E')) = 'pro' and (select plan_code from public.current_entitlements(:'E')) = 'business', 'downgrade agendado: continua no plano atual até a renovação');
select public.apply_billing_event(pg_temp.ev('ev6', 'charge.confirmed', (select t from tm) + interval '3 minutes', '{"gateway_charge_id":"ch_4","amount_cents":4990}'));
select pg_temp.assert((select plan_code from public.current_entitlements(:'E')) = 'pro' and (select pending_plan_code from public.current_entitlements(:'E')) is null, 'na renovação o downgrade é aplicado');

-- ═════ Cancelamento ═════
select public.apply_billing_event(pg_temp.ev('ev7', 'subscription.canceled', (select t from tm) + interval '4 minutes', '{"cancel_at_period_end":true}'));
select pg_temp.assert((select plan_code || '/' || state from public.current_entitlements(:'E')) = 'pro/cancelamento_agendado', 'cancelamento agendado: mantém o plano até o fim do período pago');
update public.subscriptions set current_period_end = now() - interval '1 day' where user_id = :'E';
select pg_temp.assert((select plan_code || '/' || state from public.current_entitlements(:'E')) = 'gratuito/cancelado', 'depois do fim do período: Gratuito');
select public.apply_billing_event(pg_temp.ev('ev8', 'subscription.canceled', (select t from tm) + interval '5 minutes'));
select pg_temp.assert((select status::text from public.subscriptions where user_id = :'E') = 'canceled', 'cancelamento imediato registrado');
select pg_temp.assert((select count(*) from public.products where user_id = :'E') = 7 and (select count(*) from public.orders where user_id = :'E') = 1 and (select count(*) from public.billing_charges where user_id = :'E') >= 4, 'cancelar não apaga produtos, pedidos nem histórico de cobranças');
select pg_temp.assert((select count(*) from public.subscription_changes where user_id = :'E') >= 5, 'histórico de alterações da assinatura preservado');

-- ═════ Eventos que não podem ativar nada ═════
select pg_temp.assert(public.apply_billing_event(pg_temp.ev('ev9', 'charge.confirmed', (select t from tm), '{"gateway_subscription_id":"sub_NAO_EXISTE","gateway_charge_id":"ch_x","amount_cents":1}')) ->> 'result' = 'sem_usuario', 'evento sem assinatura/checkout conhecido não ativa ninguém');
select pg_temp.assert((select status from public.billing_events where event_id = 'ev9') = 'erro', 'evento órfão fica registrado como erro (para reconciliação)');
select pg_temp.assert((select count(*) from public.subscriptions where status = 'active') = 0 or not exists (select 1 from public.subscriptions s where s.gateway_subscription_id = 'sub_NAO_EXISTE'), 'nenhuma assinatura foi criada pelo evento órfão');
-- checkout de OUTRO usuário referenciado por evento: o plano vai para o dono do checkout, jamais para quem o evento "cita"
insert into public.billing_checkouts (id, user_id, plan_id, cycle, gateway) select 'cccccccc-0000-0000-0000-0000000000e2', :'F', id, 'anual', 'simulado' from public.plans where code = 'business';
select public.apply_billing_event(pg_temp.ev('ev10', 'charge.confirmed', (select t from tm) - interval '1 day', '{"gateway_subscription_id":"sub_F","gateway_charge_id":"ch_f","external_reference":"cccccccc-0000-0000-0000-0000000000e2","amount_cents":99900,"user_id":"55555555-5555-5555-5555-555555555555"}'));
select pg_temp.assert((select plan_code from public.current_entitlements(:'F')) = 'business' and (select count(*) from public.subscriptions where user_id = :'E' and status = 'active') = 0, 'o usuário vem do checkout, não do payload');
select pg_temp.assert((select current_period_end from public.subscriptions where user_id = :'F') = (select t from tm) - interval '1 day' + interval '1 year', 'ciclo anual: +1 ano');
-- isolamento financeiro
set role authenticated; set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555'; set request.jwt.claim.role = 'authenticated';
select pg_temp.assert((select count(*) from public.billing_charges where user_id <> auth.uid()) = 0 and (select count(*) from public.subscription_changes where user_id <> auth.uid()) = 0 and (select count(*) from public.billing_checkouts where user_id <> auth.uid()) = 0, 'cliente só vê o próprio financeiro');
update public.subscriptions set status = 'active'; update public.billing_charges set status = 'recebida'; delete from public.billing_charges;
select pg_temp.assert((select status::text from public.subscriptions where user_id = :'E') = 'canceled' and (select count(*) from public.billing_charges) >= 4, 'cliente não altera assinatura nem cobranças');
do $$ begin
  begin perform public.current_entitlements('66666666-6666-6666-6666-666666666666'); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
set role anon;
do $$ begin
  begin perform public.apply_billing_event('{}'::jsonb); raise exception 'deveria ter falhado' using errcode = 'XX999';
  exception when sqlstate '42501' then null; end;
end $$;
do $$ begin
  begin perform public.consume_quota('pdf_month', gen_random_uuid()); raise exception 'deveria ter falhado' using errcode = '42501';
  exception when sqlstate '42501' then null; end;
end $$;
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;

-- Preparação para a concorrência (dados confirmados): G no Gratuito com 4 de 5 produtos; H no Pro com cota de 1 PDF
insert into auth.users (id) values ('77777777-7777-7777-7777-777777777777'), ('88888888-8888-8888-8888-888888888888');
delete from public.subscriptions where user_id in ('77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888');
insert into public.products (user_id, name) select '77777777-7777-7777-7777-777777777777', 'G' || g from generate_series(1, 4) g;
insert into public.subscriptions (user_id, plan_id, status, billing_cycle, current_period_end, gateway, gateway_subscription_id)
select '88888888-8888-8888-8888-888888888888', id, 'active', 'mensal', now() + interval '20 days', 'simulado', 'sub_H' from public.plans where code = 'pro';
insert into public.billing_checkouts (id, user_id, plan_id, cycle, gateway) select 'cccccccc-0000-0000-0000-0000000000e3', '77777777-7777-7777-7777-777777777777', id, 'mensal', 'simulado' from public.plans where code = 'pro';
\echo 'RLS billing OK'
