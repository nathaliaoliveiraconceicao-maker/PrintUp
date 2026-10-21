-- PrintUp · Etapa 5: pedidos, produção (Kanban) e estoque de filamento por bobina.
--
-- Princípios:
--  - Estoque tem DUAS quantidades por bobina: `remaining_g` (físico) e `reserved_g` (comprometido com trabalhos).
--    Orçamento não mexe em estoque. Criar tarefa de produção RESERVA; concluir CONSOME; cancelar LIBERA.
--  - Todo movimento passa pelo livro-razão `stock_movements` (imutável) e é idempotente. Saldos só mudam por funções
--    (trava de linha + transação), nunca por UPDATE direto do cliente.
--  - Status do pedido (produção/entrega) e status do pagamento são independentes. Recebimentos são lançamentos
--    (`order_payments`); receita recebida = soma dos lançamentos, nunca "pedido pago" digitado.
--  - Custo real e lucro realizado são calculados na aplicação (src/features/orders/financials.ts) a partir dos
--    valores registrados aqui.

-- ───────── Filamentos: nível mínimo para alerta ─────────
alter table public.filaments
  add column min_stock_g integer not null default 250 check (min_stock_g >= 0 and min_stock_g <= 1000000);

-- ───────── Bobinas ─────────
create table public.filament_spools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  filament_id uuid references public.filaments (id) on delete set null,
  manufacturer text check (char_length(manufacturer) <= 80),
  material text not null check (char_length(material) between 1 and 40),
  color text check (char_length(color) <= 40),
  initial_g numeric(12,2) not null check (initial_g > 0),
  remaining_g numeric(12,2) not null check (remaining_g >= 0),
  reserved_g numeric(12,2) not null default 0 check (reserved_g >= 0),
  price_paid numeric(12,2) not null default 0 check (price_paid >= 0),
  purchased_at date,
  location text check (char_length(location) <= 80),
  status text not null default 'nova' check (status in ('nova', 'em_uso', 'vazia', 'descartada')),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index filament_spools_user on public.filament_spools (user_id, filament_id);
create trigger filament_spools_updated before update on public.filament_spools
  for each row execute function public.set_updated_at();

-- Saldos só mudam dentro de `stock_ledger_move` (que liga a variável `printup.ledger` na transação).
create or replace function public.filament_spools_guard() returns trigger
language plpgsql as $$
begin
  if (new.remaining_g is distinct from old.remaining_g or new.reserved_g is distinct from old.reserved_g
      or new.initial_g is distinct from old.initial_g or new.user_id is distinct from old.user_id)
     and coalesce(current_setting('printup.ledger', true), '') <> 'on' then
    raise exception 'O saldo da bobina só muda por movimentações registradas' using errcode = 'P0001';
  end if;
  if new.status = 'descartada' and new.reserved_g > 0 then
    raise exception 'Bobina com material reservado não pode ser descartada' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger filament_spools_guard before update on public.filament_spools
  for each row execute function public.filament_spools_guard();

-- ───────── Livro-razão de estoque (imutável) ─────────
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spool_id uuid not null references public.filament_spools (id) on delete cascade,
  job_id uuid,
  order_id uuid,
  kind text not null check (kind in ('entrada', 'reserva', 'liberacao', 'consumo', 'falha', 'ajuste')),
  delta_remaining numeric(12,2) not null default 0,
  delta_reserved numeric(12,2) not null default 0,
  balance_remaining numeric(12,2) not null,
  balance_reserved numeric(12,2) not null,
  idempotency_key text,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index stock_movements_spool on public.stock_movements (spool_id, created_at);
create index stock_movements_job on public.stock_movements (job_id);
-- Mesma operação repetida (duplo clique, reenvio) não gera segundo movimento.
create unique index stock_movements_idem on public.stock_movements (user_id, idempotency_key) where idempotency_key is not null;

-- ───────── Pedidos ─────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  number integer not null,
  customer_id uuid references public.customers (id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  customer_phone text check (char_length(customer_phone) <= 30),
  quote_id uuid references public.quotes (id) on delete set null,
  order_date date not null default current_date,
  due_date date,
  status text not null default 'novo' check (status in ('novo', 'aguardando_pagamento', 'em_producao', 'pronto', 'entregue', 'cancelado')),
  payment_method text check (payment_method in ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto', 'outro')),
  payment_status text not null default 'pendente' check (payment_status in ('pendente', 'parcial', 'pago')),
  amount_paid numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  total numeric(12,2) not null check (total >= 0),
  estimated_cost numeric(12,2) check (estimated_cost is null or estimated_cost >= 0),
  notes text check (char_length(notes) <= 2000),
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_number_unique unique (user_id, number),
  constraint orders_total_math check (total = subtotal - discount_total),
  constraint orders_due check (due_date is null or due_date >= order_date)
);
-- Um orçamento vira, no máximo, um pedido (mesmo com cliques simultâneos).
create unique index orders_one_per_quote on public.orders (quote_id) where quote_id is not null;
create index orders_user_status on public.orders (user_id, status, due_date);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  position integer not null default 0,
  kind text not null check (kind in ('produto', 'personalizacao')),
  product_id uuid references public.products (id) on delete set null,
  name text not null check (char_length(name) between 1 and 160),
  description text check (char_length(description) <= 1000),
  quantity integer not null check (quantity between 1 and 100000),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  line_total numeric(12,2) not null check (line_total >= 0),
  -- Retrato do que a produção precisa saber (por unidade); vem do cadastro do produto.
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  material_cost numeric(12,2),
  machine_cost numeric(12,2),
  other_costs numeric(12,2),
  weight_g numeric(10,2) check (weight_g is null or weight_g >= 0),
  print_minutes numeric(10,2) check (print_minutes is null or print_minutes >= 0),
  printer_id uuid references public.printers (id) on delete set null,
  filament_id uuid references public.filaments (id) on delete set null,
  needs_production boolean not null default false,
  created_at timestamptz not null default now()
);
create index order_items_order on public.order_items (order_id, position);

