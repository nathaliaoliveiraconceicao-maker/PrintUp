-- Roda por último (depois da migration 0010). Superadmin: acesso, papéis, usuários, planos, assinaturas, cupons, privacidade, auditoria.
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as
$$ begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; end $$;
-- Executa SQL que DEVE falhar com o sqlstate esperado (e, opcionalmente, a mensagem). Sem exceção → falha o teste.
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

\set ADM 'a0000000-0000-0000-0000-000000000001'
\set U1  'a0000000-0000-0000-0000-000000000002'
\set U2  'a0000000-0000-0000-0000-000000000003'
\set U3  'a0000000-0000-0000-0000-000000000004'
\set ASADMIN 'set role authenticated; set request.jwt.claim.sub = ''a0000000-0000-0000-0000-000000000001''; set request.jwt.claim.role = ''authenticated'';'
\set ASSU 'reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;'
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
update public.platform_settings set value = 'true' where key = 'trial_enabled';

insert into auth.users (id, email) values (:'ADM', 'dona@printup.test'), (:'U1', 'cliente1@exemplo.com'), (:'U2', 'cliente2@exemplo.com'), (:'U3', 'cliente3@exemplo.com');
select pg_temp.assert((select role::text from public.profiles where id = :'ADM') = 'customer', 'ninguém nasce superadmin');

-- ═════ Papel: só o procedimento administrativo concede ═════
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002'; set request.jwt.claim.role = 'authenticated';
select pg_temp.denied($$update public.profiles set role = 'superadmin' where id = auth.uid()$$, '42501', 'Alteração de papel não permitida');
select pg_temp.denied($$select public.grant_superadmin('cliente1@exemplo.com')$$);
select pg_temp.denied($$select public.admin_overview(now() - interval '30 days', now())$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select * from public.admin_list_users()$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select public.admin_user_detail('a0000000-0000-0000-0000-000000000003')$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select * from public.admin_list_subscriptions()$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select * from public.admin_list_plans()$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select public.admin_update_plan('pro', '{"price_cents": 1}')$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select public.admin_grant_courtesy('a0000000-0000-0000-0000-000000000003', 'pro', 30, 'teste')$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select public.admin_schedule_cancel('a0000000-0000-0000-0000-000000000003', 'teste')$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select public.admin_create_coupon('ABCD1234', null, 'pro', 10, null, 1, null, null)$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select public.admin_set_setting('trial_enabled', 'false')$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select public.admin_usage_metrics()$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select public.admin_monitoring()$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select * from public.admin_list_audit()$$, '42501', 'Acesso restrito');
select pg_temp.denied($$select public.admin_log('x.y.z', null, null)$$);
select pg_temp.denied($$select * from public.admin_states()$$);
select pg_temp.denied($$select count(*) from public.coupons$$);
select pg_temp.denied($$select count(*) from public.coupon_redemptions$$);
select pg_temp.denied($$select count(*) from public.app_events$$);
select pg_temp.denied($$insert into public.admin_audit_log (action) values ('forjado')$$);
select pg_temp.assert((select count(*) from public.admin_audit_log) = 0, 'cliente não lê a auditoria administrativa');
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;

-- visitante anônimo nem executa
set role anon;
select pg_temp.denied($$select public.admin_overview(now() - interval '30 days', now())$$);
select pg_temp.denied($$select public.redeem_coupon('QUALQUER')$$);
reset role;

-- Concessão pelo procedimento seguro (SQL Editor / service_role) e auditoria do papel
select public.grant_superadmin('DONA@printup.test');
select pg_temp.assert((select role::text from public.profiles where id = :'ADM') = 'superadmin', 'grant_superadmin concede o papel');
select pg_temp.assert((select count(*) from public.admin_audit_log where action = 'papel.alterado' and entity_id = :'ADM' and details ->> 'para' = 'superadmin' and actor_kind = 'sistema') = 1, 'mudança de papel foi auditada');
select pg_temp.denied($$select public.grant_superadmin('naoexiste@x.com')$$, 'P0001');
select pg_temp.denied($$select public.revoke_superadmin('dona@printup.test')$$, 'P0001', 'Não é possível remover o último superadmin');

