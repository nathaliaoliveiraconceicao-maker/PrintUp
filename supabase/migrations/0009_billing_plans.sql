-- PrintUp · Etapa 6: planos configuráveis, assinaturas, cobranças, webhooks idempotentes e cotas à prova de concorrência.
--
-- Regras de acesso por estado (a fonte da verdade é `current_entitlements`):
--   gratuito               plano Gratuito (nunca assinou, trial acabou, cancelou ou expirou)
--   em_teste               trial vigente: limites e recursos do plano de teste
--   ativo                  plano contratado
--   cancelamento_agendado  plano contratado até o fim do período já pago; depois, Gratuito
--   pagamento_pendente     cobrança falhou, dentro da carência: mantém o plano
--   inadimplente           carência esgotada: limites e recursos do Gratuito (dados preservados e legíveis)
--   cancelado / expirado   Gratuito
-- Nada é apagado ao mudar de plano: só deixam de ser possíveis NOVOS cadastros acima do limite do plano efetivo.

-- ───────── Configuração da plataforma (chave/valor; só service_role altera) ─────────
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value) values
  ('billing_grace_days', '7'),
  ('trial_enabled', 'true')
on conflict (key) do nothing;

-- ───────── Planos: tudo configurável por dados (preços, limites, recursos) ─────────
alter table public.plans
  add column price_yearly_cents integer check (price_yearly_cents is null or price_yearly_cents >= 0),
  add column sort_order integer not null default 0,
  add column is_public boolean not null default true,
  add column highlight boolean not null default false,
  add column gateway_price_ids jsonb not null default '{}'::jsonb;

-- VALORES PROVISÓRIOS (decisão comercial pendente): ajuste nesta tabela, nunca no código.
-- Chaves de limite: max_products, max_printers, max_filaments, max_imports_month, max_pdf_month, max_storage_mb (null = ilimitado).
insert into public.plans (code, name, description, price_cents, price_yearly_cents, trial_days, limits, features, sort_order, is_public)
values
  ('gratuito', 'Gratuito', 'Para conhecer o PrintUp e precificar suas primeiras peças', 0, 0, 0,
   '{"max_products":5,"max_printers":1,"max_filaments":3,"max_imports_month":3,"max_pdf_month":0,"max_storage_mb":50}',
   '{"calculator":true,"import_models":true}', 0, true),
  ('business', 'Business', 'Para quem produz em escala, com mais impressoras e limites maiores', 9990, 99900, 0,
   '{"max_products":null,"max_printers":10,"max_filaments":null,"max_imports_month":500,"max_pdf_month":null,"max_storage_mb":5000}',
   '{"calculator":true,"import_models":true,"quotes":true,"pricing_history":true,"orders":true,"stock":true,"production":true,"reports":true,"production_advanced":true}', 30, true)
on conflict (code) do nothing;

update public.plans set
  name = 'Teste grátis', description = 'Avaliação com os recursos do Pro', sort_order = 5, is_public = false,
  limits = '{"max_products":200,"max_printers":3,"max_filaments":30,"max_imports_month":50,"max_pdf_month":100,"max_storage_mb":50}',
  features = '{"calculator":true,"import_models":true,"quotes":true,"pricing_history":true,"orders":true,"stock":true,"production":true}'
where code = 'trial';
update public.plans set
  name = 'Pro', description = 'Para quem vende com orçamentos, pedidos e estoque', price_yearly_cents = 49900, sort_order = 20, highlight = true,
  limits = '{"max_products":200,"max_printers":3,"max_filaments":30,"max_imports_month":50,"max_pdf_month":100,"max_storage_mb":1000}',
  features = '{"calculator":true,"import_models":true,"quotes":true,"pricing_history":true,"orders":true,"stock":true,"production":true}'
where code = 'pro';
-- O plano antigo "Iniciante" deixa de ser oferecido (quem já o tiver continua nele).
update public.plans set is_active = true, is_public = false, sort_order = 10,
  limits = limits || '{"max_imports_month":10,"max_pdf_month":20}',
  features = '{"calculator":true,"import_models":true,"quotes":true}'
