-- PrintUp · Etapa 1: perfis, planos, assinaturas, impressoras, filamentos,
-- configurações de custo, histórico e eventos de cobrança.
-- Tenant = usuário (user_id). Organizações/equipes ficam para uma etapa futura.

create extension if not exists pgcrypto;

-- ───────── Tipos ─────────
create type public.user_role as enum ('customer', 'superadmin');
create type public.subscription_status as enum
  ('trialing', 'active', 'past_due', 'canceled', 'expired');

-- ───────── Utilitários ─────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────── Perfis ─────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  business_name text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin');
$$;

-- Impede que o cliente se promova: role só muda via service_role / SQL direto.
create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'Alteração de papel não permitida' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ───────── Planos e assinaturas ─────────
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'BRL',
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  trial_days integer not null default 0 check (trial_days >= 0),
  -- Limites; null = ilimitado. Ex.: {"max_printers":2,"max_filaments":10,"max_products":50}
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  gateway_price_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plans_updated before update on public.plans
  for each row execute function public.set_updated_at();

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  gateway text,
  gateway_customer_id text,
  gateway_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- uma assinatura "viva" por usuário
create unique index subscriptions_one_live_per_user on public.subscriptions (user_id)
  where status in ('trialing', 'active', 'past_due');
create unique index subscriptions_gateway_sub on public.subscriptions (gateway, gateway_subscription_id)
  where gateway_subscription_id is not null;
create trigger subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Eventos de cobrança (idempotência de webhooks). Só service_role acessa.
create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  gateway text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (gateway, event_id)
);

-- Plano gratuito/teste padrão para novos usuários.
insert into public.plans (code, name, description, price_cents, trial_days, limits, features)
values
  ('trial', 'Teste grátis', 'Período de avaliação', 0, 14,
   '{"max_printers":1,"max_filaments":5,"max_products":10,"max_quotes":10}', '{}'),
  ('starter', 'Iniciante', 'Para quem está começando', 1990, 0,
   '{"max_printers":2,"max_filaments":15,"max_products":50,"max_quotes":50}', '{}'),
  ('pro', 'Profissional', 'Sem limites práticos', 4990, 0,
   '{"max_printers":null,"max_filaments":null,"max_products":null,"max_quotes":null}',
   '{"import_3mf":true,"import_url":true}')
on conflict (code) do nothing;

-- Direitos efetivos do usuário (fonte da verdade para limites; usado por triggers e pelo app).
create or replace function public.current_entitlements(p_user uuid default auth.uid())
returns table (plan_code text, status public.subscription_status, limits jsonb, features jsonb, active boolean)
language sql stable security definer set search_path = public as $$
  select p.code, s.status, p.limits, p.features,
    (s.status in ('active', 'past_due')
      or (s.status = 'trialing' and coalesce(s.trial_ends_at, now()) > now())) as active
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.user_id = p_user and s.status in ('trialing', 'active', 'past_due')
  order by s.created_at desc
  limit 1;
$$;