-- Recebimentos e estornos: a receita recebida é a soma destes lançamentos.
create table public.order_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null default 'recebimento' check (kind in ('recebimento', 'estorno')),
  amount numeric(12,2) not null check (amount > 0),
  method text check (method in ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'transferencia', 'boleto', 'outro')),
  paid_at date not null default current_date,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index order_payments_order on public.order_payments (order_id);

-- ───────── Produção ─────────
create table public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  product_name text not null,
  quantity integer not null check (quantity >= 1),
  printer_id uuid references public.printers (id) on delete set null,
  printer_name text,
  filament_id uuid references public.filaments (id) on delete set null,
  filament_name text,
  stage text not null default 'aguardando' check (stage in ('aguardando', 'preparando', 'imprimindo', 'acabamento', 'concluido', 'cancelado')),
  est_grams numeric(12,2) check (est_grams is null or est_grams >= 0),
  est_minutes numeric(12,2) check (est_minutes is null or est_minutes >= 0),
  waste_percent numeric(6,2) not null default 0 check (waste_percent between 0 and 500),
  actual_grams numeric(12,2),
  actual_minutes numeric(12,2),
  failed_grams numeric(12,2) not null default 0,
  failed_minutes numeric(12,2) not null default 0,
  failed_count integer not null default 0,
  real_material_cost numeric(12,2),
  real_machine_cost numeric(12,2),
  real_other_cost numeric(12,2),
  failed_cost numeric(12,2) not null default 0,
  notes text check (char_length(notes) <= 500),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index production_jobs_user_stage on public.production_jobs (user_id, stage);
create index production_jobs_order on public.production_jobs (order_id);
create trigger production_jobs_updated before update on public.production_jobs
  for each row execute function public.set_updated_at();

-- Quanto de cada bobina está reservado para cada tarefa.
create table public.job_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null references public.production_jobs (id) on delete cascade,
  spool_id uuid not null references public.filament_spools (id) on delete cascade,
  grams numeric(12,2) not null check (grams > 0),
  created_at timestamptz not null default now(),
  unique (job_id, spool_id)
);

-- ───────── Auditoria ─────────
create trigger orders_audit after insert or update or delete on public.orders for each row execute function public.log_operation();
create trigger order_payments_audit after insert or update or delete on public.order_payments for each row execute function public.log_operation();
create trigger production_jobs_audit after insert or update or delete on public.production_jobs for each row execute function public.log_operation();
create trigger filament_spools_audit after insert or update or delete on public.filament_spools for each row execute function public.log_operation();

-- ───────── Número do pedido por usuário ─────────
create or replace function public.orders_assign_number() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext('order-number:' || new.user_id::text));
  select coalesce(max(number), 0) + 1 into new.number from public.orders where user_id = new.user_id;
  return new;
end $$;
create trigger orders_number before insert on public.orders for each row execute function public.orders_assign_number();
create trigger orders_updated before update on public.orders for each row execute function public.set_updated_at();

-- ───────── Regras do pedido ─────────
create or replace function public.order_has_active_jobs(p_order uuid) returns boolean
language sql stable as $$
  select exists (select 1 from public.production_jobs where order_id = p_order and stage not in ('concluido', 'cancelado'))
$$;
create or replace function public.order_has_jobs(p_order uuid) returns boolean
language sql stable as $$
  select exists (select 1 from public.production_jobs where order_id = p_order and stage <> 'cancelado')
$$;

create or replace function public.orders_guard() returns trigger language plpgsql as $$
declare v_edit boolean;
begin
  -- Status: só transições válidas; cancelar só pela função (que libera o estoque reservado).
  if new.status is distinct from old.status then
    if new.status = 'cancelado' then
      if coalesce(current_setting('printup.cancel_ok', true), '') <> 'on' then
        raise exception 'Para cancelar um pedido use a ação Cancelar pedido' using errcode = 'P0001';
      end if;
    elsif not (
      (old.status = 'novo' and new.status in ('aguardando_pagamento', 'em_producao', 'pronto'))
      or (old.status = 'aguardando_pagamento' and new.status in ('novo', 'em_producao', 'pronto'))
      or (old.status = 'em_producao' and new.status in ('pronto', 'aguardando_pagamento'))
      or (old.status = 'pronto' and new.status in ('entregue', 'em_producao'))
    ) then
      raise exception 'Mudança de status não permitida (% -> %)', old.status, new.status using errcode = 'P0001';
    end if;
    if new.status = 'entregue' then
      if public.order_has_active_jobs(old.id) then
        raise exception 'Há tarefas de produção em andamento neste pedido' using errcode = 'P0001';
      end if;
      new.delivered_at := now();
    end if;
    if new.status = 'cancelado' then new.cancelled_at := now(); end if;
  end if;

  -- Conteúdo só muda enquanto o pedido não entrou em produção.
  v_edit := old.status in ('novo', 'aguardando_pagamento') and not public.order_has_jobs(old.id);
  if not v_edit and (
       new.customer_id is distinct from old.customer_id or new.customer_name is distinct from old.customer_name
    or new.customer_phone is distinct from old.customer_phone or new.subtotal is distinct from old.subtotal
    or new.discount_total is distinct from old.discount_total or new.total is distinct from old.total
    or new.estimated_cost is distinct from old.estimated_cost or new.order_date is distinct from old.order_date
    or new.quote_id is distinct from old.quote_id or new.number is distinct from old.number) then
    raise exception 'Pedido em produção, entregue ou cancelado não pode ter os itens alterados' using errcode = 'P0001';
  end if;
  if old.status = 'cancelado' and (new.due_date is distinct from old.due_date or new.payment_method is distinct from old.payment_method) then
    raise exception 'Pedido cancelado não pode ser alterado' using errcode = 'P0001';
  end if;

  -- O valor recebido só muda por lançamentos de pagamento.
  if new.amount_paid is distinct from old.amount_paid and coalesce(current_setting('printup.pay_ok', true), '') <> 'on' then
    raise exception 'O valor recebido só muda por lançamentos de pagamento' using errcode = 'P0001';
  end if;
  -- Status do pagamento é derivado do que foi recebido.
  new.payment_status := case when new.amount_paid <= 0 then 'pendente' when new.amount_paid >= new.total - 0.005 then 'pago' else 'parcial' end;
  return new;
