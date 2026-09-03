# Health Check

**No health check.** This service does not expose an explicit health or
readiness endpoint (no `/api/health`, `/healthz`, or similar route exists
anywhere in `src/app/api/**`). This is absent by design, not by omission —
record that so a future contributor doesn't add one under the assumption it
was simply missed.

## Why there is no health endpoint

The service this app was modelled on (`carstockpro`, a Supabase-backed
sibling project) runs a keepalive cron specifically because Supabase's free
tier *pauses* a project after a period of inactivity and needs a periodic
ping to stay warm. **This app's database, Railway Postgres, is always-on: it
does not pause or autosuspend** — there is no "paused until manually
resumed" (or "suspended until the next query") state to defend against, so
there is nothing for a keepalive job to do. See `docs/cron-flow.md` for the
fuller explanation of why no scheduled job exists in this repo at all.

There is accordingly no cold-start latency to reason about here either — the
database connection pool (`src/db/index.ts`) is opened once when the app's
container starts and stays warm for the container's lifetime.

## Liveness

Liveness is inferred from process/container state only — whatever the
eventual host's own process supervision reports (e.g. "the container is
running and answering requests at all") is the only liveness signal this
service provides. There is no `/api/admin/products`-style deep check that
verifies the database or R2 are reachable before answering.

## The standing security check — the private-field leak test

This is the one thing that actually needs to be checked repeatedly, and it
is a security check, not a health check: Railway Postgres has no public API
of its own (unlike the old Supabase design this replaced, which needed RLS
to guard a publicly reachable database), so the only realistic way private product data
(cost, supplier, exact stock depth) leaks to the public is through **this
app's own public endpoints accidentally selecting private columns** — see
`docs/api-overview.md`'s "Public data contract" section for the mechanism
(the RSC-payload leak path in particular).

Run this block against any environment before calling it live, and again
after any change to `src/db/queries/storefront.ts` or `src/app/api/products`:

```bash
BASE="https://<your-deploy>"     # or http://localhost:3000

# 1. Public product API must never carry private fields
curl -s "$BASE/api/products" \
  | grep -Ei 'originalPrice|buyingSource|sourceLink|margin' \
  && echo "FAIL: private field leaked" || echo "PASS"

# 2. Nor exact stock depth
curl -s "$BASE/api/products" | grep -E '"quantity"' \
  && echo "FAIL: stock depth leaked" || echo "PASS"

# 3. Nor the server-rendered detail page (RSC payload included)
curl -s "$BASE/th/shop/<code>" \
  | grep -Ei 'originalPrice|buyingSource|sourceLink|margin' \
  && echo "FAIL: leaked in HTML/RSC" || echo "PASS"

# 4. Admin endpoints reject anonymous callers
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/admin/products"       # expect 401
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/uploads/presign"      # expect 401

# 5. Private fields never reach the client bundle (run from a local build)
grep -rE 'buyingSource|originalPrice' .next/static/chunks/ \
  && echo "FAIL: shipped to browser" || echo "PASS"
```

Note that check 3 here targets `/th/shop/<code>` — this app's storefront
lives entirely under a `/[locale]` prefix (`/th`, `/en`), unlike a
non-localized app where `/shop/<code>` would resolve directly. There is no
public database API to test separately in this stack (contrast with an
app fronting Supabase or a similar BaaS with its own public REST/GraphQL
surface) — every check above targets one of this app's *own* routes.

### Pass criteria