-- Novo usuário: cria perfil + assinatura em teste.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan public.plans;
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');

  select * into v_plan from public.plans where code = 'trial';
  if found then
    insert into public.subscriptions (user_id, plan_id, status, trial_ends_at)
    values (new.id, v_plan.id, 'trialing', now() + make_interval(days => v_plan.trial_days));
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────── Impressoras ─────────
create table public.printers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  brand text,
  model text,
  purchase_price numeric(12,2) not null default 0 check (purchase_price >= 0),
  lifespan_hours integer check (lifespan_hours is null or lifespan_hours > 0),
  power_watts numeric(8,2) not null default 0 check (power_watts >= 0),
  -- Custo/hora informado pelo usuário e o que ele já engloba (evita dupla contagem).
  hourly_cost numeric(12,2) not null default 0 check (hourly_cost >= 0),
  hourly_includes_energy boolean not null default false,
  hourly_includes_wear boolean not null default false,
  hourly_includes_fixed boolean not null default false,
  wear_per_hour numeric(12,2) not null default 0 check (wear_per_hour >= 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index printers_user on public.printers (user_id);
create trigger printers_updated before update on public.printers
  for each row execute function public.set_updated_at();

-- ───────── Filamentos ─────────
create table public.filaments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  brand text,
  material text not null default 'PLA',
  color text,
  price_per_kg numeric(12,2) not null check (price_per_kg >= 0),
  spool_weight_g integer not null default 1000 check (spool_weight_g > 0),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index filaments_user on public.filaments (user_id);
create trigger filaments_updated before update on public.filaments
  for each row execute function public.set_updated_at();

-- ───────── Configurações de custo (1 por usuário) ─────────
create table public.cost_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  monthly_fixed_costs numeric(12,2) not null default 0 check (monthly_fixed_costs >= 0),
  fixed_allocation text not null default 'per_hour' check (fixed_allocation in ('per_hour', 'per_unit')),
  productive_hours_per_month numeric(8,2) not null default 160 check (productive_hours_per_month >= 0),
  monthly_units numeric(10,2) not null default 0 check (monthly_units >= 0),
  energy_price_per_kwh numeric(8,4) not null default 0.90 check (energy_price_per_kwh >= 0),
  labor_hourly_rate numeric(12,2) not null default 0 check (labor_hourly_rate >= 0),
  loss_percent numeric(5,2) not null default 5 check (loss_percent between 0 and 100),
  sale_fee_percent numeric(5,2) not null default 0 check (sale_fee_percent between 0 and 100),
  sale_fee_fixed numeric(12,2) not null default 0 check (sale_fee_fixed >= 0),
  tax_percent numeric(5,2) not null default 0 check (tax_percent between 0 and 100),
  margin_percent numeric(5,2) not null default 30 check (margin_percent >= 0 and margin_percent < 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger cost_settings_updated before update on public.cost_settings
  for each row execute function public.set_updated_at();

-- ───────── Histórico de operações ─────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,           -- insert | update | delete
  entity text not null,           -- nome da tabela
  entity_id text,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_user_created on public.audit_log (user_id, created_at desc);

create or replace function public.log_operation() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb; v_id text;
begin
  v_row := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_id := v_row ->> 'id';
  insert into public.audit_log (user_id, action, entity, entity_id, changes)
  values (auth.uid(), lower(tg_op), tg_table_name, v_id,
          case when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
               else v_row end);
  return coalesce(new, old);
end $$;
create trigger printers_audit after insert or update or delete on public.printers
  for each row execute function public.log_operation();
create trigger filaments_audit after insert or update or delete on public.filaments
  for each row execute function public.log_operation();

-- ───────── Limites do plano (aplicados no banco, não só no frontend) ─────────
create or replace function public.enforce_plan_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_key text := tg_argv[0];
  v_ent record;
  v_limit text;
  v_count bigint;
begin
  select * into v_ent from public.current_entitlements(new.user_id);
  if not found or not v_ent.active then
    raise exception 'Assinatura inativa ou expirada' using errcode = 'P0001';
  end if;
  v_limit := v_ent.limits ->> v_key;
  if v_limit is null then return new; end if;  -- ilimitado
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name)
    into v_count using new.user_id;
  if v_count >= v_limit::bigint then
    raise exception 'Limite do plano atingido (%)', v_key using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger printers_limit before insert on public.printers
  for each row execute function public.enforce_plan_limit('max_printers');
create trigger filaments_limit before insert on public.filaments
  for each row execute function public.enforce_plan_limit('max_filaments');

-- ───────── Row Level Security ─────────
alter table public.profiles       enable row level security;
alter table public.plans          enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.billing_events enable row level security;
alter table public.printers       enable row level security;
alter table public.filaments      enable row level security;
alter table public.cost_settings  enable row level security;
alter table public.audit_log      enable row level security;

-- profiles
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_superadmin());
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_superadmin())
  with check (id = auth.uid() or public.is_superadmin());

-- plans: planos ativos são públicos para usuários logados; só superadmin escreve
create policy plans_select on public.plans for select to authenticated
  using (is_active or public.is_superadmin());
create policy plans_admin_write on public.plans for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- subscriptions: leitura própria; escrita só via service_role (webhooks) ou superadmin
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());
create policy subscriptions_admin_write on public.subscriptions for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- billing_events: sem policy para usuários = acesso negado; service_role ignora RLS.

-- dados do cliente
create policy printers_owner on public.printers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy filaments_owner on public.filaments for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cost_settings_owner on public.cost_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_log: somente leitura do próprio histórico (escrita só pelos triggers)
create policy audit_log_select on public.audit_log for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

-- Superadmin enxerga dados de clientes só por consultas administrativas dedicadas
-- (service_role no servidor), nunca por policies amplas nas tabelas de dados.
