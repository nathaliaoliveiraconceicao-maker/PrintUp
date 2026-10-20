#!/usr/bin/env bash
# Valida migrations + RLS num Postgres descartável (sem Supabase). Requer um servidor acessível via PG* env.
# Ex.: PGHOST=/caminho/socket PGPORT=5433 PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")"
DB="printup_test_$$"
psql -q -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f 00_supabase_stub.sql -f ../migrations/0001_core.sql -f rls.test.sql