where code = 'starter';
update public.plans set limits = limits - 'max_quotes' - 'max_models' - 'max_pricings';

-- ───────── Assinaturas: campos do ciclo de vida ─────────
alter table public.subscriptions
  add column billing_cycle text check (billing_cycle in ('mensal', 'anual')),
  add column pending_plan_id uuid references public.plans (id),
  add column past_due_since timestamptz,
  add column canceled_at timestamptz,
  add column last_event_at timestamptz;

-- Histórico de alterações (preenchido por gatilho, não pelo cliente).
create table public.subscription_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  from_plan text,
  to_plan text,
  from_status text,
  to_status text,
  cancel_at_period_end boolean,
  reason text,
  created_at timestamptz not null default now()
);
create index subscription_changes_user on public.subscription_changes (user_id, created_at desc);

create or replace function public.subscriptions_log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old_plan text; v_new_plan text;
begin
  select code into v_new_plan from public.plans where id = new.plan_id;
  if tg_op = 'UPDATE' then
    select code into v_old_plan from public.plans where id = old.plan_id;
    if old.plan_id is not distinct from new.plan_id and old.status is not distinct from new.status
       and old.cancel_at_period_end is not distinct from new.cancel_at_period_end
       and old.pending_plan_id is not distinct from new.pending_plan_id then
      return new;
    end if;
  end if;
  insert into public.subscription_changes (user_id, subscription_id, from_plan, to_plan, from_status, to_status, cancel_at_period_end, reason)
  values (new.user_id, new.id, v_old_plan, v_new_plan, case when tg_op = 'UPDATE' then old.status::text end, new.status::text,
          new.cancel_at_period_end, coalesce(nullif(current_setting('printup.change_reason', true), ''), 'sistema'));
  return new;
end $$;
create trigger subscriptions_log_change after insert or update on public.subscriptions
  for each row execute function public.subscriptions_log_change();

-- ───────── Clientes, checkouts, cobranças e uso ─────────
create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gateway text not null,
  gateway_customer_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, gateway),
  unique (gateway, gateway_customer_id)
);

-- Intenção de contratação. A assinatura só vira "ativa" quando o GATEWAY confirma o pagamento (webhook).
create table public.billing_checkouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  cycle text not null check (cycle in ('mensal', 'anual')),
  gateway text not null,
  gateway_ref text,
  checkout_url text,
  status text not null default 'aberto' check (status in ('aberto', 'pago', 'expirado', 'cancelado')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 days'
);
create index billing_checkouts_user on public.billing_checkouts (user_id, created_at desc);

create table public.billing_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid references public.subscriptions (id) on delete set null,
  gateway text not null,
  gateway_charge_id text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  status text not null check (status in ('pendente', 'recebida', 'falhou', 'vencida', 'estornada', 'cancelada')),
  method text check (method in ('cartao', 'pix', 'boleto')),
  due_date date,
  paid_at timestamptz,
  invoice_url text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  unique (gateway, gateway_charge_id)
);
create index billing_charges_user on public.billing_charges (user_id, created_at desc);

-- Eventos de webhook: um registro por evento (idempotência), com resultado do processamento.
alter table public.billing_events
  add column user_id uuid,
  add column status text not null default 'recebido' check (status in ('recebido', 'processado', 'ignorado', 'erro')),
  add column occurred_at timestamptz;
create index billing_events_status on public.billing_events (status, received_at);

-- Uso mensal (PDFs): uma linha por (métrica, referência, mês) — gerar o mesmo PDF de novo não consome outra cota.
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  metric text not null,
  ref_id uuid not null,
  period_start date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now(),
  unique (user_id, metric, ref_id, period_start)
);

