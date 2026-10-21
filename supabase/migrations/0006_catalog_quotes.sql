-- PrintUp · Etapa 3: catálogo de produtos completo, clientes, perfil do negócio e orçamentos.
--
-- Princípios:
--  - O catálogo guarda os valores ATUAIS do produto; o cálculo que os originou fica em `pricings` (retrato imutável).
--  - Orçamentos guardam um RETRATO dos valores (itens, preços, descontos, totais): mudar o produto depois não altera
--    orçamentos antigos. Depois de enviado, o conteúdo do orçamento fica travado no próprio banco.
--  - Nada de custo interno nem margem vai para o cliente: esses campos existem só para o vendedor.

-- ───────── Armazenamento: imagens do usuário e PDFs de orçamento ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('user-images', 'user-images', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('quote-pdfs',  'quote-pdfs',  false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- O consumo do plano passa a somar os três buckets.
create or replace function public.storage_used_bytes(p_user uuid default auth.uid())
returns bigint language sql stable security definer set search_path = public, storage as $$
  select coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0)::bigint
  from storage.objects o
  where o.bucket_id in ('model-files', 'user-images', 'quote-pdfs')
    and (storage.foldername(o.name))[1] = p_user::text;
$$;

create policy user_images_select on storage.objects for select to authenticated
  using (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy user_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text and public.can_store_upload(auth.uid()));
create policy user_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy quote_pdfs_select on storage.objects for select to authenticated
  using (bucket_id = 'quote-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy quote_pdfs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'quote-pdfs' and (storage.foldername(name))[1] = auth.uid()::text and public.can_store_upload(auth.uid()));
create policy quote_pdfs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'quote-pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────── Produtos: ficha de catálogo completa ─────────
alter table public.products
  add column category text check (char_length(category) <= 60),
  add column description text check (char_length(description) <= 2000),
  add column photo_path text,
  add column printer_id uuid references public.printers (id) on delete set null,
  add column printer_name text check (char_length(printer_name) <= 120),
  add column filament_id uuid references public.filaments (id) on delete set null,
  add column filament_type text check (char_length(filament_type) <= 60),
  add column filament_color text check (char_length(filament_color) <= 40),
  add column weight_g numeric(10,2) check (weight_g is null or weight_g >= 0),
  add column print_minutes numeric(10,2) check (print_minutes is null or print_minutes >= 0),
  add column material_cost numeric(12,2) check (material_cost is null or material_cost >= 0),
  add column machine_cost numeric(12,2) check (machine_cost is null or machine_cost >= 0),
  add column other_costs numeric(12,2) check (other_costs is null or other_costs >= 0),
  add column production_cost numeric(12,2) check (production_cost is null or production_cost >= 0),
  add column margin_percent numeric(8,2),
  -- 'liquida': após taxas e impostos (veio da calculadora); 'bruta': (preço − custo) / preço, sem taxas (cadastro manual)
  add column margin_basis text check (margin_basis in ('liquida', 'bruta')),
  add column sale_price numeric(12,2) check (sale_price is null or sale_price >= 0),
  add column stock_qty integer not null default 0 check (stock_qty between 0 and 1000000),
  add column source_url text check (char_length(source_url) <= 500 and (source_url is null or source_url ~* '^https?://')),
  add column license_info text check (char_length(license_info) <= 500),
  add column pricing_id uuid references public.pricings (id) on delete set null,   -- cálculo que originou os valores atuais
  add column archived_at timestamptz,
  add constraint products_photo_owner check (photo_path is null or photo_path like user_id::text || '/%');

create index products_user_archived on public.products (user_id, archived_at, name);

-- Produtos já existentes (criados a partir de precificações) ganham os dados do último cálculo.
alter table public.products disable trigger products_audit;
update public.products p set
  production_cost = l.unit_cost,
  sale_price = l.unit_price,
  margin_percent = l.margin_percent,
  margin_basis = 'liquida',
  weight_g = nullif((l.input ->> 'filamentGramsPerUnit')::numeric, 0),
  print_minutes = nullif((l.input ->> 'printMinutesPerUnit')::numeric, 0),
  printer_id = l.printer_id,
  printer_name = l.printer_name,
  filament_id = l.filament_id,
  filament_type = (select f.material from public.filaments f where f.id = l.filament_id),
  filament_color = (select f.color from public.filaments f where f.id = l.filament_id),
  material_cost = coalesce((l.result -> 'unit' ->> 'filament')::numeric, 0),
  machine_cost = coalesce((l.result -> 'unit' ->> 'machineHour')::numeric, 0)
               + coalesce((l.result -> 'unit' ->> 'energy')::numeric, 0)
               + coalesce((l.result -> 'unit' ->> 'wear')::numeric, 0),
  other_costs = coalesce((l.result -> 'unit' ->> 'fixed')::numeric, 0)
              + coalesce((l.result -> 'unit' ->> 'losses')::numeric, 0)
              + coalesce((l.result -> 'unit' ->> 'labor')::numeric, 0)
              + coalesce((l.result -> 'unit' ->> 'packaging')::numeric, 0),
  pricing_id = l.id
from public.latest_pricings l
where l.product_id = p.id and p.pricing_id is null;
alter table public.products enable trigger products_audit;

-- A política do produto passa a conferir também impressora, filamento e cálculo (a FK sozinha não impede apontar para dados alheios).
drop policy products_owner on public.products;
create policy products_owner on public.products for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (model_id is null or exists (select 1 from public.imported_models m where m.id = model_id and m.user_id = auth.uid()))
    and (printer_id is null or exists (select 1 from public.printers x where x.id = printer_id and x.user_id = auth.uid()))
    and (filament_id is null or exists (select 1 from public.filaments x where x.id = filament_id and x.user_id = auth.uid()))
    and (pricing_id is null or exists (select 1 from public.pricings x where x.id = pricing_id and x.user_id = auth.uid()))
  );

-- ───────── Clientes ─────────
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  phone text check (char_length(phone) <= 30),
  email text check (char_length(email) <= 160),
  document text check (char_length(document) <= 30),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_user_name on public.customers (user_id, name);
create trigger customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

-- ───────── Perfil do negócio (identidade do vendedor nos orçamentos) ─────────
create table public.business_profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  business_name text check (char_length(business_name) <= 120),
  contact_name text check (char_length(contact_name) <= 120),
  phone text check (char_length(phone) <= 30),
  email text check (char_length(email) <= 160),
  city text check (char_length(city) <= 120),
  logo_path text,
  brand_color text not null default '#d94e1b' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  default_payment_terms text check (char_length(default_payment_terms) <= 1000),
  default_validity_days integer not null default 7 check (default_validity_days between 1 and 365),
  default_notes text check (char_length(default_notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_logo_owner check (logo_path is null or logo_path like user_id::text || '/%')
);
create trigger business_profiles_updated before update on public.business_profiles
  for each row execute function public.set_updated_at();

-- ───────── Orçamentos ─────────
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number integer not null,
  customer_id uuid references public.customers (id) on delete set null,
  -- retrato do cliente no momento do orçamento
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  customer_phone text check (char_length(customer_phone) <= 30),
  customer_email text check (char_length(customer_email) <= 160),
  customer_document text check (char_length(customer_document) <= 30),
  -- 'expirado' é DERIVADO na interface (enviado/rascunho com validade vencida); o valor existe para uso futuro
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'aprovado', 'recusado', 'expirado')),
  issue_date date not null default current_date,
  valid_until date not null,
  production_days integer check (production_days is null or production_days between 0 and 365),
  payment_terms text check (char_length(payment_terms) <= 1000),
  notes text check (char_length(notes) <= 2000),
  discount_type text not null default 'nenhum' check (discount_type in ('nenhum', 'percentual', 'valor')),
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_total numeric(12,2) not null check (discount_total >= 0),
  total numeric(12,2) not null check (total >= 0),
  -- INTERNO: soma dos custos de produção dos itens. Nunca vai ao cliente.
  internal_cost_total numeric(12,2) check (internal_cost_total is null or internal_cost_total >= 0),
  share_path text,
  shared_at timestamptz,
  sent_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_number_unique unique (user_id, number),
  constraint quotes_dates check (valid_until >= issue_date),
  constraint quotes_discount_percent check (discount_type <> 'percentual' or discount_value <= 100),
  constraint quotes_total_math check (total = subtotal - discount_total),
  constraint quotes_discount_cap check (discount_total <= subtotal),
  constraint quotes_share_owner check (share_path is null or share_path like user_id::text || '/%')
);
create index quotes_user_created on public.quotes (user_id, created_at desc);
create index quotes_user_status on public.quotes (user_id, status);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  position integer not null default 0,
  kind text not null check (kind in ('produto', 'personalizacao')),
  product_id uuid references public.products (id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  description text check (char_length(description) <= 1000),
  photo_path text,
  quantity integer not null check (quantity between 1 and 100000),
  list_price numeric(12,2) check (list_price is null or list_price >= 0),     -- preço de tabela no momento
  unit_price numeric(12,2) not null check (unit_price >= 0),                  -- preço aplicado
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  line_total numeric(12,2) not null check (line_total >= 0),
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),        -- INTERNO: custo de produção no momento
  created_at timestamptz not null default now(),
  constraint quote_items_photo_owner check (photo_path is null or photo_path like user_id::text || '/%')
);
create index quote_items_quote on public.quote_items (quote_id, position);

