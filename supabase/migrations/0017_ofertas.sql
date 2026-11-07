-- PrintUp Ofertas: lojas, fontes, produtos monitorados, ofertas, histórico, cupons, cliques, alertas, execuções e erros.
-- Segurança: leitura PÚBLICA só do que foi publicado (e com colunas escolhidas); tudo o mais só pelo servidor (service_role).
-- Credenciais NUNCA ficam no banco: as fontes apontam para variáveis de ambiente.

create table public.offer_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.offer_settings (key, value) values
  ('auto_publish', 'false'),
  ('min_score_publish', '75'),
  ('min_score_review', '45'),
  ('weights', '{"discount":30,"history":20,"relevance":10,"availability":10,"store":10,"quality":10,"coupon":5,"freshness":5}'),
  ('allow_simulated', 'false'),
  ('history_window_days', '90'),
  ('expire_after_hours', '72')
on conflict (key) do nothing;

create function public.offers_allow_simulated() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from public.offer_settings where key = 'allow_simulated'), false)
$$;

create function public.offer_hosts_valid(h text[]) returns boolean
language sql immutable as $$ select cardinality(h) <= 20 and not exists (select 1 from unnest(h) x where x !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$') $$;

create table public.offer_stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_-]{2,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'afiliado' check (kind in ('afiliado', 'feed', 'manual', 'simulado')),
  allowed_hosts text[] not null default '{}' check (public.offer_hosts_valid(allowed_hosts)),
  reliability integer not null default 60 check (reliability between 0 and 100),
  affiliate_config jsonb not null default '{}',
  disclosure text not null default 'Link de afiliado: o PrintUp pode receber uma comissão se você comprar, sem custo extra para você.' check (char_length(disclosure) <= 300),
  is_active boolean not null default false,
  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger offer_stores_updated before update on public.offer_stores for each row execute function public.set_updated_at();

create table public.offer_sources (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.offer_stores (id) on delete cascade,
  connector text not null check (connector in ('feed_manual', 'shopee', 'mercadolivre', 'simulado')),
  name text not null check (char_length(name) between 1 and 80),
  config jsonb not null default '{}',
  frequency_minutes integer not null default 1440 check (frequency_minutes between 60 and 10080),
  is_active boolean not null default false,
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);
create index offer_sources_store on public.offer_sources (store_id);

create table public.offer_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.offer_stores (id) on delete cascade,
  external_id text not null check (char_length(external_id) between 1 and 120),
  title text not null check (char_length(title) between 1 and 300),
  brand text check (char_length(brand) <= 80),
  model text check (char_length(model) <= 120),
  category text not null check (category ~ '^[a-z-]{3,40}$'),
  image_url text check (image_url is null or image_url ~ '^https://'),
  product_url text not null check (product_url ~ '^https://'),
  attrs jsonb not null default '{}',
  canonical_key text,
  is_simulated boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (store_id, external_id)
);
create index offer_products_key on public.offer_products (canonical_key) where canonical_key is not null;
create index offer_products_category on public.offer_products (category);

create table public.offer_price_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.offer_products (id) on delete cascade,
  price_cents integer not null check (price_cents > 0),
  in_stock boolean,
  source text not null check (char_length(source) <= 40),
  observed_at timestamptz not null default now()
);
create index offer_price_history_product on public.offer_price_history (product_id, observed_at desc);

