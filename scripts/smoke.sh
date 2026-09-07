#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Runtime smoke test — runs the REAL query layer against a throwaway Postgres.
#
# Why this exists: `tsc` cannot catch a Drizzle expression that compiles to
# valid-but-wrong SQL. It already caught one — a correlated subquery whose
# unqualified column names silently resolved to the wrong table, making every
# order's item count 0. The build was green the whole time.
#
# Needs Docker. Creates and destroys its own container; touches nothing else,
# including the `docker compose` dev database (different name and port).
#
#   npm run smoke
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

PG=clothshop-smoke-pg
PORT=55433

cleanup() { docker rm -f "$PG" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "==> starting throwaway postgres on :$PORT"
docker run -d --name "$PG" -p "$PORT:5432" \
  -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=clothshop postgres:16-alpine >/dev/null

for _ in $(seq 1 30); do
  docker exec "$PG" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

# Every drizzle-generated migration in journal order — 0000_init.sql, then
# the journaled 0001_init_extras.sql (generated columns/triggers/indexes
# drizzle can't model). Globbed rather than listed so a new NNNN_*.sql is
# picked up automatically — a migration missing here fails the run with a
# confusing "column does not exist" instead of an obvious one.
echo "==> applying schema (all migrations)"
MIGRATIONS=()
for f in drizzle/[0-9]*.sql; do
  MIGRATIONS+=("$f")
done

for f in "${MIGRATIONS[@]}" scripts/schema-smoke-test.sql; do
  docker cp "$f" "$PG:/tmp/" >/dev/null
done

for f in "${MIGRATIONS[@]}"; do
  echo "    $(basename "$f")"
  docker exec "$PG" psql -U postgres -d clothshop -q -v ON_ERROR_STOP=1 -f "/tmp/$(basename "$f")"
done

echo ""
echo "==> SCHEMA CHECKS (generated columns, triggers, constraints)"
docker exec "$PG" psql -U postgres -d clothshop -t -f /tmp/schema-smoke-test.sql | grep -E 'PASS|FAIL'

echo ""
echo "==> QUERY-LAYER CHECKS (real src/db/queries/* through real src/db/index.ts)"
DATABASE_URL="postgres://postgres:dev@localhost:$PORT/clothshop" \
  npx tsx --tsconfig tsconfig.smoke.json scripts/_smoke/run.ts