-- Superadmin também não muda papéis pelo app nem se rebaixa/promove ninguém
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001'; set request.jwt.claim.role = 'authenticated';
select pg_temp.denied($$update public.profiles set role = 'customer' where id = auth.uid()$$, '42501', 'Alteração de papel não permitida');
update public.profiles set role = 'superadmin' where id = 'a0000000-0000-0000-0000-000000000002';   -- RLS: só o próprio perfil → 0 linhas
select pg_temp.denied($$select public.grant_superadmin('cliente1@exemplo.com')$$);
-- sem leitura ampla: só o próprio perfil/assinatura/histórico pelas tabelas
select pg_temp.assert((select count(*) from public.profiles) = 1, 'superadmin não lê perfis alheios pela tabela');
select pg_temp.assert((select count(*) from public.subscriptions where user_id <> auth.uid()) = 0, 'superadmin não lê assinaturas alheias pela tabela');
select pg_temp.assert((select count(*) from public.products where user_id <> auth.uid()) = 0, 'superadmin não lê produtos dos clientes');
select pg_temp.assert((select count(*) from public.imported_models where user_id <> auth.uid()) = 0, 'superadmin não lê modelos importados dos clientes');
select pg_temp.denied($$select count(*) from public.coupons$$);
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
select pg_temp.assert((select role::text from public.profiles where id = 'a0000000-0000-0000-0000-000000000002') = 'customer', 'cliente continua cliente');

-- Dados privados de um cliente (para provar que a visão administrativa não os expõe)
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002'; set request.jwt.claim.role = 'authenticated';
insert into public.products (name) values ('Segredo-Comercial-123');
insert into public.printers (name) values ('Impressora-Privada-XYZ');
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;

-- ═════ Planos pagos para os indicadores (U1 mensal 49,90; U3 anual 499,00) ═════
create temp table tm as select date_trunc('second', now()) as t;
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001'; set request.jwt.claim.role = 'authenticated';
select (public.admin_overview(now() - interval '30 days', now() + interval '1 day') ->> 'mrr_cents')::bigint as mrr0,
       (public.admin_overview(now() - interval '30 days', now() + interval '1 day') ->> 'recebido_cents')::bigint as rec0 \gset
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
insert into public.billing_checkouts (id, user_id, plan_id, cycle, gateway) select 'cccccccc-0000-0000-0000-0000000000a1', :'U1', id, 'mensal', 'simulado' from public.plans where code = 'pro';
insert into public.billing_checkouts (id, user_id, plan_id, cycle, gateway) select 'cccccccc-0000-0000-0000-0000000000a3', :'U3', id, 'anual', 'simulado' from public.plans where code = 'business';
select public.apply_billing_event(jsonb_build_object('gateway','simulado','event_id','adm-ev1','type','charge.confirmed','occurred_at',(select t from tm) - interval '2 days','paid_at',(select t from tm) - interval '2 days',
  'gateway_subscription_id','sub_U1','gateway_charge_id','ch_U1','external_reference','cccccccc-0000-0000-0000-0000000000a1','amount_cents',4990,'method','cartao'));
select public.apply_billing_event(jsonb_build_object('gateway','simulado','event_id','adm-ev3','type','charge.confirmed','occurred_at',(select t from tm) - interval '2 days','paid_at',(select t from tm) - interval '2 days',
  'gateway_subscription_id','sub_U3','gateway_charge_id','ch_U3','external_reference','cccccccc-0000-0000-0000-0000000000a3','amount_cents',49900,'method','cartao'));