- Checks 1–3 and 5: the `grep` must find **nothing** — a match means a
  private field or exact stock count leaked into a response the public can
  read, which is a CRITICAL-severity finding (see
  `~/.claude/rules/common/code-review.md`'s severity table) and must block
  any deploy until fixed.
- Checks 4: both curls must print `401`. A `200`, a `307`/`302` redirect, or
  any other code means an admin-only endpoint is reachable (or silently
  redirecting instead of rejecting) an anonymous caller.

**Re-run the whole block after any change to `queries/storefront.ts` or
`/api/products`.** This is the single highest-value regression check in the
codebase, because there is no database-level RLS backstop behind it — see
`CLAUDE.md`'s security-model section for why.

## The standing schema check — does the money math still work?

The security check above proves nothing private leaks out. This one proves the
numbers the owner sees are right.

Every monetary figure in the app is computed **in Postgres**, not in TypeScript:

| Figure | Mechanism |
|---|---|
| `products.margin` | `GENERATED ALWAYS AS (sell_price - original_price)` |
| `order_items.line_total` / `line_cost` | `GENERATED ALWAYS` |
| `orders.items_total` / `items_cost` | maintained by the `recalc_order` trigger |
| `orders.total_cost` / `profit` | `GENERATED ALWAYS` over the above |

None of that is visible to `tsc`. Drizzle cannot model `GENERATED ALWAYS`, and
the trigger exists only in `drizzle/0000_init_extras.sql` — the file that is
**not** in Drizzle's migration journal and must be applied by hand. A green
build says nothing about whether profit is calculated correctly; a forgotten
extras file yields orders that silently report zero profit.

`scripts/schema-smoke-test.sql` executes all of it against a throwaway database
and prints PASS/FAIL per check. It runs inside a transaction and rolls back.

```bash
npm run smoke
```

That script (`scripts/smoke.sh`) is self-contained: it starts a throwaway
plain Docker Postgres container, applies **both** migration files, runs the
schema assertions, then runs the query-layer assertions against the real
`src/db/index.ts` module, and destroys the container on exit. It touches
nothing else on the machine — not even the `docker compose` dev database
(different container name and port).

It has two halves, 32 checks total: 8 schema checks plus 24 query-layer and
transaction checks (including the two rollback/commit checks below). The
first half executes the SQL guarantees directly:

The eight schema checks:

1. `margin` computes from sell price minus cost
2. `line_total` / `line_cost` compute per line
3. Order totals aggregate correctly, including shipping and packing
4. Changing a line quantity recomputes the order
5. **Stock is untouched by orders** — manual stock is deliberate product
   behaviour. A FAIL here means someone added a decrement trigger. Do not
   "fix" it by making this check pass; remove the trigger.
6. Order history survives deleting the product (the line is a snapshot;
   `product_id` nulls but `product_code` and the figures remain)
7. Cancelled orders are excluded from revenue
8. Deleting an order cascades to its line items, leaving no orphans

**Re-run after any change to either file under `drizzle/`.** All eight must
print PASS.


The second half runs the **real** functions from `src/db/queries/*` against
that database, through the **real, unmodified** `src/db/index.ts` — no test
double or driver substitution in the path. `tsconfig.smoke.json` stubs only
`server-only` (via a `paths` remap), because that package throws when
required outside a bundler; the database module itself is untouched.

This half exists because `tsc` cannot catch a Drizzle expression that compiles
to valid-but-wrong SQL — and it has already caught exactly that. A correlated
subquery in `getOrders` interpolated `${orderItems.orderId}` and `${orders.id}`,
which Drizzle emitted as *unqualified* names (`"order_id" = "id"`). Since
`order_items` has its own `id` column, the predicate silently became
`order_items.order_id = order_items.id` — never true, so every order reported
zero line items. The build was green throughout.

It asserts, among other things:

- Draft and archived products are unreachable through every public query
- `getPublicProducts` / `getPublicProductByCode` return **no** private field,
  verified by a recursive scan of the returned structure rather than by
  inspection — this is the programmatic form of the leak test above
- Public variants carry `inStock` and never `quantity`
- Product-code lookup is case-insensitive
- Admin queries *do* see cost fields (the converse check — proving the split is
  real rather than just absent everywhere)
- Order search matches by customer name and by order number, and misses cleanly
- The dashboard and reports aggregates execute without SQL errors
- **`db.transaction()` rolls back on a thrown error** — a product inserted
  inside a transaction that then throws does not survive the transaction,
  proven by counting rows before and after
- **`db.transaction()` commits on success** — a product inserted inside a
  transaction that completes normally does survive

Those last two are the direct proof that the pooled `node-postgres` driver's
interactive transactions actually work end to end — see `CLAUDE.md` for why
that used to be a real limitation (`txDb()`'s origin) and isn't anymore.

**Run `npm run smoke` after any change to `src/db/queries/*`, `src/db/schema.ts`,
or either file under `drizzle/`.** All checks must print PASS.
