-- Catálogo compartilhável: link público (sem login) com os produtos à venda, preço e disponibilidade.
-- O link é um segredo (128 bits aleatórios). As funções abaixo são a ÚNICA porta de leitura anônima:
-- recebem o token (nunca ids de usuário), devolvem só campos próprios de vitrine (nada de custo, margem ou lucro)
-- e não devolvem nada se o link estiver desativado ou for inválido.

create table public.catalog_shares (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', '') check (token ~ '^[0-9a-f]{32}$'),
  enabled boolean not null default true,
  title text check (title is null or char_length(title) between 1 and 80),
  show_prices boolean not null default true,
  show_out_of_stock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger catalog_shares_updated before update on public.catalog_shares
  for each row execute function public.set_updated_at();

alter table public.catalog_shares enable row level security;
create policy catalog_shares_owner on public.catalog_shares for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.catalog_shares from anon, public;
grant select, insert, update, delete on public.catalog_shares to authenticated;

-- Dados da vitrine (uma linha) ou nenhuma se o link não vale.
create function public.public_catalog_info(p_token text)
returns table (business_name text, brand_color text, phone text, city text, title text, show_prices boolean)
language sql stable security definer set search_path = public as $$
  select b.business_name, coalesce(b.brand_color, '#d94e1b'), b.phone, b.city, s.title, s.show_prices
    from public.catalog_shares s
    left join public.business_profiles b on b.user_id = s.user_id
   where s.token = p_token and s.enabled;
$$;

-- Produtos da vitrine: só ativos, com preço, e (por padrão) com estoque.
create function public.public_catalog_items(p_token text)
returns table (product_id uuid, name text, category text, description text, sale_price numeric, stock_qty integer, has_photo boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.category, p.description,
         case when s.show_prices then p.sale_price end,
         p.stock_qty, p.photo_path is not null
    from public.catalog_shares s
    join public.products p on p.user_id = s.user_id
   where s.token = p_token and s.enabled
     and p.archived_at is null and p.sale_price is not null and p.sale_price > 0
     and (s.show_out_of_stock or p.stock_qty > 0)
   order by p.name
   limit 500;
$$;

-- Caminho da foto de UM produto da vitrine (o servidor entrega a imagem; o bucket continua privado).
create function public.public_catalog_photo(p_token text, p_product_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select p.photo_path
    from public.catalog_shares s
    join public.products p on p.user_id = s.user_id
   where s.token = p_token and s.enabled and p.id = p_product_id
     and p.archived_at is null and p.sale_price is not null and p.sale_price > 0
     and (s.show_out_of_stock or p.stock_qty > 0);
$$;

revoke all on function public.public_catalog_info(text), public.public_catalog_items(text), public.public_catalog_photo(text, uuid) from public;
-- Exceção deliberada à regra "sem EXECUTE para anon": é o que torna o link público. Segurança = token secreto + campos fixos.
grant execute on function public.public_catalog_info(text), public.public_catalog_items(text), public.public_catalog_photo(text, uuid) to anon, authenticated;