create table public.offer_coupons (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.offer_stores (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  value numeric(10,2) not null check (value > 0),
  min_purchase_cents integer check (min_purchase_cents is null or min_purchase_cents >= 0),
  max_discount_cents integer check (max_discount_cents is null or max_discount_cents > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  source text not null check (char_length(trim(source)) between 1 and 80),
  notes text check (char_length(notes) <= 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (store_id, code),
  check (kind <> 'percent' or value < 100)
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.offer_products (id) on delete cascade,
  status text not null default 'revisao' check (status in ('rascunho', 'revisao', 'publicada', 'expirada', 'rejeitada')),
  price_cents integer not null check (price_cents > 0),
  previous_price_cents integer,
  previous_basis text check (previous_basis in ('loja', 'observado')),
  discount_pct numeric(4,1),
  coupon_id uuid references public.offer_coupons (id) on delete set null,
  coupon_saved_cents integer not null default 0 check (coupon_saved_cents >= 0),
  shipping_cents integer check (shipping_cents is null or shipping_cents >= 0),
  in_stock boolean,
  score integer check (score between 0 and 100),
  score_detail jsonb not null default '{}',
  flags text[] not null default '{}',
  link_url text not null check (link_url ~ '^https://'),
  is_affiliate boolean not null default false,
  featured boolean not null default false,
  valid_until timestamptz,
  last_checked_at timestamptz not null default now(),
  published_at timestamptz,
  review_reason text check (char_length(review_reason) <= 120),
  reviewed_at timestamptz,
  is_simulated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- desconto só existe com preço anterior comprovado (e maior que o atual)
  constraint offers_previous_consistent check ((previous_price_cents is null) = (previous_basis is null) and (previous_price_cents is null) = (discount_pct is null)),
  constraint offers_previous_greater check (previous_price_cents is null or previous_price_cents > price_cents),
  constraint offers_coupon_below_price check (coupon_saved_cents < price_cents)
);
create trigger offers_updated before update on public.offers for each row execute function public.set_updated_at();
-- no máximo UMA oferta "em aberto" por produto: sem duplicatas
create unique index offers_one_open on public.offers (product_id) where status in ('rascunho', 'revisao', 'publicada');
create index offers_public on public.offers (status, score desc) where status = 'publicada';
create index offers_product on public.offers (product_id);

create function public.offers_guard() returns trigger language plpgsql as $$
begin
  if new.status = 'publicada' then
    if new.is_simulated and not public.offers_allow_simulated() then
      raise exception 'Oferta simulada não pode ser publicada' using errcode = 'P0001';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end $$;
create trigger offers_guard before insert or update on public.offers for each row execute function public.offers_guard();

create table public.offer_clicks (
  id bigint generated always as identity primary key,
  offer_id uuid references public.offers (id) on delete set null,
  store_id uuid references public.offer_stores (id) on delete set null,
  clicked_at timestamptz not null default now(),
  campaign text check (campaign ~ '^[a-z0-9_-]{1,40}$'),
  origin text not null default 'site' check (origin in ('site', 'alerta', 'email', 'calculadora'))
);
create index offer_clicks_offer on public.offer_clicks (offer_id, clicked_at desc);
create index offer_clicks_when on public.offer_clicks (clicked_at desc);

-- Conversões e comissões são INFORMADAS por quem administra (relatório do programa). "informada" ≠ "confirmada".
create table public.offer_conversions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.offer_stores (id) on delete cascade,
  reported_on date not null,
  orders integer not null default 0 check (orders >= 0),
  commission_cents integer not null default 0 check (commission_cents >= 0),
  status text not null default 'informada' check (status in ('informada', 'confirmada')),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create table public.offer_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rule jsonb not null,
  channel text not null default 'email' check (channel in ('email', 'whatsapp', 'push')),
  cooldown_hours integer not null default 24 check (cooldown_hours between 1 and 720),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(rule) = 'object' and rule ->> 'kind' in ('preco_abaixo', 'desconto_acima', 'voltou_estoque'))
);
create index offer_alerts_user on public.offer_alerts (user_id);
create index offer_alerts_active on public.offer_alerts (is_active) where is_active;

create function public.limit_offer_alerts() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('offer_alerts:' || new.user_id::text));
  if (select count(*) from public.offer_alerts where user_id = new.user_id) >= 20 then
    raise exception 'Limite de alertas atingido (20)' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger offer_alerts_limit before insert on public.offer_alerts for each row execute function public.limit_offer_alerts();
revoke execute on function public.limit_offer_alerts() from public, anon, authenticated;

