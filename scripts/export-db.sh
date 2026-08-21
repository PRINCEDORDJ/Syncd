#!/usr/bin/env bash
# Refresh the portable backend export in db-export/.
#
#   1. schema.sql  — consolidated from supabase/migrations in filename order
#   2. data/*.csv  — one CSV per public table, all rows
#
# Requires psql with PG* env vars pointing at the source database.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/db-export"
mkdir -p "$OUT/data"

# ---------- 1. schema ----------
{
  echo "-- Consolidated schema for Syncd"
  echo "-- Generated from supabase/migrations in filename order."
  echo "-- Run top-to-bottom against a fresh Supabase project (SQL editor or psql)."
  echo
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo
    echo "-- ============================================================"
    echo "-- $(basename "$f")"
    echo "-- ============================================================"
    cat "$f"
    echo
  done
} > "$OUT/schema.sql"
echo "wrote $OUT/schema.sql"

# ---------- 2. data ----------
TABLES=$(psql -t -A -c "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")

for t in $TABLES; do
  psql -c "COPY (SELECT * FROM public.\"$t\") TO STDOUT WITH CSV HEADER" > "$OUT/data/$t.csv"
  rows=$(( $(wc -l < "$OUT/data/$t.csv") - 1 ))
  echo "wrote $OUT/data/$t.csv ($rows rows)"
done

echo "done."