end $$;
create trigger orders_guard before update on public.orders for each row execute function public.orders_guard();

create or replace function public.order_items_guard() returns trigger language plpgsql as $$
declare v_order uuid := coalesce(new.order_id, old.order_id); v_status text;
begin
  select status into v_status from public.orders where id = v_order;
  if v_status is not null and (v_status not in ('novo', 'aguardando_pagamento') or public.order_has_jobs(v_order)) then
    raise exception 'Pedido em produção, entregue ou cancelado não pode ter os itens alterados' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger order_items_guard before insert or update or delete on public.order_items for each row execute function public.order_items_guard();

-- Recebimentos: não passam do total; estorno não passa do recebido; recalcula o pedido.
create or replace function public.order_payments_apply() returns trigger language plpgsql as $$
declare v_total numeric; v_status text; v_net numeric;
begin
  select total, status into v_total, v_status from public.orders where id = new.order_id for update;
  select coalesce(sum(case kind when 'recebimento' then amount else -amount end), 0) into v_net from public.order_payments where order_id = new.order_id;
  if new.kind = 'recebimento' then
    if v_status = 'cancelado' then raise exception 'Pedido cancelado não recebe novos pagamentos' using errcode = 'P0001'; end if;
    if v_net + new.amount > v_total + 0.005 then raise exception 'O valor passa do saldo a receber do pedido' using errcode = 'P0001'; end if;
  elsif new.amount > v_net + 0.005 then
    raise exception 'O estorno é maior que o valor recebido' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger order_payments_apply before insert on public.order_payments for each row execute function public.order_payments_apply();

create or replace function public.order_payments_after() returns trigger language plpgsql as $$
declare v_paid numeric; v_order uuid := coalesce(new.order_id, old.order_id);
begin
  select coalesce(sum(case kind when 'recebimento' then amount else -amount end), 0) into v_paid from public.order_payments where order_id = v_order;
  perform set_config('printup.pay_ok', 'on', true);
  update public.orders set amount_paid = v_paid where id = v_order;
  perform set_config('printup.pay_ok', 'off', true);
  return null;
end $$;
create trigger order_payments_after after insert or delete on public.order_payments for each row execute function public.order_payments_after();

-- Excluir: usuário logado só apaga pedido novo, sem produção nem pagamentos (os demais se cancelam e ficam no histórico).
-- Remoção administrativa / exclusão da conta (sem usuário logado) não é bloqueada.
create or replace function public.orders_delete_guard() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (old.status <> 'novo' or public.order_has_jobs(old.id)
      or exists (select 1 from public.order_payments where order_id = old.id)) then
    raise exception 'Só pedidos novos, sem produção e sem pagamentos podem ser excluídos. Cancele o pedido.' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger orders_delete_guard before delete on public.orders for each row execute function public.orders_delete_guard();

-- ───────── RLS ─────────
alter table public.filament_spools enable row level security;
alter table public.stock_movements enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_payments enable row level security;
alter table public.production_jobs enable row level security;
alter table public.job_reservations enable row level security;

-- Bobinas: o dono lê e edita só os dados descritivos (o saldo é protegido pelo gatilho); criar só pela função.
create policy filament_spools_select on public.filament_spools for select to authenticated using (user_id = auth.uid());
create policy filament_spools_update on public.filament_spools for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (filament_id is null or exists (select 1 from public.filaments f where f.id = filament_id and f.user_id = auth.uid())));
create policy stock_movements_select on public.stock_movements for select to authenticated using (user_id = auth.uid());
create policy production_jobs_select on public.production_jobs for select to authenticated using (user_id = auth.uid());
create policy job_reservations_select on public.job_reservations for select to authenticated using (user_id = auth.uid());

create policy orders_owner on public.orders for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (customer_id is null or exists (select 1 from public.customers c where c.id = customer_id and c.user_id = auth.uid()))
    and (quote_id is null or exists (select 1 from public.quotes q where q.id = quote_id and q.user_id = auth.uid()))
  );
create policy order_items_owner on public.order_items for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
    and (product_id is null or exists (select 1 from public.products p where p.id = product_id and p.user_id = auth.uid()))
  );
create policy order_payments_select on public.order_payments for select to authenticated using (user_id = auth.uid());
create policy order_payments_insert on public.order_payments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- ═════════════════════════════════════════════════════════════════════════════
-- Funções de estoque e produção (SECURITY DEFINER, sempre amarradas a auth.uid()).
-- Elas conferem que cada id recebido pertence a quem chama; nunca confiam em user_id vindo do cliente.
-- ═════════════════════════════════════════════════════════════════════════════

