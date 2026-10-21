-- PrintUp · Etapa 7: Superadmin e gestão do SaaS.
--
-- Princípios (inegociáveis):
--  * O papel `superadmin` NUNCA é escolhido pelo usuário: só muda via `grant_superadmin(email)`, que só o
--    SQL Editor / service_role executa (ver docs/SUPERADMIN.md). Toda mudança de papel é auditada por gatilho.
--  * O superadmin NÃO ganha leitura ampla nas tabelas dos clientes. Ele consulta SÓ por funções `admin_*`
--    (autorização no banco, paginadas, só contagens/metadados — nunca produtos, arquivos ou senhas) e cada
--    ação de escrita grava em `admin_audit_log` (imutável) na mesma transação.
--  * Nenhuma função marca pagamento como recebido: cobranças só mudam via `apply_billing_event` (webhook verificado).

-- ───────── Auditoria administrativa (imutável) ─────────
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,                                    -- null = procedimento via SQL/serviço
  actor_kind text not null default 'superadmin' check (actor_kind in ('superadmin', 'sistema')),
  action text not null check (char_length(action) between 3 and 80),
  entity text,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_audit_log_created on public.admin_audit_log (created_at desc);
create index admin_audit_log_action on public.admin_audit_log (action, created_at desc);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
create policy admin_audit_log_select on public.admin_audit_log for select to authenticated using (public.is_superadmin());
grant select on public.admin_audit_log to authenticated;

create function public.admin_audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'O registro de auditoria é imutável' using errcode = '42501'; end $$;
create trigger admin_audit_log_no_change before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_immutable();
create trigger admin_audit_log_no_truncate before truncate on public.admin_audit_log
  for each statement execute function public.admin_audit_immutable();

create function public.admin_log(p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into public.admin_audit_log (actor_id, actor_kind, action, entity, entity_id, details)
  values (auth.uid(), case when auth.uid() is null then 'sistema' else 'superadmin' end, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'));
$$;

create function public.assert_superadmin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_superadmin() then
    raise exception 'Acesso restrito' using errcode = '42501';
  end if;
end $$;

-- ───────── Papel: auditoria + fim das policies administrativas amplas ─────────
create function public.profiles_audit_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_log('papel.alterado', 'profiles', new.id::text, jsonb_build_object('de', old.role, 'para', new.role));
  return new;
end $$;
create trigger profiles_audit_role after update of role on public.profiles
  for each row when (old.role is distinct from new.role) execute function public.profiles_audit_role();

-- Cada um só lê/edita o PRÓPRIO perfil, assinatura e histórico; o superadmin usa funções auditadas.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid());
drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
drop policy subscriptions_admin_write on public.subscriptions;
drop policy subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select to authenticated using (user_id = auth.uid());
drop policy plans_admin_write on public.plans;
drop policy audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated using (user_id = auth.uid());

-- Primeiro superadmin / concessão: só service_role ou SQL Editor (sem JWT de usuário).
create function public.grant_superadmin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is not null or coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'Permissão negada' using errcode = '42501';
  end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'Nenhum usuário com este e-mail' using errcode = 'P0001'; end if;
  update public.profiles set role = 'superadmin' where id = v_id;
  if not found then raise exception 'Usuário sem perfil' using errcode = 'P0001'; end if;
end $$;

create function public.revoke_superadmin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is not null or coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'Permissão negada' using errcode = '42501';
  end if;
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then raise exception 'Nenhum usuário com este e-mail' using errcode = 'P0001'; end if;
  if (select count(*) from public.profiles where role = 'superadmin' and id <> v_id) = 0 then
    raise exception 'Não é possível remover o último superadmin' using errcode = 'P0001';
  end if;
  update public.profiles set role = 'customer' where id = v_id;
end $$;
revoke execute on function public.grant_superadmin(text), public.revoke_superadmin(text) from public, anon, authenticated;
revoke execute on function public.admin_log(text, text, text, jsonb), public.assert_superadmin(), public.profiles_audit_role(), public.admin_audit_immutable() from public, anon, authenticated;

-- ───────── Eventos operacionais (monitoramento) ─────────
-- Escritos pelo servidor (service_role). Mensagens curtas e SEM segredos/dados pessoais; meta só com ids e códigos.
create table public.app_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('importacao', 'pdf', 'pagamento', 'webhook', 'seguranca', 'sistema')),
  severity text not null default 'erro' check (severity in ('info', 'aviso', 'erro')),
  message text not null check (char_length(message) between 1 and 300),
  user_id uuid references auth.users (id) on delete set null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index app_events_kind on public.app_events (kind, created_at desc);
alter table public.app_events enable row level security;
revoke all on public.app_events from anon, authenticated;

