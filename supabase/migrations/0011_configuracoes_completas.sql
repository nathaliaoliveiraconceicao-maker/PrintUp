-- PrintUp · Configurações completas (feitas uma única vez): embalagem e frete padrão, despesas mensais itemizadas,
-- faturamento previsto, método de preço padrão, arredondamento e canais de venda (Shopee, Mercado Livre, outros).

alter table public.cost_settings
  add column packaging_per_unit numeric(12,2) not null default 0 check (packaging_per_unit >= 0),
  add column shipping_per_unit numeric(12,2) not null default 0 check (shipping_per_unit >= 0),
  add column fixed_items jsonb not null default '{}' check (jsonb_typeof(fixed_items) = 'object'),
  add column expected_revenue numeric(14,2) not null default 0 check (expected_revenue >= 0),
  add column pricing_mode text not null default 'margin' check (pricing_mode in ('margin', 'markup')),
  add column markup_percent numeric(7,2) not null default 100 check (markup_percent between 0 and 10000),
  add column price_rounding text not null default 'none' check (price_rounding in ('none', 'real'));

alter table public.cost_settings drop constraint cost_settings_fixed_allocation_check;
alter table public.cost_settings add constraint cost_settings_fixed_allocation_check
  check (fixed_allocation in ('per_hour', 'per_unit', 'revenue_percent'));

-- Despesas mensais itemizadas: só estas chaves, valores numéricos entre 0 e 10 milhões.
create function public.validate_fixed_items() returns trigger language plpgsql as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(new.fixed_items) <> 'object' then raise exception 'Despesas mensais inválidas' using errcode = '23514'; end if;
  for k, v in select * from jsonb_each(new.fixed_items) loop
    if k not in ('aluguel', 'softwares', 'plataformas', 'tributos_fixos', 'publicidade', 'condominio', 'outros') then
      raise exception 'Despesa mensal desconhecida: %', k using errcode = 'P0001';
    end if;
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 10000000 then
      raise exception 'Valor inválido para a despesa %', k using errcode = 'P0001';
    end if;
  end loop;
  return new;
end $$;
create trigger cost_settings_validate_items before insert or update of fixed_items on public.cost_settings
  for each row execute function public.validate_fixed_items();
revoke execute on function public.validate_fixed_items() from public, anon, authenticated;

-- ───────── Canais de venda ─────────
create table public.sales_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  fee_percent numeric(5,2) not null default 0 check (fee_percent between 0 and 99),
  fee_fixed numeric(12,2) not null default 0 check (fee_fixed >= 0 and fee_fixed <= 10000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sales_channels_name on public.sales_channels (user_id, lower(btrim(name)));
create index sales_channels_user on public.sales_channels (user_id, sort_order, created_at);
create trigger sales_channels_updated before update on public.sales_channels
  for each row execute function public.set_updated_at();

alter table public.sales_channels enable row level security;
create policy sales_channels_owner on public.sales_channels for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- No máximo 10 canais por usuário (trava contra requisições simultâneas).
create function public.limit_sales_channels() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('channels:' || new.user_id::text));
  if (select count(*) from public.sales_channels where user_id = new.user_id) >= 10 then
    raise exception 'Limite de canais de venda atingido (10)' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger sales_channels_limit before insert on public.sales_channels
  for each row execute function public.limit_sales_channels();
revoke execute on function public.limit_sales_channels() from public, anon, authenticated;