-- Interno: aplica UM movimento a uma bobina e o registra no livro-razão. Devolve false se a chave já foi usada.
create or replace function public.stock_ledger_move(
  p_spool uuid, p_kind text, p_d_rem numeric, p_d_res numeric, p_job uuid, p_order uuid, p_key text, p_note text
) returns boolean language plpgsql security definer set search_path = public as $$
declare s public.filament_spools;
begin
  if p_key is not null and exists (select 1 from public.stock_movements where user_id = auth.uid() and idempotency_key = p_key) then
    return false;
  end if;
  perform set_config('printup.ledger', 'on', true);
  update public.filament_spools set
    remaining_g = remaining_g + p_d_rem,
    reserved_g = reserved_g + p_d_res,
    status = case
      when remaining_g + p_d_rem <= 0 then 'vazia'
      when status = 'vazia' and p_d_rem > 0 then 'em_uso'
      when status = 'nova' and p_d_rem < 0 then 'em_uso'
      else status end
  where id = p_spool and user_id = auth.uid()
  returning * into s;
  perform set_config('printup.ledger', 'off', true);
  if s.id is null then raise exception 'Bobina não encontrada' using errcode = 'P0002'; end if;
  insert into public.stock_movements (user_id, spool_id, job_id, order_id, kind, delta_remaining, delta_reserved, balance_remaining, balance_reserved, idempotency_key, note)
  values (s.user_id, s.id, p_job, p_order, p_kind, p_d_rem, p_d_res, s.remaining_g, s.reserved_g, p_key, p_note);
  return true;
end $$;

-- Cadastro de bobina: cria a bobina e a entrada no livro-razão, juntas.
create or replace function public.create_spool(
  p_filament uuid, p_manufacturer text, p_material text, p_color text, p_initial_g numeric,
  p_price_paid numeric, p_purchased_at date, p_location text, p_notes text, p_key text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); f public.filaments; v_id uuid; v_material text; v_color text; v_brand text;
begin
  if v_uid is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  if p_initial_g is null or round(p_initial_g, 2) <= 0 then raise exception 'Informe o peso da bobina' using errcode = 'P0001'; end if;
  p_initial_g := round(p_initial_g, 2);
  if p_filament is not null then
    select * into f from public.filaments where id = p_filament and user_id = v_uid;
    if f.id is null then raise exception 'Filamento não encontrado' using errcode = 'P0002'; end if;
  end if;
  v_material := coalesce(nullif(trim(p_material), ''), f.material);
  v_color := coalesce(nullif(trim(p_color), ''), f.color);
  v_brand := coalesce(nullif(trim(p_manufacturer), ''), f.brand);
  if v_material is null then raise exception 'Informe o tipo de material' using errcode = 'P0001'; end if;
  if p_key is not null then
    select spool_id into v_id from public.stock_movements where user_id = v_uid and idempotency_key = p_key;
    if v_id is not null then return v_id; end if;
  end if;
  perform set_config('printup.ledger', 'on', true);
  insert into public.filament_spools (user_id, filament_id, manufacturer, material, color, initial_g, remaining_g, price_paid, purchased_at, location, notes)
  values (v_uid, p_filament, v_brand, v_material, v_color, p_initial_g, 0, coalesce(p_price_paid, 0), p_purchased_at, nullif(trim(p_location), ''), nullif(trim(p_notes), ''))
  returning id into v_id;
  perform set_config('printup.ledger', 'off', true);
  -- o saldo entra pelo livro-razão: a bobina nasce com 0 e a entrada soma o peso inicial
  perform public.stock_ledger_move(v_id, 'entrada', p_initial_g, 0, null, null, p_key, 'Entrada da bobina');
  return v_id;
end $$;

-- Ajuste manual do saldo (contagem física, erro de cadastro). Fica registrado.
create or replace function public.adjust_spool(p_spool uuid, p_new_remaining numeric, p_note text, p_key text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); s public.filament_spools;
begin
  if v_uid is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into s from public.filament_spools where id = p_spool and user_id = v_uid for update;
  if s.id is null then raise exception 'Bobina não encontrada' using errcode = 'P0002'; end if;
  if p_new_remaining is null or p_new_remaining < 0 then raise exception 'Informe um saldo válido' using errcode = 'P0001'; end if;
  if p_new_remaining = s.remaining_g then return; end if;
  perform public.stock_ledger_move(p_spool, 'ajuste', p_new_remaining - s.remaining_g, 0, null, null, p_key, p_note);
end $$;

-- Interno: custo por grama de uma bobina.
create or replace function public.spool_cost_per_g(p_spool uuid) returns numeric language sql stable as $$
  select case when initial_g > 0 then price_paid / initial_g else 0 end from public.filament_spools where id = p_spool
$$;