-- ───────── Cupons e acessos promocionais ─────────
-- Um cupom libera um PLANO por N dias sem cobrança (teste grátis, cortesia, convite). Descontos em dinheiro NÃO existem
-- ainda (dependem do gateway real) e por isso não podem ser criados.
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{4,32}$'),
  description text check (char_length(description) <= 200),
  plan_id uuid not null references public.plans (id),
  days integer not null check (days between 1 and 365),
  restricted_email text check (restricted_email is null or restricted_email = lower(restricted_email)),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint coupons_limit_ok check (max_redemptions is null or redeemed_count <= max_redemptions),
  constraint coupons_period_ok check (valid_until is null or valid_until > valid_from)
);
create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (coupon_id, user_id)
);
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
revoke all on public.coupons, public.coupon_redemptions from anon, authenticated;

-- Resgate pelo próprio usuário. A linha do cupom é travada (FOR UPDATE): duas pessoas usando o último uso
-- ao mesmo tempo → só uma passa. Mensagem única para código inexistente/expirado/esgotado (não revela quais existem).
create function public.redeem_coupon(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); c public.coupons; v_email text; s public.subscriptions; v_end timestamptz;
  v_plan public.plans; v_has boolean;
begin
  if v_uid is null then raise exception 'Sessão expirada' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('billing:' || v_uid::text));
  select * into c from public.coupons where code = upper(trim(coalesce(p_code, ''))) for update;
  select lower(email) into v_email from auth.users where id = v_uid;
  if c.id is not null and exists (select 1 from public.coupon_redemptions where coupon_id = c.id and user_id = v_uid) then
    raise exception 'Você já usou este código' using errcode = 'P0001';
  end if;
  if c.id is null or not c.is_active or c.valid_from > now() or (c.valid_until is not null and c.valid_until <= now())
     or (c.max_redemptions is not null and c.redeemed_count >= c.max_redemptions)
     or (c.restricted_email is not null and c.restricted_email is distinct from v_email) then
    raise exception 'Código inválido ou expirado' using errcode = 'P0001';
  end if;
  select * into v_plan from public.plans where id = c.plan_id and is_active;
  if not found then raise exception 'Código inválido ou expirado' using errcode = 'P0001'; end if;

  select x.* into s from public.subscriptions x where x.user_id = v_uid and x.status in ('trialing', 'active', 'past_due') limit 1;
  v_has := found;
  if v_has and s.gateway_subscription_id is not null then
    raise exception 'Você já tem uma assinatura paga' using errcode = 'P0001';
  end if;
  v_end := now() + make_interval(days => c.days);
  perform set_config('printup.change_reason', 'cupom: ' || c.code, true);
  if v_has then
    update public.subscriptions set plan_id = c.plan_id, status = 'trialing', trial_ends_at = v_end where id = s.id;
  else
    insert into public.subscriptions (user_id, plan_id, status, trial_ends_at) values (v_uid, c.plan_id, 'trialing', v_end);
  end if;
  insert into public.coupon_redemptions (coupon_id, user_id) values (c.id, v_uid);
  update public.coupons set redeemed_count = redeemed_count + 1 where id = c.id;
  return jsonb_build_object('plan_code', v_plan.code, 'plan_name', v_plan.name, 'days', c.days, 'ends_at', v_end);
end $$;
revoke execute on function public.redeem_coupon(text) from public, anon;