set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001'; set request.jwt.claim.role = 'authenticated';
-- ═════ Indicadores financeiros ═════
select pg_temp.assert((public.admin_overview(now() - interval '30 days', now() + interval '1 day') ->> 'mrr_cents')::bigint - :mrr0 = 4990 + 4158, 'MRR soma o mensal e o anual mensalizado (49,90 + 499,00/12)');
select pg_temp.assert((public.admin_overview(now() - interval '30 days', now() + interval '1 day') ->> 'arr_cents')::bigint = ((public.admin_overview(now() - interval '30 days', now() + interval '1 day') ->> 'mrr_cents')::bigint) * 12, 'ARR = MRR x 12');
select pg_temp.assert((public.admin_overview(now() - interval '30 days', now() + interval '1 day') ->> 'recebido_cents')::bigint - :rec0 = 4990 + 49900, 'receita recebida = cobranças confirmadas (não a projeção)');
select pg_temp.assert((public.admin_overview(now() + interval '1 day', now() + interval '2 days') ->> 'recebido_cents')::bigint = 0, 'receita recebida respeita o período');
select pg_temp.assert((public.admin_overview(now() - interval '30 days', now() + interval '1 day') ->> 'usuarios_total')::int >= 4, 'total de usuários');
select pg_temp.assert((public.admin_overview(now() - interval '30 days', now() + interval '1 day') -> 'por_estado' ->> 'ativo')::int >= 2, 'distribuição por estado conta as assinaturas ativas');
select pg_temp.assert((public.admin_overview(now() - interval '30 days', now() + interval '1 day') -> 'por_plano' ->> 'business')::int >= 1, 'distribuição por plano');
select pg_temp.denied($$select public.admin_overview(now(), now() - interval '1 day')$$, 'P0001', 'Período inválido');
-- trial e cortesia NÃO entram no MRR: U2 recebe cortesia Pro e o MRR não muda
select public.admin_grant_courtesy('a0000000-0000-0000-0000-000000000003', 'pro', 30, 'parceria de teste');
select pg_temp.assert((public.admin_overview(now() - interval '30 days', now() + interval '1 day') ->> 'mrr_cents')::bigint - :mrr0 = 4990 + 4158, 'cortesia não entra no MRR');

-- ═════ Consulta de usuários ═════
select pg_temp.assert((select count(*) from public.admin_list_users('cliente1')) = 1, 'busca por e-mail');
select pg_temp.assert((select count(*) from public.admin_list_users('%')) = 0, 'o caractere % não vira curinga');
select pg_temp.assert((select count(*) from public.admin_list_users(null, null, null, 2, 0)) = 2, 'paginação respeita o limite');
select pg_temp.assert((select count(*) from public.admin_list_users(null, null, null, 100000, 0)) <= 100, 'limite máximo de página é 100');
select pg_temp.assert((select products from public.admin_list_users('cliente1')) = 1 and (select printers from public.admin_list_users('cliente1')) = 1, 'lista mostra contagem de produtos e impressoras');
select pg_temp.assert((select state from public.admin_list_users('cliente3')) = 'ativo' and (select plan_code from public.admin_list_users('cliente3')) = 'business', 'plano e estado do cliente');
select pg_temp.assert((select count(*) from public.admin_list_users(null, 'business', 'ativo')) >= 1, 'filtro por plano e estado');
-- ═════ Privacidade: detalhe traz contagens, nunca conteúdo ═════
select pg_temp.assert(public.admin_user_detail('a0000000-0000-0000-0000-000000000002')::text not like '%Segredo-Comercial-123%' and public.admin_user_detail('a0000000-0000-0000-0000-000000000002')::text not like '%Impressora-Privada-XYZ%', 'detalhe não expõe nomes de produtos/impressoras');
select pg_temp.assert((public.admin_user_detail('a0000000-0000-0000-0000-000000000002') -> 'uso' ->> 'produtos')::int = 1, 'detalhe traz a quantidade de produtos');
select pg_temp.assert(public.admin_user_detail('a0000000-0000-0000-0000-000000000002')::text not ilike '%password%' and public.admin_user_detail('a0000000-0000-0000-0000-000000000002')::text not ilike '%token%', 'detalhe sem senhas/tokens');
select pg_temp.assert((select count(*) from public.admin_audit_log where action = 'usuario.consulta' and entity_id = 'a0000000-0000-0000-0000-000000000002') >= 1, 'consulta de usuário é auditada');
select pg_temp.denied($$select public.admin_user_detail(gen_random_uuid())$$, 'P0001', 'Usuário não encontrado');
select pg_temp.assert((select count(*) from public.products where name = 'Segredo-Comercial-123') = 0, 'superadmin não lê produtos pela tabela');