-- Interno: reserva o material de uma tarefa (o que falta), em bobinas do filamento escolhido.
-- Trava as bobinas candidatas em ordem de id: dois pedidos simultâneos não reservam o mesmo grama duas vezes.
create or replace function public.reserve_job_stock(p_job uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); j public.production_jobs; v_need numeric; v_avail numeric; s record; v_take numeric;
begin
  select * into j from public.production_jobs where id = p_job and user_id = v_uid for update;
  if j.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  if j.stage in ('concluido', 'cancelado') then return 0; end if;
  v_need := coalesce(j.est_grams, 0) - coalesce((select sum(grams) from public.job_reservations where job_id = p_job), 0);
  if v_need <= 0.004 then return 0; end if;
  if j.filament_id is null then raise exception 'Escolha um filamento para reservar o material' using errcode = 'P0001'; end if;
  perform 1 from public.filament_spools where user_id = v_uid and filament_id = j.filament_id and status in ('nova', 'em_uso') order by id for update;
  select coalesce(sum(remaining_g - reserved_g), 0) into v_avail from public.filament_spools
    where user_id = v_uid and filament_id = j.filament_id and status in ('nova', 'em_uso') and remaining_g - reserved_g > 0;
  if v_avail < v_need - 0.004 then
    raise exception 'Estoque insuficiente: faltam % g de %', round(v_need - v_avail, 1), coalesce(j.filament_name, 'filamento') using errcode = 'P0001';
  end if;
  for s in select * from public.filament_spools
           where user_id = v_uid and filament_id = j.filament_id and status in ('nova', 'em_uso') and remaining_g - reserved_g > 0
           order by (status = 'em_uso') desc, purchased_at nulls last, created_at, id loop
    v_take := least(v_need, s.remaining_g - s.reserved_g);
    insert into public.job_reservations (user_id, job_id, spool_id, grams) values (v_uid, p_job, s.id, v_take)
      on conflict (job_id, spool_id) do update set grams = public.job_reservations.grams + excluded.grams;
    perform public.stock_ledger_move(s.id, 'reserva', 0, v_take, p_job, j.order_id, null, null);
    v_need := v_need - v_take;
    exit when v_need <= 0.004;
  end loop;
  return coalesce(j.est_grams, 0);
end $$;

-- Reservar depois (ex.: após comprar uma bobina) uma tarefa criada sem reserva.
create or replace function public.reserve_job(p_job uuid) returns numeric
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  return public.reserve_job_stock(p_job);
end $$;

-- Interno: libera todas as reservas de uma tarefa.
create or replace function public.release_job_stock(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_order uuid;
begin
  select order_id into v_order from public.production_jobs where id = p_job and user_id = auth.uid();
  perform 1 from public.filament_spools where id in (select spool_id from public.job_reservations where job_id = p_job) order by id for update;
  for r in select * from public.job_reservations where job_id = p_job order by created_at, id loop
    perform public.stock_ledger_move(r.spool_id, 'liberacao', 0, -r.grams, p_job, v_order, null, null);
  end loop;
  delete from public.job_reservations where job_id = p_job;
end $$;

-- Interno: baixa `p_grams` de uma tarefa. Primeiro nas bobinas reservadas, depois em qualquer bobina do filamento.
-- p_kind = 'consumo' libera a reserva inteira; 'falha' só baixa o material (a reserva continua para a reimpressão).
-- Devolve o custo do material baixado, pelo preço pago em cada bobina.
create or replace function public.consume_job_stock(p_job uuid, p_grams numeric, p_kind text, p_key text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); j public.production_jobs; v_left numeric := coalesce(p_grams, 0); v_cost numeric := 0;
  r record; s record; v_take numeric;
begin
  select * into j from public.production_jobs where id = p_job and user_id = v_uid;
  if j.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  perform 1 from public.filament_spools
    where id in (select spool_id from public.job_reservations where job_id = p_job)
       or (user_id = v_uid and filament_id = j.filament_id and j.filament_id is not null)
    order by id for update;
  -- 1) bobinas reservadas
  for r in select jr.spool_id, jr.grams from public.job_reservations jr where jr.job_id = p_job order by jr.created_at, jr.id loop
    select * into s from public.filament_spools where id = r.spool_id;
    v_take := least(v_left, s.remaining_g);
    if v_take > 0 or p_kind = 'consumo' then
      perform public.stock_ledger_move(r.spool_id, p_kind, -v_take, case when p_kind = 'consumo' then -r.grams else 0 end, p_job, j.order_id,
        case when p_key is null then null else p_key || ':' || r.spool_id::text end, null);
    end if;
    v_cost := v_cost + v_take * public.spool_cost_per_g(r.spool_id);
    v_left := v_left - v_take;
  end loop;
  if p_kind = 'consumo' then delete from public.job_reservations where job_id = p_job; end if;
  -- 2) o que passou do reservado: qualquer bobina do filamento com saldo físico
  if v_left > 0.004 and j.filament_id is not null then
    for s in select * from public.filament_spools
             where user_id = v_uid and filament_id = j.filament_id and remaining_g > 0 and status in ('nova', 'em_uso')
             order by (status = 'em_uso') desc, purchased_at nulls last, created_at, id loop
      v_take := least(v_left, s.remaining_g);
      perform public.stock_ledger_move(s.id, p_kind, -v_take, 0, p_job, j.order_id,
        case when p_key is null then null else p_key || ':x:' || s.id::text end, null);
      v_cost := v_cost + v_take * public.spool_cost_per_g(s.id);
      v_left := v_left - v_take;
      exit when v_left <= 0.004;
    end loop;
  end if;
  if v_left > 0.004 then
    raise exception 'Estoque físico insuficiente para registrar % g. Ajuste ou cadastre a bobina e tente de novo.', round(v_left, 1) using errcode = 'P0001';
  end if;
  return round(v_cost, 2);
end $$;

-- Interno: quando todas as unidades dos itens de produção estão concluídas, o pedido fica "pronto".
create or replace function public.refresh_order_status(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.order_items where order_id = p_order and needs_production) then return; end if;
  if exists (
    select 1 from public.order_items oi
    where oi.order_id = p_order and oi.needs_production
      and oi.quantity > coalesce((select sum(quantity) from public.production_jobs where order_item_id = oi.id and stage = 'concluido'), 0)
  ) then return; end if;
  update public.orders set status = 'pronto' where id = p_order and user_id = auth.uid() and status in ('novo', 'aguardando_pagamento', 'em_producao');