create table public.offer_alert_notifications (
  id bigint generated always as identity primary key,
  alert_id uuid not null references public.offer_alerts (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  price_cents integer not null,
  channel text not null,
  status text not null check (status in ('enviada', 'sem_provedor', 'falhou')),
  sent_at timestamptz not null default now()
);
create index offer_alert_notifications_alert on public.offer_alert_notifications (alert_id, offer_id, sent_at desc);

create table public.offer_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.offer_sources (id) on delete cascade,
  trigger text not null check (trigger in ('cron', 'manual', 'importacao')),
  status text not null default 'executando' check (status in ('executando', 'ok', 'parcial', 'falhou')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}',
  error text check (char_length(error) <= 300)
);
-- uma execução por fonte por vez (controle de concorrência)
create unique index offer_runs_one_running on public.offer_runs (source_id) where status = 'executando';
create index offer_runs_recent on public.offer_runs (started_at desc);

create table public.offer_errors (
  id bigint generated always as identity primary key,
  run_id uuid references public.offer_runs (id) on delete cascade,
  source_id uuid references public.offer_sources (id) on delete set null,
  kind text not null check (kind ~ '^[a-z_]{2,40}$'),
  message text not null check (char_length(message) <= 300),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index offer_errors_recent on public.offer_errors (created_at desc);

-- ───────── Segurança ─────────
alter table public.offer_settings enable row level security;
alter table public.offer_stores enable row level security;
alter table public.offer_sources enable row level security;
alter table public.offer_products enable row level security;
alter table public.offer_price_history enable row level security;
alter table public.offer_coupons enable row level security;
alter table public.offers enable row level security;
alter table public.offer_clicks enable row level security;
alter table public.offer_conversions enable row level security;
alter table public.offer_alerts enable row level security;
alter table public.offer_alert_notifications enable row level security;
alter table public.offer_runs enable row level security;
alter table public.offer_errors enable row level security;

revoke all on public.offer_settings, public.offer_stores, public.offer_sources, public.offer_products, public.offer_price_history, public.offer_coupons,
  public.offers, public.offer_clicks, public.offer_conversions, public.offer_alerts, public.offer_alert_notifications, public.offer_runs, public.offer_errors from anon, authenticated, public;

-- Leitura pública: só colunas de vitrine, só o que está publicado (e não simulado, salvo configuração explícita).
create policy offers_public_read on public.offers for select to anon, authenticated
  using (status = 'publicada' and (valid_until is null or valid_until > now()) and (not is_simulated or public.offers_allow_simulated()));
grant select (id, product_id, price_cents, previous_price_cents, previous_basis, discount_pct, coupon_id, coupon_saved_cents, shipping_cents, in_stock, score, link_url, is_affiliate, featured, valid_until, last_checked_at, published_at)
  on public.offers to anon, authenticated;

create policy offer_products_public_read on public.offer_products for select to anon, authenticated
  using (exists (select 1 from public.offers o where o.product_id = offer_products.id));
grant select (id, store_id, title, brand, model, category, image_url, attrs, canonical_key, last_seen_at) on public.offer_products to anon, authenticated;

create policy offer_price_history_public_read on public.offer_price_history for select to anon, authenticated
  using (exists (select 1 from public.offers o where o.product_id = offer_price_history.product_id));
grant select (product_id, price_cents, in_stock, observed_at) on public.offer_price_history to anon, authenticated;

create policy offer_stores_public_read on public.offer_stores for select to anon, authenticated using (is_active and (not is_simulated or public.offers_allow_simulated()));
grant select (id, code, name, kind, disclosure) on public.offer_stores to anon, authenticated;

create policy offer_coupons_public_read on public.offer_coupons for select to anon, authenticated
  using (is_active and (valid_until is null or valid_until > now()));
grant select (id, store_id, code, kind, value, min_purchase_cents, max_discount_cents, valid_from, valid_until) on public.offer_coupons to anon, authenticated;

-- Alertas: cada pessoa só enxerga e mexe nos próprios.
create policy offer_alerts_owner on public.offer_alerts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.offer_alerts to authenticated;
create policy offer_alert_notifications_owner on public.offer_alert_notifications for select to authenticated
  using (exists (select 1 from public.offer_alerts a where a.id = alert_id and a.user_id = auth.uid()));
grant select on public.offer_alert_notifications to authenticated;
-- offer_settings, offer_sources, offer_clicks, offer_conversions, offer_runs, offer_errors: sem acesso para anon/authenticated (só service_role).