-- ═════ Planos ═════
select pg_temp.assert((select count(*) from public.admin_list_plans()) >= 4, 'lista de planos');
select pg_temp.assert((select price_cents from public.plans where code = 'pro') = 4990, 'preço atual do Pro');
select public.admin_update_plan('pro', '{"price_cents": 3990, "price_yearly_cents": 39900, "limits": {"max_products": 150, "max_printers": 3, "max_filaments": 30, "max_imports_month": 50, "max_pdf_month": 100, "max_storage_mb": 1000}}');
select pg_temp.assert((select price_cents from public.plans where code = 'pro') = 3990, 'preço do plano editado');
select pg_temp.assert((select (limits ->> 'max_products')::int from public.plans where code = 'pro') = 150, 'limites editados');
:ASSU
select pg_temp.assert((select amount_cents from public.billing_charges where gateway_charge_id = 'ch_U1') = 4990, 'preço novo NÃO altera cobranças existentes');
:ASADMIN
select pg_temp.assert((select count(*) from public.admin_audit_log where action = 'plano.alterado' and entity_id = 'pro' and (details -> 'antes' ->> 'price_cents')::int = 4990 and (details -> 'depois' ->> 'price_cents')::int = 3990) = 1, 'edição de plano auditada com antes/depois');
select pg_temp.assert((select plan_code from public.admin_list_users('cliente1')) = 'pro', 'assinatura existente continua no plano (sem migrar sozinha)');
select pg_temp.denied($$select public.admin_update_plan('pro', '{"price_cents": -5}')$$, 'P0001');
select pg_temp.denied($$select public.admin_update_plan('pro', '{"price_cents": "abc"}')$$, 'P0001');
select pg_temp.denied($$select public.admin_update_plan('pro', '{"limits": {"max_inventado": 3}}')$$, 'P0001', 'Limite desconhecido%');
select pg_temp.denied($$select public.admin_update_plan('pro', '{"features": {"quotes": "sim"}}')$$, 'P0001');
select pg_temp.denied($$select public.admin_update_plan('pro', '{"code": "outro"}')$$, 'P0001', 'Campo não editável%');
select pg_temp.denied($$select public.admin_update_plan('gratuito', '{"is_active": false}')$$, 'P0001', 'O plano Gratuito não pode ser desativado');
select pg_temp.denied($$select public.admin_update_plan('gratuito', '{"price_cents": 100}')$$, 'P0001');
select pg_temp.denied($$select public.admin_update_plan('inexistente', '{"name": "x"}')$$, 'P0001', 'Plano não encontrado');
-- sem UPDATE direto na tabela de planos
update public.plans set price_cents = 1 where code = 'business';
select pg_temp.assert((select price_cents from public.plans where code = 'business') = 9990, 'superadmin não altera planos fora da função auditada');
-- limites valem para o plano inteiro (política explícita): restaura
select public.admin_update_plan('pro', '{"price_cents": 4990, "price_yearly_cents": 49900, "limits": {"max_products": 200, "max_printers": 3, "max_filaments": 30, "max_imports_month": 50, "max_pdf_month": 100, "max_storage_mb": 1000}}');