end $$;

-- Cria uma tarefa (lote) de produção a partir de um item do pedido. Divide em lotes: cada chamada pega parte da quantidade.
-- p_mode 'reservar' (padrão): confere e reserva o material; sem estoque suficiente a tarefa NÃO é criada.
-- p_mode 'sem_reserva': cria a tarefa mesmo assim (o usuário assume o risco; dá para reservar depois).
create or replace function public.create_job(
  p_item uuid, p_qty integer, p_printer uuid, p_filament uuid, p_est_grams numeric, p_est_minutes numeric,
  p_waste_percent numeric default 0, p_mode text default 'reservar'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); it public.order_items; o public.orders; v_assigned integer; v_id uuid;
  v_grams numeric; v_minutes numeric; v_fil uuid; pr public.printers; fi public.filaments;
begin
  if v_uid is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into it from public.order_items where id = p_item and user_id = v_uid;
  if it.id is null then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  select * into o from public.orders where id = it.order_id and user_id = v_uid for update;
  if o.status in ('cancelado', 'entregue') then raise exception 'Este pedido não aceita novas tarefas' using errcode = 'P0001'; end if;
  if not it.needs_production then raise exception 'Este item não precisa de impressão' using errcode = 'P0001'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'Informe a quantidade do lote' using errcode = 'P0001'; end if;
  select coalesce(sum(quantity), 0) into v_assigned from public.production_jobs where order_item_id = p_item and stage <> 'cancelado';
  if v_assigned + p_qty > it.quantity then
    raise exception 'Quantidade maior que a restante do item (restam %)', it.quantity - v_assigned using errcode = 'P0001';
  end if;
  v_fil := coalesce(p_filament, it.filament_id);
  if p_printer is not null then select * into pr from public.printers where id = p_printer and user_id = v_uid;
    if pr.id is null then raise exception 'Impressora não encontrada' using errcode = 'P0002'; end if; end if;
  if v_fil is not null then select * into fi from public.filaments where id = v_fil and user_id = v_uid;
    if fi.id is null then raise exception 'Filamento não encontrado' using errcode = 'P0002'; end if; end if;
  v_grams := coalesce(p_est_grams, case when it.weight_g is not null then round(it.weight_g * p_qty * (1 + coalesce(p_waste_percent, 0) / 100), 2) end);
  v_minutes := coalesce(p_est_minutes, case when it.print_minutes is not null then round(it.print_minutes * p_qty, 2) end);
  insert into public.production_jobs (user_id, order_id, order_item_id, product_name, quantity, printer_id, printer_name, filament_id, filament_name,
    est_grams, est_minutes, waste_percent)
  values (v_uid, o.id, it.id, it.name, p_qty, pr.id, pr.name, fi.id, fi.name, v_grams, v_minutes, coalesce(p_waste_percent, 0))
  returning id into v_id;
  if p_mode = 'reservar' and v_fil is not null and coalesce(v_grams, 0) > 0 then
    perform public.reserve_job_stock(v_id);
  end if;
  return v_id;
end $$;

-- Move a tarefa entre as etapas (menos "concluído", que registra o consumo, e "cancelado").
create or replace function public.set_job_stage(p_job uuid, p_stage text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); j public.production_jobs;
begin
  if v_uid is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  if p_stage not in ('aguardando', 'preparando', 'imprimindo', 'acabamento') then
    raise exception 'Use Concluir para finalizar a tarefa' using errcode = 'P0001';
  end if;
  select * into j from public.production_jobs where id = p_job and user_id = v_uid for update;
  if j.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  if j.stage in ('concluido', 'cancelado') then raise exception 'Tarefa já encerrada' using errcode = 'P0001'; end if;
  update public.production_jobs set stage = p_stage, started_at = coalesce(started_at, case when p_stage <> 'aguardando' then now() end) where id = p_job;
  if p_stage <> 'aguardando' then
    update public.orders set status = 'em_producao' where id = j.order_id and user_id = v_uid and status in ('novo', 'aguardando_pagamento');
  end if;
end $$;

-- Conclui a tarefa e registra o CONSUMO REAL (gramas e minutos). Repetir a chamada não baixa o estoque de novo.
create or replace function public.complete_job(p_job uuid, p_actual_grams numeric, p_actual_minutes numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); j public.production_jobs; it public.order_items; v_mat numeric; v_mach numeric; v_ratio numeric;
begin
  if v_uid is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into j from public.production_jobs where id = p_job and user_id = v_uid for update;
  if j.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  if j.stage = 'concluido' then return jsonb_build_object('already', true); end if;
  if j.stage = 'cancelado' then raise exception 'Tarefa cancelada não pode ser concluída' using errcode = 'P0001'; end if;
  if p_actual_grams is not null and p_actual_grams < 0 then raise exception 'Informe um consumo válido' using errcode = 'P0001'; end if;
  if p_actual_minutes is not null and p_actual_minutes < 0 then raise exception 'Informe um tempo válido' using errcode = 'P0001'; end if;
  select * into it from public.order_items where id = j.order_item_id;

  if j.filament_id is not null then
    -- sem consumo informado, assume o estimado (e registra assim); nunca deixa a reserva presa
    v_mat := public.consume_job_stock(p_job, coalesce(p_actual_grams, j.est_grams, 0), 'consumo', 'job:' || p_job::text || ':consumo');
  end if;
  v_ratio := case when coalesce(j.est_minutes, 0) > 0 and p_actual_minutes is not null then p_actual_minutes / j.est_minutes else 1 end;
  v_mach := case when it.machine_cost is not null then round(it.machine_cost * j.quantity * v_ratio, 2) end;

  update public.production_jobs set
    stage = 'concluido', completed_at = now(), started_at = coalesce(started_at, now()),
    actual_grams = coalesce(p_actual_grams, j.est_grams), actual_minutes = coalesce(p_actual_minutes, j.est_minutes),
    real_material_cost = v_mat, real_machine_cost = v_mach,
    real_other_cost = case when it.other_costs is not null then round(it.other_costs * j.quantity, 2) end,
    notes = coalesce(nullif(trim(p_note), ''), notes)
  where id = p_job;
  perform public.refresh_order_status(j.order_id);
  return jsonb_build_object('already', false, 'material_cost', v_mat);
