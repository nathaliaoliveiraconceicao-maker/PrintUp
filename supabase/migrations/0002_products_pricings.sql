-- PrintUp · Etapa 2: produtos e precificações salvas (snapshots imutáveis).

-- ───────── Produtos ─────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_user on public.products (user_id, name);
create trigger products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- ───────── Precificações ─────────
-- Cada linha é um retrato do cálculo no momento em que foi salvo: mudar custos, impressoras
-- ou filamentos depois NÃO altera o histórico. Não há policy de UPDATE (imutável para clientes).
create table public.pricings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  printer_id uuid references public.printers (id) on delete set null,
  filament_id uuid references public.filaments (id) on delete set null,
  printer_name text,
  filament_name text,
  quantity integer not null check (quantity >= 1),
  pricing_mode text not null check (pricing_mode in ('margin', 'markup')),
  unit_cost numeric(12,2) not null,
  unit_price numeric(12,2) not null,
  unit_profit numeric(12,2) not null,
  margin_percent numeric(8,2) not null,
  markup_percent numeric(10,2) not null,
  input jsonb not null,
  result jsonb not null,
  engine_version integer not null default 1,
  created_at timestamptz not null default now()
);
create index pricings_product_created on public.pricings (product_id, created_at desc);
create index pricings_user_created on public.pricings (user_id, created_at desc);

-- Última precificação de cada produto (respeita RLS de quem consulta).
create view public.latest_pricings with (security_invoker = true) as
  select distinct on (product_id) *
  from public.pricings
  order by product_id, created_at desc;

-- ───────── Triggers ─────────
-- Auditoria enxuta para pricings: não copia os JSONs grandes.
create or replace function public.log_operation_slim() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb;
begin
  v_row := to_jsonb(case when tg_op = 'DELETE' then old else new end) - 'input' - 'result';
  insert into public.audit_log (user_id, action, entity, entity_id, changes)
  values (auth.uid(), lower(tg_op), tg_table_name, v_row ->> 'id', v_row);
  return coalesce(new, old);
end $$;

create trigger products_audit after insert or update or delete on public.products
  for each row execute function public.log_operation();
create trigger pricings_audit after insert or delete on public.pricings
  for each row execute function public.log_operation_slim();

-- Limite de produtos pelo plano; pricings exige assinatura ativa (sem limite numérico).
create trigger products_limit before insert on public.products
  for each row execute function public.enforce_plan_limit('max_products');
create trigger pricings_limit before insert on public.pricings
  for each row execute function public.enforce_plan_limit('max_pricings');

-- ───────── RLS ─────────
alter table public.products enable row level security;
alter table public.pricings enable row level security;

create policy products_owner on public.products for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy pricings_select on public.pricings for select to authenticated
  using (user_id = auth.uid());
create policy pricings_delete on public.pricings for delete to authenticated
  using (user_id = auth.uid());
-- Insert: o produto, a impressora e o filamento referenciados precisam ser do próprio usuário
-- (FK sozinha não impede apontar para dados de outro cliente).
create policy pricings_insert on public.pricings for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.products p where p.id = product_id and p.user_id = auth.uid())
    and (printer_id is null or exists (select 1 from public.printers x where x.id = printer_id and x.user_id = auth.uid()))
    and (filament_id is null or exists (select 1 from public.filaments x where x.id = filament_id and x.user_id = auth.uid()))
  );