-- ───────── Estados de todos os usuários (interno: só chamado por funções que já checaram o superadmin) ─────────
create function public.admin_states() returns table (user_id uuid, plan_code text, state text, limits jsonb, billing_cycle text, period_end timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, e.plan_code, e.state, e.limits, e.billing_cycle, e.period_end
  from public.profiles p cross join lateral public.current_entitlements(p.id) e;
$$;
revoke execute on function public.admin_states() from public, anon, authenticated;

-- ───────── Indicadores ─────────
-- MRR = soma mensalizada do valor REAL da última cobrança recebida (ou do plano, se ainda não houve) das assinaturas
-- pagas pelo gateway em estado ativo/pagamento pendente. Teste, cortesia e cupom não entram. Recebido = cobranças
-- efetivamente confirmadas no período (não é projeção).
create function public.admin_overview(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_mrr bigint; v_risk bigint; v_recv bigint; v_ref bigint; v_cancel integer; v_base integer;
  v_states jsonb; v_plans jsonb; v_total integer; v_new integer;
begin
  perform public.assert_superadmin();
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'Período inválido' using errcode = 'P0001'; end if;

  select count(*), count(*) filter (where created_at >= p_from and created_at < p_to) into v_total, v_new from public.profiles;
  select coalesce(jsonb_object_agg(state, n), '{}') into v_states from (select state, count(*) n from public.admin_states() group by state) t;
  select coalesce(jsonb_object_agg(plan_code, n), '{}') into v_plans from (select plan_code, count(*) n from public.admin_states() group by plan_code) t;

  with live as (
    select s.id, st.state, s.billing_cycle,
           coalesce((select c.amount_cents from public.billing_charges c where c.subscription_id = s.id and c.status = 'recebida'
                      order by c.paid_at desc nulls last limit 1),
                    case when s.billing_cycle = 'anual' then pl.price_yearly_cents else pl.price_cents end, 0) as amount
    from public.subscriptions s
    join public.plans pl on pl.id = s.plan_id
    join public.admin_states() st on st.user_id = s.user_id
    where s.status in ('active', 'past_due') and s.gateway_subscription_id is not null
  ), monthly as (select state, case when billing_cycle = 'anual' then round(amount / 12.0) else amount end as m from live)
  select coalesce(sum(m) filter (where state in ('ativo', 'pagamento_pendente')), 0),
         coalesce(sum(m) filter (where state = 'cancelamento_agendado'), 0) into v_mrr, v_risk from monthly;

  select coalesce(sum(amount_cents) filter (where status = 'recebida' and paid_at >= p_from and paid_at < p_to), 0),
         coalesce(sum(amount_cents) filter (where status = 'estornada' and last_event_at >= p_from and last_event_at < p_to), 0)
    into v_recv, v_ref from public.billing_charges;

  select count(distinct subscription_id) into v_cancel from public.subscription_changes
   where created_at >= p_from and created_at < p_to and subscription_id is not null
     and (to_status = 'canceled' or cancel_at_period_end is true)
     and exists (select 1 from public.subscriptions s where s.id = subscription_id and s.gateway_subscription_id is not null);
  select count(*) into v_base from public.subscriptions s
   where s.gateway_subscription_id is not null and s.created_at < p_from and (s.status in ('active', 'past_due') or s.canceled_at >= p_from);

  return jsonb_build_object(
    'periodo', jsonb_build_object('de', p_from, 'ate', p_to),
    'usuarios_total', v_total, 'usuarios_novos', v_new,
    'por_estado', v_states, 'por_plano', v_plans,
    'mrr_cents', v_mrr, 'arr_cents', v_mrr * 12, 'mrr_em_cancelamento_cents', v_risk,
    'recebido_cents', v_recv, 'estornado_cents', v_ref,
    'cancelamentos_periodo', v_cancel, 'base_inicio_periodo', v_base,
    'taxa_cancelamento', case when v_base > 0 then round(v_cancel::numeric / v_base, 4) end);
end $$;

-- ───────── Usuários (sem produtos/arquivos; só contagens) ─────────
create function public.admin_list_users(p_search text default null, p_plan text default null, p_state text default null,
                                        p_limit integer default 25, p_offset integer default 0)
returns table (user_id uuid, full_name text, email text, created_at timestamptz, last_sign_in_at timestamptz, plan_code text, state text,
               products integer, printers integer, filaments integer, max_products integer, max_printers integer, total bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_superadmin();
  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  return query
  with base as (
    select p.id, p.full_name, u.email::text as email, p.created_at, u.last_sign_in_at, st.plan_code, st.state, st.limits
    from public.profiles p
    join auth.users u on u.id = p.id
    join public.admin_states() st on st.user_id = p.id
    where (nullif(trim(p_search), '') is null
           or position(lower(trim(p_search)) in lower(coalesce(u.email, ''))) > 0
           or position(lower(trim(p_search)) in lower(coalesce(p.full_name, ''))) > 0)
      and (p_plan is null or st.plan_code = p_plan) and (p_state is null or st.state = p_state)
  )
  select b.id, b.full_name, b.email, b.created_at, b.last_sign_in_at, b.plan_code, b.state,
         (select count(*)::int from public.products x where x.user_id = b.id),
         (select count(*)::int from public.printers x where x.user_id = b.id),
         (select count(*)::int from public.filaments x where x.user_id = b.id),
         (b.limits ->> 'max_products')::int, (b.limits ->> 'max_printers')::int,
         count(*) over ()
  from base b order by b.created_at desc, b.id limit p_limit offset p_offset;
end $$;

create function public.admin_user_detail(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb; e record; s public.subscriptions;
begin
  perform public.assert_superadmin();
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'Usuário não encontrado' using errcode = 'P0001'; end if;
  select * into e from public.current_entitlements(p_user);
  select x.* into s from public.subscriptions x where x.user_id = p_user order by (x.status in ('trialing', 'active', 'past_due')) desc, x.created_at desc limit 1;
  v := jsonb_build_object(
    'perfil', (select jsonb_build_object('id', p.id, 'nome', p.full_name, 'negocio', p.business_name, 'papel', p.role, 'cadastro', p.created_at,
                                         'email', u.email, 'ultimo_acesso', u.last_sign_in_at)
               from public.profiles p join auth.users u on u.id = p.id where p.id = p_user),
    'plano', jsonb_build_object('codigo', e.plan_code, 'estado', e.state, 'fim_periodo', e.period_end, 'cancela_no_fim', e.cancel_at_period_end,
                                'plano_pendente', e.pending_plan_code, 'ciclo', e.billing_cycle, 'limites', e.limits, 'recursos', e.features),
    'uso', jsonb_build_object(
      'produtos', (select count(*) from public.products where user_id = p_user),
      'impressoras', (select count(*) from public.printers where user_id = p_user),
      'filamentos', (select count(*) from public.filaments where user_id = p_user),
      'modelos_importados', (select count(*) from public.imported_models where user_id = p_user),
      'precificacoes', (select count(*) from public.pricings where user_id = p_user),
      'orcamentos', (select count(*) from public.quotes where user_id = p_user),
      'pedidos', (select count(*) from public.orders where user_id = p_user),
      'armazenamento_bytes', public.storage_used_bytes(p_user)),
    'assinatura', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'plano', (select code from public.plans where id = s.plan_id), 'status', s.status, 'contratada_em', s.created_at,
      'proxima_cobranca', s.current_period_end, 'fim_teste', s.trial_ends_at, 'cancelada_em', s.canceled_at,
      'cancela_no_fim', s.cancel_at_period_end, 'gateway', s.gateway, 'gateway_assinatura', s.gateway_subscription_id) end,
    'mudancas', coalesce((select jsonb_agg(to_jsonb(c)) from (select from_plan, to_plan, from_status, to_status, reason, created_at
                           from public.subscription_changes where user_id = p_user order by created_at desc limit 20) c), '[]'),
    'cobrancas', coalesce((select jsonb_agg(to_jsonb(c)) from (select amount_cents, status, method, due_date, paid_at, gateway
                           from public.billing_charges where user_id = p_user order by coalesce(paid_at, created_at) desc limit 20) c), '[]'),
    'eventos', coalesce((select jsonb_agg(to_jsonb(c)) from (select gateway, event_type, status, occurred_at, error
                           from public.billing_events where user_id = p_user order by received_at desc limit 20) c), '[]'));
  perform public.admin_log('usuario.consulta', 'profiles', p_user::text, '{}');
  return v;
end $$;

-- ───────── Assinaturas ─────────
create function public.admin_list_subscriptions(p_state text default null, p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns table (user_id uuid, email text, full_name text, plan_code text, status text, state text, contracted_at timestamptz,
               next_charge timestamptz, last_paid_at timestamptz, last_paid_cents integer, canceled_at timestamptz,
               cancel_at_period_end boolean, gateway text, gateway_subscription_id text, total bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_superadmin();
  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  return query
  with latest as (
    select distinct on (s.user_id) s.* from public.subscriptions s
    order by s.user_id, (s.status in ('trialing', 'active', 'past_due')) desc, s.created_at desc
  ), rows as (
    select l.user_id, u.email::text as email, p.full_name, (select code from public.plans where id = l.plan_id) as plan_code,
           l.status::text as status, st.state, l.created_at as contracted_at, l.current_period_end as next_charge,
           (select c.paid_at from public.billing_charges c where c.subscription_id = l.id and c.status = 'recebida' order by c.paid_at desc nulls last limit 1) as last_paid_at,
           (select c.amount_cents from public.billing_charges c where c.subscription_id = l.id and c.status = 'recebida' order by c.paid_at desc nulls last limit 1) as last_paid_cents,
           l.canceled_at, l.cancel_at_period_end, l.gateway, l.gateway_subscription_id
    from latest l
    join public.profiles p on p.id = l.user_id
    join auth.users u on u.id = l.user_id
    join public.admin_states() st on st.user_id = l.user_id
    where (p_state is null or st.state = p_state)
      and (nullif(trim(p_search), '') is null or position(lower(trim(p_search)) in lower(coalesce(u.email, ''))) > 0
           or position(lower(trim(p_search)) in lower(coalesce(p.full_name, ''))) > 0)
  )
  select r.*, count(*) over () from rows r order by r.contracted_at desc, r.user_id limit p_limit offset p_offset;
end $$;

-- Cortesia: libera um plano por N dias SEM cobrança (nunca sobre uma assinatura paga no gateway).
create function public.admin_grant_courtesy(p_user uuid, p_plan_code text, p_days integer, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_plan public.plans; s public.subscriptions; v_end timestamptz; v_has boolean;
begin
  perform public.assert_superadmin();
  if p_days is null or p_days not between 1 and 365 then raise exception 'Informe de 1 a 365 dias' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Informe o motivo' using errcode = 'P0001'; end if;
  select * into v_plan from public.plans where code = p_plan_code and is_active and code <> 'gratuito';
  if not found then raise exception 'Plano inválido para cortesia' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'Usuário não encontrado' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('billing:' || p_user::text));
  select x.* into s from public.subscriptions x where x.user_id = p_user and x.status in ('trialing', 'active', 'past_due') limit 1;
  v_has := found;
  if v_has and s.gateway_subscription_id is not null then
    raise exception 'O cliente já tem assinatura paga; altere-a pelo gateway' using errcode = 'P0001';
  end if;
  v_end := now() + make_interval(days => p_days);
  perform set_config('printup.change_reason', 'cortesia (admin): ' || left(trim(p_reason), 120), true);
  if v_has then update public.subscriptions set plan_id = v_plan.id, status = 'trialing', trial_ends_at = v_end where id = s.id;
  else insert into public.subscriptions (user_id, plan_id, status, trial_ends_at) values (p_user, v_plan.id, 'trialing', v_end); end if;
  perform public.admin_log('assinatura.cortesia', 'subscriptions', p_user::text, jsonb_build_object('plano', v_plan.code, 'dias', p_days, 'motivo', left(trim(p_reason), 200)));
end $$;

create function public.admin_end_courtesy(p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.subscriptions;
begin
  perform public.assert_superadmin();
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Informe o motivo' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('billing:' || p_user::text));
  select x.* into s from public.subscriptions x where x.user_id = p_user and x.status = 'trialing' and x.gateway_subscription_id is null;
  if not found then raise exception 'Não há teste/cortesia ativo para encerrar' using errcode = 'P0001'; end if;
  perform set_config('printup.change_reason', 'cortesia encerrada (admin): ' || left(trim(p_reason), 120), true);
  update public.subscriptions set trial_ends_at = now() where id = s.id;
  perform public.admin_log('assinatura.cortesia_encerrada', 'subscriptions', p_user::text, jsonb_build_object('motivo', left(trim(p_reason), 200)));
end $$;

-- Cancelamento no fim do período de assinatura PAGA. Só registra aqui DEPOIS que o servidor confirmou o cancelamento
-- no gateway (mesma ordem do cancelamento feito pelo cliente). Não altera cobranças.
create function public.admin_schedule_cancel(p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.subscriptions;
begin
  perform public.assert_superadmin();
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Informe o motivo' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('billing:' || p_user::text));
  select x.* into s from public.subscriptions x where x.user_id = p_user and x.status in ('active', 'past_due') and x.gateway_subscription_id is not null;
  if not found then raise exception 'O cliente não tem assinatura paga' using errcode = 'P0001'; end if;
  perform set_config('printup.change_reason', 'cancelamento (admin): ' || left(trim(p_reason), 120), true);
  update public.subscriptions set cancel_at_period_end = true where id = s.id;
  perform public.admin_log('assinatura.cancelamento_agendado', 'subscriptions', p_user::text, jsonb_build_object('motivo', left(trim(p_reason), 200)));
end $$;

-- ───────── Planos ─────────
create function public.admin_list_plans() returns table (
  id uuid, code text, name text, description text, price_cents integer, price_yearly_cents integer, trial_days integer,
  limits jsonb, features jsonb, is_public boolean, is_active boolean, highlight boolean, sort_order integer, subscribers bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_superadmin();
  return query select p.id, p.code, p.name, p.description, p.price_cents, p.price_yearly_cents, p.trial_days, p.limits, p.features,
    p.is_public, p.is_active, p.highlight, p.sort_order,
    (select count(*) from public.subscriptions s where s.plan_id = p.id and s.status in ('trialing', 'active', 'past_due'))
  from public.plans p order by p.sort_order, p.code;
end $$;

-- Preços NÃO alteram assinaturas existentes (o valor cobrado já está no gateway). Limites e recursos valem para todos do plano.
create function public.admin_update_plan(p_code text, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  pl public.plans; k text; v jsonb; n integer;
  v_limit_keys text[] := array['max_products', 'max_printers', 'max_filaments', 'max_imports_month', 'max_pdf_month', 'max_storage_mb'];
  v_feature_keys text[] := array['calculator', 'import_models', 'quotes', 'pricing_history', 'orders', 'stock', 'production', 'reports', 'production_advanced'];
  v_allowed text[] := array['name', 'description', 'price_cents', 'price_yearly_cents', 'trial_days', 'limits', 'features', 'is_public', 'is_active', 'highlight', 'sort_order'];
  v_before jsonb; v_changed text[] := '{}';
begin
  perform public.assert_superadmin();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}' then raise exception 'Nada para alterar' using errcode = 'P0001'; end if;
  select * into pl from public.plans where code = p_code for update;
  if not found then raise exception 'Plano não encontrado' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any (v_allowed)) then raise exception 'Campo não editável: %', k using errcode = 'P0001'; end if;
  end loop;
  v_before := jsonb_build_object('name', pl.name, 'price_cents', pl.price_cents, 'price_yearly_cents', pl.price_yearly_cents, 'limits', pl.limits,
                                 'features', pl.features, 'is_public', pl.is_public, 'is_active', pl.is_active);

  if p_patch ? 'name' then
    if jsonb_typeof(p_patch -> 'name') <> 'string' or char_length(trim(p_patch ->> 'name')) not between 1 and 60 then raise exception 'Nome inválido (1 a 60 caracteres)' using errcode = 'P0001'; end if;
    pl.name := trim(p_patch ->> 'name');
  end if;
  if p_patch ? 'description' then
    if jsonb_typeof(p_patch -> 'description') not in ('string', 'null') or char_length(coalesce(p_patch ->> 'description', '')) > 300 then raise exception 'Descrição inválida (até 300 caracteres)' using errcode = 'P0001'; end if;
    pl.description := nullif(trim(coalesce(p_patch ->> 'description', '')), '');
  end if;
  if p_patch ? 'price_cents' then
    if jsonb_typeof(p_patch -> 'price_cents') <> 'number' or (p_patch ->> 'price_cents') !~ '^[0-9]{1,8}$' then raise exception 'Preço mensal inválido' using errcode = 'P0001'; end if;
    pl.price_cents := (p_patch ->> 'price_cents')::int;
  end if;
  if p_patch ? 'price_yearly_cents' then
    if jsonb_typeof(p_patch -> 'price_yearly_cents') = 'null' then pl.price_yearly_cents := null;
    elsif jsonb_typeof(p_patch -> 'price_yearly_cents') <> 'number' or (p_patch ->> 'price_yearly_cents') !~ '^[0-9]{1,8}$' then raise exception 'Preço anual inválido' using errcode = 'P0001';
    else pl.price_yearly_cents := (p_patch ->> 'price_yearly_cents')::int; end if;
  end if;
  if p_patch ? 'trial_days' then
    if jsonb_typeof(p_patch -> 'trial_days') <> 'number' or (p_patch ->> 'trial_days') !~ '^[0-9]{1,3}$' then raise exception 'Dias de teste inválidos' using errcode = 'P0001'; end if;
    pl.trial_days := (p_patch ->> 'trial_days')::int;
  end if;
  if p_patch ? 'limits' then
    if jsonb_typeof(p_patch -> 'limits') <> 'object' then raise exception 'Limites inválidos' using errcode = 'P0001'; end if;
    for k, v in select * from jsonb_each(p_patch -> 'limits') loop
      if not (k = any (v_limit_keys)) then raise exception 'Limite desconhecido: %', k using errcode = 'P0001'; end if;
      if jsonb_typeof(v) <> 'null' and (jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^[0-9]{1,9}$') then raise exception 'Valor inválido para %', k using errcode = 'P0001'; end if;
    end loop;
    pl.limits := p_patch -> 'limits';
  end if;
  if p_patch ? 'features' then
    if jsonb_typeof(p_patch -> 'features') <> 'object' then raise exception 'Recursos inválidos' using errcode = 'P0001'; end if;
    for k, v in select * from jsonb_each(p_patch -> 'features') loop
      if not (k = any (v_feature_keys)) then raise exception 'Recurso desconhecido: %', k using errcode = 'P0001'; end if;
      if jsonb_typeof(v) <> 'boolean' then raise exception 'Recurso % deve ser verdadeiro ou falso', k using errcode = 'P0001'; end if;
    end loop;
    pl.features := p_patch -> 'features';
  end if;
  foreach k in array array['is_public', 'is_active', 'highlight'] loop
    if p_patch ? k and jsonb_typeof(p_patch -> k) <> 'boolean' then raise exception '% deve ser verdadeiro ou falso', k using errcode = 'P0001'; end if;
  end loop;
  if p_patch ? 'is_public' then pl.is_public := (p_patch ->> 'is_public')::boolean; end if;
  if p_patch ? 'is_active' then pl.is_active := (p_patch ->> 'is_active')::boolean; end if;
  if p_patch ? 'highlight' then pl.highlight := (p_patch ->> 'highlight')::boolean; end if;
  if p_patch ? 'sort_order' then
    if jsonb_typeof(p_patch -> 'sort_order') <> 'number' or (p_patch ->> 'sort_order') !~ '^[0-9]{1,4}$' then raise exception 'Ordem inválida' using errcode = 'P0001'; end if;
    pl.sort_order := (p_patch ->> 'sort_order')::int;
  end if;

  -- Planos de sistema: o Gratuito e o teste não podem ser desativados nem cobrados.
  if pl.code in ('gratuito', 'trial') and (pl.price_cents <> 0 or coalesce(pl.price_yearly_cents, 0) <> 0) then raise exception 'O plano % não pode ter preço', pl.code using errcode = 'P0001'; end if;
  if pl.code = 'gratuito' and not pl.is_active then raise exception 'O plano Gratuito não pode ser desativado' using errcode = 'P0001'; end if;
  if pl.code in ('gratuito', 'trial') and not coalesce((pl.features ->> 'calculator')::boolean, false) then raise exception 'A calculadora deve ficar liberada em %', pl.code using errcode = 'P0001'; end if;

  update public.plans set name = pl.name, description = pl.description, price_cents = pl.price_cents, price_yearly_cents = pl.price_yearly_cents,
    trial_days = pl.trial_days, limits = pl.limits, features = pl.features, is_public = pl.is_public, is_active = pl.is_active,
    highlight = pl.highlight, sort_order = pl.sort_order where id = pl.id;
  select array_agg(key) into v_changed from jsonb_object_keys(p_patch) as key;
  n := (select count(*) from public.subscriptions s where s.plan_id = pl.id and s.status in ('trialing', 'active', 'past_due'));
  perform public.admin_log('plano.alterado', 'plans', pl.code, jsonb_build_object('campos', v_changed, 'antes', v_before, 'depois', p_patch, 'assinaturas_no_plano', n));
end $$;

-- ───────── Cupons (admin) ─────────
create function public.admin_list_coupons() returns table (
  id uuid, code text, description text, plan_code text, days integer, restricted_email text, max_redemptions integer,
  redeemed_count integer, valid_from timestamptz, valid_until timestamptz, is_active boolean, created_at timestamptz, status text)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_superadmin();
  return query select c.id, c.code, c.description, p.code, c.days, c.restricted_email, c.max_redemptions, c.redeemed_count, c.valid_from, c.valid_until,
    c.is_active, c.created_at,
    case when not c.is_active then 'desativado' when c.valid_from > now() then 'agendado' when c.valid_until is not null and c.valid_until <= now() then 'expirado'
         when c.max_redemptions is not null and c.redeemed_count >= c.max_redemptions then 'esgotado' else 'ativo' end
  from public.coupons c join public.plans p on p.id = c.plan_id order by c.created_at desc limit 200;
end $$;

create function public.admin_create_coupon(p_code text, p_description text, p_plan_code text, p_days integer, p_restricted_email text,
                                           p_max_redemptions integer, p_valid_from timestamptz, p_valid_until timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_plan public.plans; v_id uuid; v_code text := upper(trim(coalesce(p_code, '')));
begin
  perform public.assert_superadmin();
  if v_code !~ '^[A-Z0-9_-]{4,32}$' then raise exception 'Código inválido: use 4 a 32 letras, números, - ou _' using errcode = 'P0001'; end if;
  select * into v_plan from public.plans where code = p_plan_code and is_active and code <> 'gratuito';
  if not found then raise exception 'Plano inválido para o cupom' using errcode = 'P0001'; end if;
  if p_days is null or p_days not between 1 and 365 then raise exception 'Informe de 1 a 365 dias' using errcode = 'P0001'; end if;
  if p_max_redemptions is not null and p_max_redemptions < 1 then raise exception 'O limite de usos deve ser maior que zero' using errcode = 'P0001'; end if;
  if p_valid_until is not null and p_valid_until <= coalesce(p_valid_from, now()) then raise exception 'A validade deve ser depois do início' using errcode = 'P0001'; end if;
  begin
    insert into public.coupons (code, description, plan_id, days, restricted_email, max_redemptions, valid_from, valid_until, created_by)
    values (v_code, nullif(left(trim(coalesce(p_description, '')), 200), ''), v_plan.id, p_days, nullif(lower(trim(coalesce(p_restricted_email, ''))), ''),
            p_max_redemptions, coalesce(p_valid_from, now()), p_valid_until, auth.uid()) returning id into v_id;
  exception when unique_violation then raise exception 'Já existe um cupom com este código' using errcode = 'P0001';
  end;
  perform public.admin_log('cupom.criado', 'coupons', v_code, jsonb_build_object('plano', v_plan.code, 'dias', p_days, 'limite', p_max_redemptions, 'validade', p_valid_until));
  return v_id;
end $$;

create function public.admin_set_coupon_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  perform public.assert_superadmin();
  update public.coupons set is_active = coalesce(p_active, false) where id = p_id returning code into v_code;
  if v_code is null then raise exception 'Cupom não encontrado' using errcode = 'P0001'; end if;
  perform public.admin_log(case when p_active then 'cupom.ativado' else 'cupom.desativado' end, 'coupons', v_code, '{}');
end $$;

-- ───────── Configurações da plataforma (lista fechada de chaves, valores validados) ─────────
create function public.admin_set_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_old jsonb; v_text text;
begin
  perform public.assert_superadmin();
  if p_key not in ('billing_grace_days', 'trial_enabled', 'support_email', 'terms_url', 'privacy_url') then raise exception 'Configuração desconhecida' using errcode = 'P0001'; end if;
  if p_key = 'billing_grace_days' and (jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}') !~ '^[0-9]{1,2}$' or (p_value #>> '{}')::int > 30) then
    raise exception 'A carência deve ter de 0 a 30 dias' using errcode = 'P0001'; end if;
  if p_key = 'trial_enabled' and jsonb_typeof(p_value) <> 'boolean' then raise exception 'Valor inválido' using errcode = 'P0001'; end if;
  if p_key in ('support_email', 'terms_url', 'privacy_url') then
    if jsonb_typeof(p_value) <> 'string' then raise exception 'Valor inválido' using errcode = 'P0001'; end if;
    v_text := trim(p_value #>> '{}');
    if v_text <> '' and p_key = 'support_email' and v_text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido' using errcode = 'P0001'; end if;
    if v_text <> '' and p_key <> 'support_email' and v_text !~ '^https://[^\s]{3,}$' then raise exception 'Use um link https válido' using errcode = 'P0001'; end if;
    if char_length(v_text) > 300 then raise exception 'Valor muito longo' using errcode = 'P0001'; end if;
    p_value := to_jsonb(v_text);
  end if;
  select value into v_old from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value) values (p_key, p_value)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.admin_log('configuracao.alterada', 'platform_settings', p_key, jsonb_build_object('antes', v_old, 'depois', p_value));
end $$;

-- ───────── Uso agregado, monitoramento e auditoria ─────────
create function public.admin_usage_metrics() returns jsonb
language plpgsql security definer set search_path = public, storage as $$
declare v_plans jsonb;
begin
  perform public.assert_superadmin();
  select coalesce(jsonb_object_agg(plan_code, jsonb_build_object('usuarios', users, 'produtos', products, 'orcamentos', quotes, 'pedidos', orders)), '{}') into v_plans
  from (select st.plan_code, count(*) users,
               sum((select count(*) from public.products x where x.user_id = st.user_id)) products,
               sum((select count(*) from public.quotes x where x.user_id = st.user_id)) quotes,
               sum((select count(*) from public.orders x where x.user_id = st.user_id)) orders
        from public.admin_states() st group by st.plan_code) t;
  return jsonb_build_object(
    'produtos', (select count(*) from public.products), 'precificacoes', (select count(*) from public.pricings),
    'modelos_importados', (select count(*) from public.imported_models), 'orcamentos', (select count(*) from public.quotes),
    'pedidos', (select count(*) from public.orders), 'impressoras', (select count(*) from public.printers),
    'filamentos', (select count(*) from public.filaments),
    'armazenamento_bytes', (select coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0) from storage.objects o where o.bucket_id = 'model-files'),
    'por_plano', v_plans);
end $$;

create function public.admin_monitoring() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_since timestamptz := now() - interval '7 days';
begin
  perform public.assert_superadmin();
  return jsonb_build_object(
    'webhooks_erro_7d', (select count(*) from public.billing_events where status = 'erro' and received_at >= v_since),
    'webhooks_recentes', coalesce((select jsonb_agg(to_jsonb(t)) from (select gateway, event_type, status, error, received_at from public.billing_events
        where status = 'erro' order by received_at desc limit 20) t), '[]'),
    'pagamentos_falhos_30d', (select count(*) from public.billing_charges where status in ('falhou', 'vencida') and created_at >= now() - interval '30 days'),
    'pagamentos_recentes', coalesce((select jsonb_agg(to_jsonb(t)) from (select c.status, c.amount_cents, c.method, c.created_at, u.email::text as email
        from public.billing_charges c join auth.users u on u.id = c.user_id where c.status in ('falhou', 'vencida') order by c.created_at desc limit 20) t), '[]'),
    'armazenamento_perto_do_limite', coalesce((select jsonb_agg(to_jsonb(t)) from (
        select u.email::text as email, public.storage_used_bytes(st.user_id) as usado_bytes, ((st.limits ->> 'max_storage_mb')::bigint * 1024 * 1024) as limite_bytes
        from public.admin_states() st join auth.users u on u.id = st.user_id
        where st.limits ->> 'max_storage_mb' is not null
          and public.storage_used_bytes(st.user_id) >= 0.8 * ((st.limits ->> 'max_storage_mb')::bigint * 1024 * 1024)
        order by 2 desc limit 20) t), '[]'),
    'eventos_por_tipo_7d', coalesce((select jsonb_object_agg(kind || '/' || severity, n) from (select kind, severity, count(*) n from public.app_events
        where created_at >= v_since group by kind, severity) t), '{}'),
    'eventos_recentes', coalesce((select jsonb_agg(to_jsonb(t)) from (select kind, severity, message, meta, created_at from public.app_events
        where severity <> 'info' order by created_at desc limit 30) t), '[]'));
end $$;

create function public.admin_list_audit(p_action text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, actor_email text, actor_kind text, action text, entity text, entity_id text, details jsonb, created_at timestamptz, total bigint)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_superadmin();
  p_limit := least(greatest(coalesce(p_limit, 50), 1), 200);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  return query select a.id, u.email::text, a.actor_kind, a.action, a.entity, a.entity_id, a.details, a.created_at, count(*) over ()
  from public.admin_audit_log a left join auth.users u on u.id = a.actor_id
  where p_action is null or a.action = p_action order by a.created_at desc, a.id limit p_limit offset p_offset;
end $$;

-- Visitantes sem login nunca executam funções administrativas (grants padrão do Supabase dão EXECUTE a anon).
do $$ declare r regprocedure; begin
  for r in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'admin\_%' loop
    execute format('revoke execute on function %s from public, anon', r);
  end loop;
end $$;
revoke execute on function public.admin_log(text, text, text, jsonb), public.assert_superadmin(), public.admin_states(), public.admin_audit_immutable() from public, anon, authenticated;
