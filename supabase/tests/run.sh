#!/usr/bin/env bash
# Valida migrations + RLS num Postgres descartável (sem Supabase). Requer um servidor acessível via PG* env.
# Ex.: PGHOST=/caminho/socket PGPORT=5433 PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")"
DB="printup_test_$$"
psql -q -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f 00_supabase_stub.sql -f ../migrations/0001_core.sql -f rls.test.sql \
  -f ../migrations/0002_products_pricings.sql -f rls_etapa2.test.sql \
  -f ../migrations/0004_harden_functions.sql -f rls_etapa0.test.sql \
  -f ../migrations/0005_imports.sql -f rls_importacao.test.sql \
  -f seed_pre0006.sql -f ../migrations/0006_catalog_quotes.sql -f rls_catalogo.test.sql \
  -f ../migrations/0007_onboarding.sql -f rls_onboarding.test.sql \
  -f ../migrations/0008_orders_production_stock.sql -f rls_pedidos.test.sql
bash concurrency.sh "$DB"
# Etapa 6 (cobrança): migration 0009 + testes + concorrência de cotas e webhooks
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/0009_billing_plans.sql -f rls_billing.test.sql
bash concurrency_billing.sh "$DB"
# Etapa 7 (Superadmin): migration 0010 + testes + concorrência de cupons
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/0010_superadmin.sql -f rls_admin.test.sql
bash concurrency_admin.sh "$DB"
# Configurações completas e canais de venda
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/0011_configuracoes_completas.sql -f rls_configuracoes.test.sql