-- ───────── Direitos efetivos ─────────
drop function public.current_entitlements(uuid);
create function public.current_entitlements(p_user uuid default auth.uid())
returns table (plan_code text, status text, state text, limits jsonb, features jsonb, active boolean,
               period_end timestamptz, cancel_at_period_end boolean, pending_plan_code text, billing_cycle text)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.subscriptions; p public.plans; f public.plans; pend text;
  v_grace integer := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'billing_grace_days'), 7);
  v_state text := 'gratuito'; v_paid boolean := false;
begin
  if p_user is distinct from auth.uid()
     and coalesce(auth.role(), 'service_role') <> 'service_role'
     and not public.is_superadmin() then
    raise exception 'Permissão negada' using errcode = '42501';
  end if;

  select * into f from public.plans where code = 'gratuito';
  p := f;
  select x.* into s from public.subscriptions x where x.user_id = p_user and x.status in ('trialing', 'active', 'past_due')
    order by x.created_at desc limit 1;
  if found then
    select * into p from public.plans where id = s.plan_id;
    if s.status = 'trialing' then
      if coalesce(s.trial_ends_at, now()) > now() then v_state := 'em_teste'; v_paid := true; else v_state := 'expirado'; end if;
    elsif s.status = 'active' then
      if s.cancel_at_period_end and coalesce(s.current_period_end, now()) <= now() then v_state := 'cancelado';
      elsif s.cancel_at_period_end then v_state := 'cancelamento_agendado'; v_paid := true;
      elsif s.current_period_end is not null and s.current_period_end < now() - make_interval(days => v_grace) then v_state := 'inadimplente';
      else v_state := 'ativo'; v_paid := true; end if;
    elsif s.status = 'past_due' then
      if coalesce(s.past_due_since, now()) + make_interval(days => v_grace) > now() then v_state := 'pagamento_pendente'; v_paid := true;
      else v_state := 'inadimplente'; end if;
    end if;
    select code into pend from public.plans where id = s.pending_plan_id;
  end if;

  return query select
    case when v_paid then p.code else f.code end,
    case when s.id is null then 'gratuito' else s.status::text end,
    v_state,
    case when v_paid then p.limits else f.limits end,
    case when v_paid then p.features else f.features end,
    true,
    s.current_period_end, coalesce(s.cancel_at_period_end, false), pend, s.billing_cycle;
end $$;
revoke execute on function public.current_entitlements(uuid) from public, anon;

create or replace function public.has_feature(p_feature text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (e.features ->> p_feature)::boolean from public.current_entitlements(auth.uid()) e), false)
$$;
revoke execute on function public.has_feature(text) from public, anon;

create or replace function public.assert_feature(p_feature text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  if not public.has_feature(p_feature) then
    raise exception 'Recurso não disponível no seu plano (%)', p_feature using errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.assert_feature(text) from public, anon;

-- Limite de armazenamento: usa o plano efetivo (o Gratuito também tem espaço).
create or replace function public.storage_limit_bytes(p_user uuid default auth.uid())
returns bigint language plpgsql stable security definer set search_path = public as $$
declare v record;
begin
  select * into v from public.current_entitlements(p_user);
  if not found then return 0; end if;
  if v.limits ->> 'max_storage_mb' is null then return null; end if;
  return (v.limits ->> 'max_storage_mb')::bigint * 1048576;
end $$;

-- ───────── Gatilhos de cota e de recurso ─────────
-- Total de linhas por usuário. A trava por (usuário, chave) faz dois cadastros simultâneos se enfileirarem:
-- sem ela, ambos contariam "limite − 1" e passariam.
create or replace function public.enforce_plan_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_key text := tg_argv[0]; v_ent record; v_limit text; v_count bigint;
begin
  select * into v_ent from public.current_entitlements(new.user_id);
  v_limit := v_ent.limits ->> v_key;
  if v_limit is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('quota:' || new.user_id::text || ':' || v_key));
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into v_count using new.user_id;
  if v_count >= v_limit::bigint then
    raise exception 'Limite do plano atingido (%)', v_key using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Limite mensal (ex.: importações): conta o que foi criado neste mês.