end $$;

-- Falha de impressão: o material perdido sai do estoque e a tarefa continua (a reserva fica para a reimpressão).
create or replace function public.report_failure(p_job uuid, p_grams_lost numeric, p_minutes_lost numeric, p_note text, p_key text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); j public.production_jobs; v_cost numeric := 0; v_short numeric; v_dup boolean := false;
begin
  if v_uid is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into j from public.production_jobs where id = p_job and user_id = v_uid for update;
  if j.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  if j.stage in ('concluido', 'cancelado') then raise exception 'Tarefa já encerrada' using errcode = 'P0001'; end if;
  if p_grams_lost is null or p_grams_lost < 0 then raise exception 'Informe quantas gramas foram perdidas' using errcode = 'P0001'; end if;
  if p_key is not null and exists (select 1 from public.stock_movements where user_id = v_uid and idempotency_key like p_key || '%') then
    v_dup := true;
  end if;
  if not v_dup then
    if p_grams_lost > 0 and j.filament_id is not null then
      v_cost := public.consume_job_stock(p_job, p_grams_lost, 'falha', p_key);
    end if;
    update public.production_jobs set
      failed_grams = failed_grams + p_grams_lost, failed_minutes = failed_minutes + coalesce(p_minutes_lost, 0),
      failed_count = failed_count + 1, failed_cost = failed_cost + v_cost,
      notes = coalesce(nullif(trim(p_note), ''), notes)
    where id = p_job;
  end if;
  select greatest(0, coalesce(j.est_grams, 0) - coalesce((select sum(s.remaining_g) from public.job_reservations jr join public.filament_spools s on s.id = jr.spool_id where jr.job_id = p_job), 0))
    into v_short;
  return jsonb_build_object('duplicate', v_dup, 'cost', v_cost, 'shortage_for_reprint', v_short);
end $$;

-- Cancela uma tarefa ainda não concluída e libera o material reservado.
create or replace function public.cancel_job(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); j public.production_jobs;
begin
  if v_uid is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into j from public.production_jobs where id = p_job and user_id = v_uid for update;
  if j.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  if j.stage = 'cancelado' then return; end if;
  if j.stage = 'concluido' then raise exception 'Tarefa concluída não pode ser cancelada' using errcode = 'P0001'; end if;
  perform public.release_job_stock(p_job);
  update public.production_jobs set stage = 'cancelado' where id = p_job;
end $$;