-- ───────── Triggers ─────────
create trigger quotes_updated before update on public.quotes
  for each row execute function public.set_updated_at();
create trigger quotes_audit after insert or update or delete on public.quotes
  for each row execute function public.log_operation();
create trigger quotes_limit before insert on public.quotes
  for each row execute function public.enforce_plan_limit('max_quotes');

-- Número sequencial POR USUÁRIO (o cliente não escolhe o número).
create or replace function public.quotes_assign_number() returns trigger
language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('quote-number:' || new.user_id::text));
  select coalesce(max(number), 0) + 1 into new.number from public.quotes where user_id = new.user_id;
  return new;
end $$;
create trigger quotes_number before insert on public.quotes
  for each row execute function public.quotes_assign_number();

-- Status: só transições válidas; conteúdo: só muda enquanto for rascunho (o retrato enviado não é reescrito).
create or replace function public.quotes_guard() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not (
      (old.status = 'rascunho' and new.status in ('enviado', 'aprovado', 'recusado'))
      or (old.status = 'enviado' and new.status in ('aprovado', 'recusado', 'rascunho'))
      or (old.status in ('recusado', 'expirado') and new.status = 'rascunho')
    ) then
      raise exception 'Mudança de status não permitida (% -> %)', old.status, new.status using errcode = 'P0001';
    end if;
  end if;
  if old.status <> 'rascunho' and new.status = old.status and (
       new.number is distinct from old.number
    or new.customer_id is distinct from old.customer_id
    or new.customer_name is distinct from old.customer_name
    or new.customer_phone is distinct from old.customer_phone
    or new.customer_email is distinct from old.customer_email
    or new.customer_document is distinct from old.customer_document
    or new.issue_date is distinct from old.issue_date
    or new.valid_until is distinct from old.valid_until
    or new.production_days is distinct from old.production_days
    or new.payment_terms is distinct from old.payment_terms
    or new.notes is distinct from old.notes
    or new.discount_type is distinct from old.discount_type
    or new.discount_value is distinct from old.discount_value
    or new.subtotal is distinct from old.subtotal
    or new.discount_total is distinct from old.discount_total
    or new.total is distinct from old.total
    or new.internal_cost_total is distinct from old.internal_cost_total
  ) then
    raise exception 'Orçamento enviado ou decidido não pode ser alterado. Duplique-o para fazer mudanças.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger quotes_guard before update on public.quotes
  for each row execute function public.quotes_guard();