-- ═════ Assinaturas ═════
select pg_temp.assert((select state from public.admin_list_subscriptions(null, 'cliente2')) = 'em_teste' and (select plan_code from public.admin_list_subscriptions(null, 'cliente2')) = 'pro', 'cortesia aparece como teste no plano Pro');
select pg_temp.assert((select last_paid_cents from public.admin_list_subscriptions(null, 'cliente1')) = 4990 and (select gateway_subscription_id from public.admin_list_subscriptions(null, 'cliente1')) = 'sub_U1', 'assinatura traz último pagamento e id do gateway');
:ASSU
select pg_temp.assert((select count(*) from public.subscription_changes where user_id = 'a0000000-0000-0000-0000-000000000003' and reason like 'cortesia (admin)%') >= 1, 'alteração administrativa fica no histórico da assinatura');
:ASADMIN
select pg_temp.denied($$select public.admin_grant_courtesy('a0000000-0000-0000-0000-000000000002', 'pro', 30, 'x motivo')$$, 'P0001', 'O cliente já tem assinatura paga%');
select pg_temp.denied($$select public.admin_grant_courtesy('a0000000-0000-0000-0000-000000000003', 'pro', 0, 'motivo')$$, 'P0001');
select pg_temp.denied($$select public.admin_grant_courtesy('a0000000-0000-0000-0000-000000000003', 'pro', 30, '')$$, 'P0001', 'Informe o motivo');
select pg_temp.denied($$select public.admin_grant_courtesy('a0000000-0000-0000-0000-000000000003', 'gratuito', 30, 'motivo')$$, 'P0001');
select pg_temp.denied($$select public.admin_schedule_cancel('a0000000-0000-0000-0000-000000000003', 'motivo')$$, 'P0001', 'O cliente não tem assinatura paga');
select public.admin_schedule_cancel('a0000000-0000-0000-0000-000000000002', 'pedido do cliente por e-mail');
select pg_temp.assert((select state from public.admin_list_subscriptions(null, 'cliente1')) = 'cancelamento_agendado', 'cancelamento agendado no fim do período');
select pg_temp.assert((public.admin_overview(now() - interval '30 days', now() + interval '1 day') ->> 'mrr_em_cancelamento_cents')::bigint >= 4990, 'MRR em cancelamento aparece à parte');
select public.admin_end_courtesy('a0000000-0000-0000-0000-000000000003', 'fim da parceria');
select pg_temp.assert((select state from public.current_entitlements('a0000000-0000-0000-0000-000000000003')) in ('expirado', 'gratuito'), 'cortesia encerrada');
select pg_temp.denied($$select public.admin_end_courtesy('a0000000-0000-0000-0000-000000000002', 'motivo')$$, 'P0001');
-- nenhuma forma de marcar pagamento como concluído / mexer na assinatura fora das funções
update public.billing_charges set status = 'estornada', amount_cents = 1 where gateway_charge_id = 'ch_U1';
:ASSU
select pg_temp.assert((select count(*) from public.billing_charges where amount_cents = 1) = 0 and (select status from public.billing_charges where gateway_charge_id = 'ch_U1') = 'recebida', 'superadmin não altera cobranças');
:ASADMIN
update public.subscriptions set plan_id = (select id from public.plans where code = 'business') where user_id = 'a0000000-0000-0000-0000-000000000002';
select pg_temp.assert((select plan_code from public.admin_list_subscriptions(null, 'cliente1')) = 'pro', 'superadmin não troca plano fora da função');
select pg_temp.denied($$select public.apply_billing_event('{"gateway":"g","event_id":"x","type":"charge.confirmed"}'::jsonb)$$);
select pg_temp.denied($$insert into public.billing_charges (user_id, gateway, gateway_charge_id, amount_cents, status) values (auth.uid(), 'g', 'forjada', 100, 'recebida')$$);

