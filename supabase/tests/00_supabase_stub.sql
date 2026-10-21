-- Stub mínimo do Supabase para testar migrations em um Postgres puro. NÃO usar em produção.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}', email text, last_sign_in_at timestamptz, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'service_role') $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- Reproduz os privilégios padrão do Supabase: objetos criados no schema public já nascem
-- acessíveis a anon/authenticated/service_role (por isso o teste não pode "dar" grants depois).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Stub mínimo do Supabase Storage (apenas o necessário para testar as policies do bucket).
create schema if not exists storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null, owner uuid default auth.uid(), metadata jsonb
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select case when array_length(string_to_array(name, '/'), 1) > 1
    then (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] else '{}'::text[] end
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;
grant select on storage.buckets to anon;