create or replace function public.quote_items_guard() returns trigger
language plpgsql as $$
declare v_status text;
begin
  select status into v_status from public.quotes where id = coalesce(new.quote_id, old.quote_id);
  if v_status is not null and v_status <> 'rascunho' then
    raise exception 'Orçamento enviado ou decidido não pode ser alterado. Duplique-o para fazer mudanças.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger quote_items_guard before insert or update or delete on public.quote_items
  for each row execute function public.quote_items_guard();

-- Funções de gatilho não são chamáveis por RPC.
revoke execute on function public.quotes_assign_number() from public, anon, authenticated;
revoke execute on function public.quotes_guard() from public, anon, authenticated;
revoke execute on function public.quote_items_guard() from public, anon, authenticated;

-- ───────── RLS ─────────
alter table public.customers enable row level security;
alter table public.business_profiles enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

create policy customers_owner on public.customers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy business_profiles_owner on public.business_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy quotes_owner on public.quotes for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (customer_id is null or exists (select 1 from public.customers c where c.id = customer_id and c.user_id = auth.uid()))
  );

create policy quote_items_owner on public.quote_items for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.quotes q where q.id = quote_id and q.user_id = auth.uid())
    and (product_id is null or exists (select 1 from public.products p where p.id = product_id and p.user_id = auth.uid()))
  );