-- ═════ Cupons ═════
select public.admin_create_coupon('promo-um', 'um uso só', 'pro', 14, null, 1, null, null);
select pg_temp.assert((select count(*) from public.admin_list_coupons() where code = 'PROMO-UM' and status = 'ativo') = 1, 'cupom criado (código em maiúsculas)');
select pg_temp.denied($$select public.admin_create_coupon('PROMO-UM', null, 'pro', 14, null, 1, null, null)$$, 'P0001', 'Já existe um cupom%');
select pg_temp.denied($$select public.admin_create_coupon('ab', null, 'pro', 14, null, 1, null, null)$$, 'P0001');
select pg_temp.denied($$select public.admin_create_coupon('SEMPLANO', null, 'gratuito', 14, null, 1, null, null)$$, 'P0001');
select pg_temp.denied($$select public.admin_create_coupon('SEMDIAS', null, 'pro', 0, null, 1, null, null)$$, 'P0001');
select pg_temp.denied($$select public.admin_create_coupon('LIMITE0', null, 'pro', 7, null, 0, null, null)$$, 'P0001');
select pg_temp.denied($$select public.admin_create_coupon('PERIODO1', null, 'pro', 7, null, 1, now(), now() - interval '1 day')$$, 'P0001');
select public.admin_create_coupon('EXPIRADO1', 'vencido', 'pro', 7, null, null, now() - interval '3 days', now() - interval '1 day');
select public.admin_create_coupon('FUTURO001', 'ainda não vale', 'pro', 7, null, null, now() + interval '2 days', null);
select public.admin_create_coupon('SOCLIENTE3', 'convite', 'pro', 7, 'Cliente3@Exemplo.com', null, null, null);
select public.admin_create_coupon('MUITOS-USOS', 'vários', 'pro', 7, null, 5, null, null);
select pg_temp.assert((select count(*) from public.admin_list_coupons() where code = 'EXPIRADO1' and status = 'expirado') = 1 and (select count(*) from public.admin_list_coupons() where code = 'FUTURO001' and status = 'agendado') = 1, 'status do cupom (expirado/agendado)');
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;

-- resgates pelo cliente
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003'; set request.jwt.claim.role = 'authenticated';
select pg_temp.denied($$select public.redeem_coupon('EXPIRADO1')$$, 'P0001', 'Código inválido ou expirado');
select pg_temp.denied($$select public.redeem_coupon('FUTURO001')$$, 'P0001', 'Código inválido ou expirado');
select pg_temp.denied($$select public.redeem_coupon('NAO-EXISTE')$$, 'P0001', 'Código inválido ou expirado');
select pg_temp.denied($$select public.redeem_coupon('SOCLIENTE3')$$, 'P0001', 'Código inválido ou expirado');   -- convite de outro e-mail
select pg_temp.denied($$select public.redeem_coupon(null)$$, 'P0001', 'Código inválido ou expirado');
select pg_temp.assert((public.redeem_coupon(' promo-um ') ->> 'plan_code') = 'pro', 'cupom válido libera o plano');
select pg_temp.assert((select plan_code || '/' || state from public.current_entitlements(auth.uid())) = 'pro/em_teste', 'cliente fica em teste no Pro');
select pg_temp.denied($$select public.redeem_coupon('PROMO-UM')$$, 'P0001', 'Você já usou este código');
select pg_temp.assert((select trial_ends_at from public.subscriptions where user_id = auth.uid() and status = 'trialing') > now() + interval '13 days', 'acesso do cupom vale pelos dias do cupom');
reset role;
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004'; set request.jwt.claim.role = 'authenticated';
select pg_temp.denied($$select public.redeem_coupon('MUITOS-USOS')$$, 'P0001', 'Você já tem uma assinatura paga');
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
select pg_temp.assert((select redeemed_count from public.coupons where code = 'PROMO-UM') = 1, 'contador de usos');
-- limite esgotado: outro cliente não consegue o cupom de 1 uso
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000005', 'cliente5@exemplo.com');
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000005'; set request.jwt.claim.role = 'authenticated';
select pg_temp.denied($$select public.redeem_coupon('PROMO-UM')$$, 'P0001', 'Código inválido ou expirado');
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
-- convite no e-mail certo (comparação sem diferenciar maiúsculas) por quem não tem plano pago
update public.subscriptions set status = 'canceled' where user_id = 'a0000000-0000-0000-0000-000000000004';
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004'; set request.jwt.claim.role = 'authenticated';
select pg_temp.assert((public.redeem_coupon('SOCLIENTE3') ->> 'days')::int = 7, 'convite resgatado pelo e-mail convidado');
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;

