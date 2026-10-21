-- PrintUp · Etapa 2: importador de modelos 3D (modelos, perfis por placa, miniaturas e armazenamento).
--
-- Regra de ouro (CLAUDE.md): nunca inventar dados. Peso e tempo podem ficar em branco (NULL);
-- quando existem, a ORIGEM é obrigatória, e quando não existem, a origem tem de ser NULL.

-- ───────── Modelos importados ─────────
create table public.imported_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  designer text check (char_length(designer) <= 120),
  source text not null check (source in ('arquivo', 'manual', 'link')),
  source_url text,
  slicer_label text check (char_length(slicer_label) <= 120),   -- ex.: "Bambu Studio 01.08.00.62"
  plate_count integer check (plate_count is null or plate_count between 1 and 1000),
  parse_notes text[] not null default '{}',                      -- o que NÃO foi encontrado no arquivo
  -- arquivo original (opcional: só é guardado se o usuário pedir) e miniatura
  file_path text,
  file_name text,
  file_size bigint check (file_size is null or file_size >= 0),
  file_kind text check (file_kind in ('3mf', 'gcode')),
  thumb_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- arquivos só podem estar na pasta do próprio usuário
  constraint imported_models_path_owner check (file_path is null or file_path like user_id::text || '/%'),
  constraint imported_models_thumb_owner check (thumb_path is null or thumb_path like user_id::text || '/%'),
  constraint imported_models_file_consistency check (
    (file_path is null and file_kind is null) or (file_path is not null and file_kind is not null)
  )
);
create index imported_models_user_created on public.imported_models (user_id, created_at desc);
create unique index imported_models_file_path on public.imported_models (file_path) where file_path is not null;
create trigger imported_models_updated before update on public.imported_models
  for each row execute function public.set_updated_at();

-- ───────── Perfis de impressão (um por placa) ─────────
create table public.print_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  model_id uuid not null references public.imported_models (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  plate_index integer check (plate_index is null or plate_index >= 1),
  piece_count integer check (piece_count is null or piece_count between 1 and 100000),
  slicer_printer_name text check (char_length(slicer_printer_name) <= 120),
  printer_model_code text check (char_length(printer_model_code) <= 60),
  nozzle_mm numeric(4,2) check (nozzle_mm is null or nozzle_mm > 0),
  layer_height_mm numeric(5,3) check (layer_height_mm is null or layer_height_mm > 0),
  filament_type text check (char_length(filament_type) <= 80),   -- resumo, ex.: "PLA" ou "PLA + PETG"
  materials jsonb,                                                -- [{type,color,grams}], quando o arquivo traz
  weight_g numeric(10,2) check (weight_g is null or weight_g > 0),
  print_minutes numeric(10,2) check (print_minutes is null or print_minutes > 0),
  support_used boolean,
  waste_g numeric(10,2) check (waste_g is null or waste_g >= 0),
  weight_origin text check (weight_origin in ('arquivo', 'manual')),
  time_origin text check (time_origin in ('arquivo', 'manual')),
  edited_fields text[] not null default '{}',                     -- campos que o usuário corrigiu depois da leitura
  field_origins jsonb not null default '{}'::jsonb check (jsonb_typeof(field_origins) = 'object'), -- origem de peças/impressora/material/suporte/desperdício
  raw_meta jsonb,                                                 -- chaves reconhecidas, para conferência
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint print_profiles_weight_origin check ((weight_g is null) = (weight_origin is null)),
  constraint print_profiles_time_origin check ((print_minutes is null) = (time_origin is null))
);
create index print_profiles_model on public.print_profiles (model_id);
create trigger print_profiles_updated before update on public.print_profiles
  for each row execute function public.set_updated_at();

-- ───────── Triggers: auditoria e assinatura ativa ─────────
create trigger imported_models_audit after insert or update or delete on public.imported_models
  for each row execute function public.log_operation();
create trigger imported_models_limit before insert on public.imported_models
  for each row execute function public.enforce_plan_limit('max_models');

-- ───────── RLS ─────────
alter table public.imported_models enable row level security;
alter table public.print_profiles enable row level security;

create policy imported_models_owner on public.imported_models for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy print_profiles_select on public.print_profiles for select to authenticated
  using (user_id = auth.uid());
create policy print_profiles_delete on public.print_profiles for delete to authenticated
  using (user_id = auth.uid());