-- ───────── Gravação atômica do orçamento (cabeçalho + itens numa transação) ─────────
-- Roda com os direitos de quem chama (RLS vale). Os totais vêm calculados pelo servidor da aplicação; aqui o banco
-- só confere a consistência (soma dos itens = subtotal) e desfaz tudo se algo não fechar.
create or replace function public.save_quote(p_quote_id uuid, p_quote jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_sum numeric;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O orçamento precisa ter ao menos um item' using errcode = 'P0001';
  end if;

  if p_quote_id is null then
    insert into public.quotes (customer_id, customer_name, customer_phone, customer_email, customer_document,
      issue_date, valid_until, production_days, payment_terms, notes, discount_type, discount_value,
      subtotal, discount_total, total, internal_cost_total)
    values (nullif(p_quote ->> 'customer_id', '')::uuid, p_quote ->> 'customer_name', p_quote ->> 'customer_phone',
      p_quote ->> 'customer_email', p_quote ->> 'customer_document', (p_quote ->> 'issue_date')::date,
      (p_quote ->> 'valid_until')::date, nullif(p_quote ->> 'production_days', '')::integer, p_quote ->> 'payment_terms',
      p_quote ->> 'notes', p_quote ->> 'discount_type', (p_quote ->> 'discount_value')::numeric,
      (p_quote ->> 'subtotal')::numeric, (p_quote ->> 'discount_total')::numeric, (p_quote ->> 'total')::numeric,
      nullif(p_quote ->> 'internal_cost_total', '')::numeric)
    returning id into v_id;
  else
    update public.quotes set
      customer_id = nullif(p_quote ->> 'customer_id', '')::uuid, customer_name = p_quote ->> 'customer_name',
      customer_phone = p_quote ->> 'customer_phone', customer_email = p_quote ->> 'customer_email',
      customer_document = p_quote ->> 'customer_document', issue_date = (p_quote ->> 'issue_date')::date,
      valid_until = (p_quote ->> 'valid_until')::date, production_days = nullif(p_quote ->> 'production_days', '')::integer,
      payment_terms = p_quote ->> 'payment_terms', notes = p_quote ->> 'notes', discount_type = p_quote ->> 'discount_type',
      discount_value = (p_quote ->> 'discount_value')::numeric, subtotal = (p_quote ->> 'subtotal')::numeric,
      discount_total = (p_quote ->> 'discount_total')::numeric, total = (p_quote ->> 'total')::numeric,
      internal_cost_total = nullif(p_quote ->> 'internal_cost_total', '')::numeric
    where id = p_quote_id
    returning id into v_id;
    if v_id is null then raise exception 'Orçamento não encontrado' using errcode = 'P0002'; end if;
    delete from public.quote_items where quote_id = v_id;
  end if;

  insert into public.quote_items (quote_id, position, kind, product_id, name, description, photo_path, quantity,
    list_price, unit_price, discount_percent, line_total, unit_cost)
  select v_id, (t.ord - 1)::integer, t.i ->> 'kind', nullif(t.i ->> 'product_id', '')::uuid, t.i ->> 'name',
    t.i ->> 'description', t.i ->> 'photo_path', (t.i ->> 'quantity')::integer,
    nullif(t.i ->> 'list_price', '')::numeric, (t.i ->> 'unit_price')::numeric, (t.i ->> 'discount_percent')::numeric,
    (t.i ->> 'line_total')::numeric, nullif(t.i ->> 'unit_cost', '')::numeric
  from jsonb_array_elements(p_items) with ordinality as t(i, ord);

  select coalesce(sum(line_total), 0) into v_sum from public.quote_items where quote_id = v_id;
  if abs(v_sum - (select subtotal from public.quotes where id = v_id)) > 0.005 then
    raise exception 'Os totais do orçamento não fecham com a soma dos itens' using errcode = 'P0001';
  end if;
  return v_id;
end $$;
revoke execute on function public.save_quote(uuid, jsonb, jsonb) from public, anon;