-- ═════ Configurações ═════
set role authenticated; set request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001'; set request.jwt.claim.role = 'authenticated';
select public.admin_set_setting('support_email', '"suporte@printup.test"');
select public.admin_set_setting('billing_grace_days', '10');
select pg_temp.assert((select value #>> '{}' from public.platform_settings where key = 'support_email') = 'suporte@printup.test', 'e-mail de suporte salvo');
select pg_temp.denied($$select public.admin_set_setting('billing_grace_days', '99')$$, 'P0001');
select pg_temp.denied($$select public.admin_set_setting('chave_inventada', '1')$$, 'P0001', 'Configuração desconhecida');
select pg_temp.denied($$select public.admin_set_setting('support_email', '"não-é-email"')$$, 'P0001', 'E-mail inválido');
select pg_temp.denied($$select public.admin_set_setting('terms_url', '"http://inseguro.com"')$$, 'P0001', 'Use um link https%');
select pg_temp.denied($$select public.admin_set_setting('trial_enabled', '"talvez"')$$, 'P0001');
update public.platform_settings set value = '0' where key = 'billing_grace_days';
select pg_temp.assert((select value #>> '{}' from public.platform_settings where key = 'billing_grace_days') = '10', 'superadmin não altera configurações fora da função');
select public.admin_set_setting('billing_grace_days', '7');
-- ═════ Uso e monitoramento ═════
select pg_temp.assert((public.admin_usage_metrics() ->> 'produtos')::int >= 1 and public.admin_usage_metrics() ? 'por_plano', 'métricas agregadas de uso');
select pg_temp.assert(public.admin_monitoring() ? 'webhooks_erro_7d' and public.admin_monitoring() ? 'eventos_recentes', 'monitoramento responde');
-- ═════ Auditoria ═════
select pg_temp.assert((select count(*) from public.admin_audit_log where action in ('plano.alterado', 'assinatura.cortesia', 'assinatura.cancelamento_agendado', 'assinatura.cortesia_encerrada', 'cupom.criado', 'configuracao.alterada')) >= 10, 'ações administrativas registradas');
select pg_temp.assert((select count(*) from public.admin_audit_log where actor_id = auth.uid() and actor_kind = 'superadmin') >= 10, 'auditoria registra quem agiu');
select pg_temp.assert((select count(*) from public.admin_list_audit('cupom.criado')) = 5, 'listagem de auditoria com filtro');
select pg_temp.denied($$update public.admin_audit_log set action = 'adulterado'$$, '42501');
select pg_temp.denied($$delete from public.admin_audit_log$$, '42501');
reset role; reset request.jwt.claim.sub; reset request.jwt.claim.role;
select pg_temp.denied($$update public.admin_audit_log set action = 'adulterado'$$, '42501', 'O registro de auditoria é imutável');
select pg_temp.denied($$delete from public.admin_audit_log$$, '42501', 'O registro de auditoria é imutável');
select pg_temp.denied($$truncate public.admin_audit_log$$, '42501', 'O registro de auditoria é imutável');
-- segundo superadmin pode ser concedido e o primeiro rebaixado (nunca sobra zero)
select public.grant_superadmin('cliente5@exemplo.com');
select public.revoke_superadmin('dona@printup.test');
select pg_temp.denied($$select public.revoke_superadmin('cliente5@exemplo.com')$$, 'P0001', 'Não é possível remover o último superadmin');
select public.grant_superadmin('dona@printup.test');
select public.revoke_superadmin('cliente5@exemplo.com');
select pg_temp.assert((select count(*) from public.admin_audit_log where action = 'papel.alterado') >= 4, 'todas as trocas de papel auditadas');
\echo RLS superadmin OK