create policy print_profiles_insert on public.print_profiles for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.imported_models m where m.id = model_id and m.user_id = auth.uid())
  );
create policy print_profiles_update on public.print_profiles for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.imported_models m where m.id = model_id and m.user_id = auth.uid())
  );

-- ───────── Vínculos: precificações e produtos ─────────
-- O retrato do cálculo continua imutável; guardamos de onde vieram os dados importados.
alter table public.pricings
  add column print_profile_id uuid references public.print_profiles (id) on delete set null,
  add column import_info jsonb;

drop policy pricings_insert on public.pricings;
create policy pricings_insert on public.pricings for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.products p where p.id = product_id and p.user_id = auth.uid())
    and (printer_id is null or exists (select 1 from public.printers x where x.id = printer_id and x.user_id = auth.uid()))
    and (filament_id is null or exists (select 1 from public.filaments x where x.id = filament_id and x.user_id = auth.uid()))
    and (print_profile_id is null or exists (select 1 from public.print_profiles x where x.id = print_profile_id and x.user_id = auth.uid()))
  );

-- O produto pode apontar para o modelo de origem (foto, arquivo e dados de impressão).
alter table public.products add column model_id uuid references public.imported_models (id) on delete set null;
drop policy products_owner on public.products;
create policy products_owner on public.products for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (model_id is null or exists (select 1 from public.imported_models m where m.id = model_id and m.user_id = auth.uid()))
  );

-- ───────── Limite de armazenamento por plano ─────────
-- VALORES PROVISÓRIOS (decisão comercial pendente): ajuste em `plans.limits.max_storage_mb`.
update public.plans set limits = limits || '{"max_storage_mb": 50}'   where code = 'trial';
update public.plans set limits = limits || '{"max_storage_mb": 300}'  where code = 'starter';
update public.plans set limits = limits || '{"max_storage_mb": 1000}' where code = 'pro';

-- Bytes já guardados pelo usuário no bucket (soma dos tamanhos reais gravados pelo Storage).
create or replace function public.storage_used_bytes(p_user uuid default auth.uid())
returns bigint language sql stable security definer set search_path = public, storage as $$
  select coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'model-files' and (storage.foldername(o.name))[1] = p_user::text;
$$;

-- Limite em bytes do plano ativo; NULL = ilimitado. Sem assinatura ativa => 0 (nada novo é aceito).
create or replace function public.storage_limit_bytes(p_user uuid default auth.uid())
returns bigint language plpgsql stable security definer set search_path = public as $$
declare v record;
begin
  select * into v from public.current_entitlements(p_user);
  if not found or not v.active then return 0; end if;
  if v.limits ->> 'max_storage_mb' is null then return null; end if;
  return (v.limits ->> 'max_storage_mb')::bigint * 1048576;
end $$;

-- Só o próprio usuário consulta o próprio consumo (as funções ignoram ids de terceiros).
create or replace function public.can_store_upload(p_user uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_limit bigint;
begin
  if p_user is distinct from auth.uid() then return false; end if;
  v_limit := public.storage_limit_bytes(p_user);
  return v_limit is null or public.storage_used_bytes(p_user) < v_limit;
end $$;

revoke execute on function public.storage_used_bytes(uuid) from public, anon;
revoke execute on function public.storage_limit_bytes(uuid) from public, anon;
revoke execute on function public.can_store_upload(uuid) from public, anon;

-- ───────── Storage: bucket privado, uma pasta por usuário ─────────
-- Caminho esperado: <user_id>/<arquivo>. Limite de 50 MB por arquivo (teto do plano gratuito do Supabase).
insert into storage.buckets (id, name, public, file_size_limit)
values ('model-files', 'model-files', false, 52428800)
on conflict (id) do nothing;

create policy model_files_select on storage.objects for select to authenticated
  using (bucket_id = 'model-files' and (storage.foldername(name))[1] = auth.uid()::text);
-- O envio é bloqueado quando o usuário já atingiu o limite do plano (pode ultrapassar em, no máximo, um arquivo).
create policy model_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'model-files'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_store_upload(auth.uid())
  );
create policy model_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'model-files' and (storage.foldername(name))[1] = auth.uid()::text);
-- Sem policy de UPDATE: arquivos enviados não são sobrescritos.