-- Cancela o pedido: encerra as tarefas ativas (liberando o estoque reservado). O que já foi consumido continua consumido,
-- e os pagamentos recebidos continuam registrados (estorne se devolver o dinheiro).
create or replace function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); o public.orders; j record;
begin
  if v_uid is null then raise exception 'Sessão inválida' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order and user_id = v_uid for update;
  if o.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if o.status = 'cancelado' then return; end if;
  if o.status = 'entregue' then raise exception 'Pedido entregue não pode ser cancelado' using errcode = 'P0001'; end if;
  for j in select id from public.production_jobs where order_id = p_order and stage not in ('concluido', 'cancelado') order by id loop
    perform public.cancel_job(j.id);
  end loop;
  perform set_config('printup.cancel_ok', 'on', true);
  update public.orders set status = 'cancelado' where id = p_order;
  perform set_config('printup.cancel_ok', 'off', true);
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- Pedidos: gravação atômica e conversão de orçamento (rodam com os direitos de quem chama: RLS vale).
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.save_order(p_order_id uuid, p_order jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_sum numeric; v_cost numeric;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O pedido precisa ter ao menos um item' using errcode = 'P0001';
  end if;
  if p_order_id is null then
    insert into public.orders (customer_id, customer_name, customer_phone, order_date, due_date, payment_method, notes, subtotal, discount_total, total)
    values (nullif(p_order ->> 'customer_id', '')::uuid, p_order ->> 'customer_name', nullif(p_order ->> 'customer_phone', ''),
      coalesce(nullif(p_order ->> 'order_date', '')::date, current_date), nullif(p_order ->> 'due_date', '')::date,
      nullif(p_order ->> 'payment_method', ''), nullif(p_order ->> 'notes', ''),
      (p_order ->> 'subtotal')::numeric, (p_order ->> 'discount_total')::numeric, (p_order ->> 'total')::numeric)
    returning id into v_id;
  else
    update public.orders set
      customer_id = nullif(p_order ->> 'customer_id', '')::uuid, customer_name = p_order ->> 'customer_name',
      customer_phone = nullif(p_order ->> 'customer_phone', ''), due_date = nullif(p_order ->> 'due_date', '')::date,
      payment_method = nullif(p_order ->> 'payment_method', ''), notes = nullif(p_order ->> 'notes', ''),
      subtotal = (p_order ->> 'subtotal')::numeric, discount_total = (p_order ->> 'discount_total')::numeric, total = (p_order ->> 'total')::numeric
    where id = p_order_id returning id into v_id;
    if v_id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
    delete from public.order_items where order_id = v_id;
  end if;

  -- Retrato de produção/custo vem do cadastro do produto (não do navegador).
  insert into public.order_items (order_id, position, kind, product_id, name, description, quantity, unit_price, discount_percent, line_total,
    unit_cost, material_cost, machine_cost, other_costs, weight_g, print_minutes, printer_id, filament_id, needs_production)
  select v_id, (t.ord - 1)::integer, t.i ->> 'kind', p.id, t.i ->> 'name', nullif(t.i ->> 'description', ''),
    (t.i ->> 'quantity')::integer, (t.i ->> 'unit_price')::numeric, coalesce((t.i ->> 'discount_percent')::numeric, 0), (t.i ->> 'line_total')::numeric,
    p.production_cost, p.material_cost, p.machine_cost, p.other_costs, p.weight_g, p.print_minutes, p.printer_id, p.filament_id,
    (t.i ->> 'kind') = 'produto'
  from jsonb_array_elements(p_items) with ordinality as t(i, ord)
  left join public.products p on p.id = nullif(t.i ->> 'product_id', '')::uuid;

  select coalesce(sum(line_total), 0), sum(unit_cost * quantity) into v_sum, v_cost from public.order_items where order_id = v_id;
  if abs(v_sum - (select subtotal from public.orders where id = v_id)) > 0.005 then
    raise exception 'Os totais do pedido não fecham com a soma dos itens' using errcode = 'P0001';
  end if;
  update public.orders set estimated_cost = v_cost where id = v_id;
  return v_id;
end $$;

-- Converte um orçamento APROVADO em pedido. Idempotente: repetir (ou clicar duas vezes ao mesmo tempo) devolve o pedido já criado.
create or replace function public.convert_quote_to_order(p_quote uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare q public.quotes; v_id uuid; v_cost numeric;
begin
  select * into q from public.quotes where id = p_quote;
  if q.id is null then raise exception 'Orçamento não encontrado' using errcode = 'P0002'; end if;
  select id into v_id from public.orders where quote_id = p_quote;
  if v_id is not null then return jsonb_build_object('order_id', v_id, 'created', false); end if;
  if q.status <> 'aprovado' then raise exception 'Só orçamentos aprovados viram pedido' using errcode = 'P0001'; end if;

  insert into public.orders (customer_id, customer_name, customer_phone, quote_id, order_date, due_date, notes, subtotal, discount_total, total)
  values (q.customer_id, q.customer_name, q.customer_phone, q.id, current_date,
    case when q.production_days is not null then current_date + q.production_days end, q.notes, q.subtotal, q.discount_total, q.total)
  on conflict (quote_id) where quote_id is not null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.orders where quote_id = p_quote;
    return jsonb_build_object('order_id', v_id, 'created', false);
  end if;

  insert into public.order_items (order_id, position, kind, product_id, name, description, quantity, unit_price, discount_percent, line_total,
    unit_cost, material_cost, machine_cost, other_costs, weight_g, print_minutes, printer_id, filament_id, needs_production)
  select v_id, qi.position, qi.kind, p.id, qi.name, qi.description, qi.quantity, qi.unit_price, qi.discount_percent, qi.line_total,
    qi.unit_cost, p.material_cost, p.machine_cost, p.other_costs, p.weight_g, p.print_minutes, p.printer_id, p.filament_id, qi.kind = 'produto'
  from public.quote_items qi left join public.products p on p.id = qi.product_id
  where qi.quote_id = p_quote;
  select sum(unit_cost * quantity) into v_cost from public.order_items where order_id = v_id;
  update public.orders set estimated_cost = v_cost where id = v_id;
  return jsonb_build_object('order_id', v_id, 'created', true);
end $$;

-- ───────── Permissões das funções ─────────
revoke execute on function public.stock_ledger_move(uuid, text, numeric, numeric, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.reserve_job_stock(uuid) from public, anon, authenticated;
revoke execute on function public.release_job_stock(uuid) from public, anon, authenticated;
revoke execute on function public.consume_job_stock(uuid, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.refresh_order_status(uuid) from public, anon, authenticated;
revoke execute on function public.spool_cost_per_g(uuid) from public, anon;
revoke execute on function public.orders_assign_number() from public, anon, authenticated;
revoke execute on function public.orders_guard() from public, anon, authenticated;
revoke execute on function public.orders_delete_guard() from public, anon, authenticated;
revoke execute on function public.order_items_guard() from public, anon, authenticated;
revoke execute on function public.order_payments_apply() from public, anon, authenticated;
revoke execute on function public.order_payments_after() from public, anon, authenticated;
revoke execute on function public.filament_spools_guard() from public, anon, authenticated;
revoke execute on function public.create_spool(uuid, text, text, text, numeric, numeric, date, text, text, text) from public, anon;
revoke execute on function public.adjust_spool(uuid, numeric, text, text) from public, anon;
revoke execute on function public.reserve_job(uuid) from public, anon;
revoke execute on function public.create_job(uuid, integer, uuid, uuid, numeric, numeric, numeric, text) from public, anon;
revoke execute on function public.set_job_stage(uuid, text) from public, anon;
revoke execute on function public.complete_job(uuid, numeric, numeric, text) from public, anon;
revoke execute on function public.report_failure(uuid, numeric, numeric, text, text) from public, anon;
revoke execute on function public.cancel_job(uuid) from public, anon;
revoke execute on function public.cancel_order(uuid) from public, anon;
revoke execute on function public.save_order(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.convert_quote_to_order(uuid) from public, anon;