create or replace function public.enforce_monthly_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_key text := tg_argv[0]; v_ent record; v_limit text; v_count bigint;
begin
  select * into v_ent from public.current_entitlements(new.user_id);
  v_limit := v_ent.limits ->> v_key;
  if v_limit is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('quota:' || new.user_id::text || ':' || v_key));
  execute format('select count(*) from public.%I where user_id = $1 and created_at >= date_trunc(''month'', now())', tg_table_name)
    into v_count using new.user_id;
  if v_count >= v_limit::bigint then
    raise exception 'Limite do plano atingido (%)', v_key using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Recurso incluído no plano efetivo (criar novos registros; ver os existentes continua permitido).
create or replace function public.enforce_feature() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ent record;
begin
  select * into v_ent from public.current_entitlements(new.user_id);
  if not coalesce((v_ent.features ->> tg_argv[0])::boolean, false) then
    raise exception 'Recurso não disponível no seu plano (%)', tg_argv[0] using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Histórico de precificações: no Gratuito só a primeira de cada produto (as demais ficam para o Pro).
create or replace function public.enforce_pricing_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ent record;
begin
  select * into v_ent from public.current_entitlements(new.user_id);
  if not coalesce((v_ent.features ->> 'pricing_history')::boolean, false)
     and exists (select 1 from public.pricings where product_id = new.product_id) then
    raise exception 'Recurso não disponível no seu plano (pricing_history)' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists imported_models_limit on public.imported_models;
drop trigger if exists pricings_limit on public.pricings;
drop trigger if exists quotes_limit on public.quotes;
create trigger imported_models_feature before insert on public.imported_models for each row execute function public.enforce_feature('import_models');
create trigger imported_models_monthly before insert on public.imported_models for each row execute function public.enforce_monthly_limit('max_imports_month');
create trigger pricings_history before insert on public.pricings for each row execute function public.enforce_pricing_history();
create trigger quotes_feature before insert on public.quotes for each row execute function public.enforce_feature('quotes');
create trigger orders_feature before insert on public.orders for each row execute function public.enforce_feature('orders');

-- Funções de estoque e produção (SECURITY DEFINER) conferem o recurso do plano por dentro.
alter function public.create_spool(uuid, text, text, text, numeric, numeric, date, text, text, text) rename to create_spool_core;
create function public.create_spool(
  p_filament uuid, p_manufacturer text, p_material text, p_color text, p_initial_g numeric,
  p_price_paid numeric, p_purchased_at date, p_location text, p_notes text, p_key text default null
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_feature('stock');
  return public.create_spool_core(p_filament, p_manufacturer, p_material, p_color, p_initial_g, p_price_paid, p_purchased_at, p_location, p_notes, p_key);
end $$;
alter function public.create_job(uuid, integer, uuid, uuid, numeric, numeric, numeric, text) rename to create_job_core;
create function public.create_job(
  p_item uuid, p_qty integer, p_printer uuid, p_filament uuid, p_est_grams numeric, p_est_minutes numeric,
  p_waste_percent numeric default 0, p_mode text default 'reservar'
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_feature('production');
  return public.create_job_core(p_item, p_qty, p_printer, p_filament, p_est_grams, p_est_minutes, p_waste_percent, p_mode);
end $$;
revoke execute on function public.create_spool_core(uuid, text, text, text, numeric, numeric, date, text, text, text) from public, anon, authenticated;
revoke execute on function public.create_job_core(uuid, integer, uuid, uuid, numeric, numeric, numeric, text) from public, anon, authenticated;
revoke execute on function public.create_spool(uuid, text, text, text, numeric, numeric, date, text, text, text) from public, anon;
revoke execute on function public.create_job(uuid, integer, uuid, uuid, numeric, numeric, numeric, text) from public, anon;

-- Cota mensal de PDFs de orçamento: cada orçamento conta uma vez por mês; trava por usuário (sem corrida).
create or replace function public.consume_quota(p_metric text, p_ref uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_ent record; v_limit text; v_used bigint; v_period date := date_trunc('month', now())::date;
begin
  if v_uid is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  if p_metric not in ('pdf_month') then raise exception 'Métrica desconhecida' using errcode = 'P0001'; end if;
  select * into v_ent from public.current_entitlements(v_uid);
  if p_metric = 'pdf_month' and not coalesce((v_ent.features ->> 'quotes')::boolean, false) then
    raise exception 'Recurso não disponível no seu plano (quotes)' using errcode = 'P0001';
  end if;
  v_limit := v_ent.limits ->> ('max_' || p_metric);
  perform pg_advisory_xact_lock(hashtext('quota:' || v_uid::text || ':' || p_metric));
  if exists (select 1 from public.usage_events where user_id = v_uid and metric = p_metric and ref_id = p_ref and period_start = v_period) then
    return jsonb_build_object('consumed', false);
  end if;
  select count(*) into v_used from public.usage_events where user_id = v_uid and metric = p_metric and period_start = v_period;
  if v_limit is not null and v_used >= v_limit::bigint then
    raise exception 'Limite do plano atingido (max_%)', p_metric using errcode = 'P0001';
  end if;
  insert into public.usage_events (user_id, metric, ref_id, period_start) values (v_uid, p_metric, p_ref, v_period);
  return jsonb_build_object('consumed', true, 'used', v_used + 1);
end $$;
revoke execute on function public.consume_quota(text, uuid) from public, anon;

-- Novo usuário: perfil + (se o teste estiver habilitado) assinatura em teste; senão, direto no Gratuito.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan public.plans; v_trial boolean := coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'trial_enabled'), true);
begin
  insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name');
  if v_trial then
    select * into v_plan from public.plans where code = 'trial';
    if found then
      perform set_config('printup.change_reason', 'cadastro: teste grátis', true);
      insert into public.subscriptions (user_id, plan_id, status, trial_ends_at)
      values (new.id, v_plan.id, 'trialing', now() + make_interval(days => v_plan.trial_days));
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- Webhooks: aplica UM evento já verificado (autenticidade checada na aplicação, no corpo bruto).
-- Só o service_role executa. Idempotente (chave gateway+event_id), tolera eventos fora de ordem e nunca
-- confia em plano/usuário vindos do payload: o usuário sai da assinatura ou do checkout criados por nós.
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.apply_billing_event(p_event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_gateway text := p_event ->> 'gateway'; v_eid text := p_event ->> 'event_id'; v_type text := p_event ->> 'type';
  v_at timestamptz := coalesce(nullif(p_event ->> 'occurred_at', '')::timestamptz, now());
  v_ev uuid; s public.subscriptions; c public.billing_checkouts; ch public.billing_charges; v_user uuid;
  v_paid timestamptz := coalesce(nullif(p_event ->> 'paid_at', '')::timestamptz, v_at);
  v_cycle text; v_end timestamptz; v_status text; v_ref uuid; v_fresh boolean := true; v_amount integer;
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'Permissão negada' using errcode = '42501';
  end if;
  select * into s from public.subscriptions where false;
  select * into c from public.billing_checkouts where false;
  select * into ch from public.billing_charges where false;
  if v_gateway is null or v_eid is null or v_type is null then raise exception 'Evento inválido' using errcode = 'P0001'; end if;

  insert into public.billing_events (gateway, event_id, event_type, payload, occurred_at)
  values (v_gateway, v_eid, v_type, p_event - 'raw', v_at)
  on conflict (gateway, event_id) do nothing returning id into v_ev;
  if v_ev is null then return jsonb_build_object('result', 'duplicado'); end if;

  -- Quem é o usuário? Pela assinatura (id do gateway) ou pelo checkout que NÓS criamos (referência externa).
  if nullif(p_event ->> 'gateway_subscription_id', '') is not null then
    select * into s from public.subscriptions where gateway = v_gateway and gateway_subscription_id = p_event ->> 'gateway_subscription_id';
  end if;
  if s.id is null and nullif(p_event ->> 'external_reference', '') is not null then
    begin v_ref := (p_event ->> 'external_reference')::uuid; exception when others then v_ref := null; end;
    if v_ref is not null then select * into c from public.billing_checkouts where id = v_ref and gateway = v_gateway; end if;
  end if;
  v_user := coalesce(s.user_id, c.user_id);
  if v_user is null then
    update public.billing_events set status = 'erro', error = 'Usuário não encontrado para o evento', processed_at = now() where id = v_ev;
    return jsonb_build_object('result', 'sem_usuario');
  end if;
  perform pg_advisory_xact_lock(hashtext('billing:' || v_user::text));
  if s.id is not null then select * into s from public.subscriptions where id = s.id; end if;   -- relê já com a trava
  perform set_config('printup.change_reason', 'webhook: ' || v_type, true);

  -- Cobrança (cada ciclo): atualiza só se este evento for mais novo que o último visto dela.
  if v_type like 'charge.%' and nullif(p_event ->> 'gateway_charge_id', '') is not null then
    v_status := case v_type when 'charge.confirmed' then 'recebida' when 'charge.failed' then 'falhou' when 'charge.overdue' then 'vencida'
                            when 'charge.refunded' then 'estornada' when 'charge.canceled' then 'cancelada' else 'pendente' end;
    v_amount := coalesce((p_event ->> 'amount_cents')::integer, 0);
    select * into ch from public.billing_charges where gateway = v_gateway and gateway_charge_id = p_event ->> 'gateway_charge_id';
    if ch.id is null then
      insert into public.billing_charges (user_id, subscription_id, gateway, gateway_charge_id, amount_cents, status, method, due_date, paid_at, invoice_url, last_event_at)
      values (v_user, s.id, v_gateway, p_event ->> 'gateway_charge_id', v_amount, v_status, nullif(p_event ->> 'method', ''),
              nullif(p_event ->> 'due_date', '')::date, case when v_status = 'recebida' then v_paid end, nullif(p_event ->> 'invoice_url', ''), v_at);
    elsif coalesce(ch.last_event_at, '-infinity') <= v_at
          and not (ch.status = 'recebida' and v_status in ('falhou', 'vencida', 'pendente')) then
      update public.billing_charges set status = v_status, last_event_at = v_at,
        paid_at = case when v_status = 'recebida' then v_paid else paid_at end,
        method = coalesce(nullif(p_event ->> 'method', ''), method), invoice_url = coalesce(nullif(p_event ->> 'invoice_url', ''), invoice_url)
      where id = ch.id;
    else
      v_fresh := false;
    end if;
  end if;

  -- Assinatura: eventos mais antigos que o último aplicado não desfazem o estado atual.
  if s.id is not null and s.last_event_at is not null and v_at < s.last_event_at then v_fresh := false; end if;

  if v_type = 'charge.confirmed' and v_fresh then
    if c.id is not null and s.id is null then
      -- Primeira cobrança confirmada do checkout: AGORA o plano é ativado (plano e ciclo vêm do checkout, não do payload).
      v_cycle := c.cycle;
      v_end := v_paid + case v_cycle when 'anual' then interval '1 year' else interval '1 month' end;
      select * into s from public.subscriptions where user_id = v_user and status in ('trialing', 'active', 'past_due') order by created_at desc limit 1;
      if s.id is not null then
        update public.subscriptions set plan_id = c.plan_id, status = 'active', trial_ends_at = null, billing_cycle = v_cycle, current_period_end = v_end,
          cancel_at_period_end = false, pending_plan_id = null, past_due_since = null, canceled_at = null, gateway = v_gateway,
          gateway_customer_id = nullif(p_event ->> 'gateway_customer_id', ''), gateway_subscription_id = nullif(p_event ->> 'gateway_subscription_id', ''),
          last_event_at = v_at where id = s.id returning * into s;
      else
        insert into public.subscriptions (user_id, plan_id, status, billing_cycle, current_period_end, gateway, gateway_customer_id, gateway_subscription_id, last_event_at)
        values (v_user, c.plan_id, 'active', v_cycle, v_end, v_gateway, nullif(p_event ->> 'gateway_customer_id', ''), nullif(p_event ->> 'gateway_subscription_id', ''), v_at)
        returning * into s;
      end if;
      update public.billing_checkouts set status = 'pago' where id = c.id;
      if nullif(p_event ->> 'gateway_customer_id', '') is not null then
        insert into public.billing_customers (user_id, gateway, gateway_customer_id) values (v_user, v_gateway, p_event ->> 'gateway_customer_id') on conflict do nothing;
      end if;
      update public.billing_charges set subscription_id = s.id where gateway = v_gateway and gateway_charge_id = p_event ->> 'gateway_charge_id';
    elsif s.id is not null then
      -- Renovação: estende o período a partir do fim anterior; aplica downgrade agendado.
      v_end := coalesce(greatest(s.current_period_end, v_paid), v_paid) + case s.billing_cycle when 'anual' then interval '1 year' else interval '1 month' end;
      update public.subscriptions set status = 'active', current_period_end = v_end, past_due_since = null,
        plan_id = coalesce(pending_plan_id, plan_id), pending_plan_id = null, last_event_at = v_at where id = s.id;
      update public.billing_charges set subscription_id = s.id where gateway = v_gateway and gateway_charge_id = p_event ->> 'gateway_charge_id' and subscription_id is null;
    end if;
  elsif v_type in ('charge.failed', 'charge.overdue') and v_fresh and s.id is not null then
    update public.subscriptions set status = case when status = 'active' then 'past_due'::public.subscription_status else status end,
      past_due_since = case when status = 'active' then coalesce(past_due_since, v_at) else past_due_since end, last_event_at = v_at where id = s.id;
  elsif v_type = 'subscription.canceled' and v_fresh and s.id is not null then
    if coalesce((p_event ->> 'cancel_at_period_end')::boolean, false) then
      update public.subscriptions set cancel_at_period_end = true, last_event_at = v_at where id = s.id;
    else
      update public.subscriptions set status = 'canceled', canceled_at = v_at, cancel_at_period_end = false, pending_plan_id = null, last_event_at = v_at where id = s.id;
    end if;
  end if;

  update public.billing_events set user_id = v_user, status = case when v_fresh then 'processado' else 'ignorado' end, processed_at = now() where id = v_ev;
  return jsonb_build_object('result', case when v_fresh then 'processado' else 'ignorado_fora_de_ordem' end);
end $$;
revoke execute on function public.apply_billing_event(jsonb) from public, anon, authenticated;
grant execute on function public.apply_billing_event(jsonb) to service_role;

revoke execute on function public.enforce_monthly_limit() from public, anon, authenticated;
revoke execute on function public.enforce_feature() from public, anon, authenticated;
revoke execute on function public.enforce_pricing_history() from public, anon, authenticated;
revoke execute on function public.subscriptions_log_change() from public, anon, authenticated;

-- ───────── RLS ─────────
alter table public.platform_settings enable row level security;
alter table public.subscription_changes enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_checkouts enable row level security;
alter table public.billing_charges enable row level security;
alter table public.usage_events enable row level security;

-- Configuração: leitura pública (a página de planos precisa saber, por exemplo, se há teste grátis). NUNCA guardar segredos aqui.
-- Escrita só service_role (ignora RLS).
create policy platform_settings_select on public.platform_settings for select to anon, authenticated using (true);
-- O cliente só LÊ o próprio histórico financeiro; ninguém altera plano, cobrança ou uso pelo navegador.
create policy subscription_changes_select on public.subscription_changes for select to authenticated using (user_id = auth.uid());
create policy billing_customers_select on public.billing_customers for select to authenticated using (user_id = auth.uid());
create policy billing_checkouts_select on public.billing_checkouts for select to authenticated using (user_id = auth.uid());
create policy billing_charges_select on public.billing_charges for select to authenticated using (user_id = auth.uid());
create policy usage_events_select on public.usage_events for select to authenticated using (user_id = auth.uid());
