@AGENTS.md

# clothshop — project notes

A personal clothing-brand storefront with an owner-only admin. Thai default,
English toggle, both path-prefixed (`/th`, `/en`). Modelled on `carstockpro`
(a Supabase-backed sibling project) but rebuilt on Railway Postgres +
Drizzle + Auth.js + Cloudflare R2 — several architectural decisions below
exist specifically *because* this stack has no RLS layer that `carstockpro`
could lean on. See `README.md` for setup and `docs/` for the full flow/API
reference.

## Security model (read this first)

- **There is no RLS in this stack, and the server-action `isOwner()` check is
  the entire security boundary.** Railway Postgres has no public database
  API — every query runs through this app's own server code over a private
  connection string — so there is no second wall behind a forgotten check. Under
  Supabase (`carstockpro`), a missing role check in application code still
  hit an RLS policy at the database. Here, a missing `if (!isOwner(user.role))`
  in a Server Action is a **full breach with no backstop**. Every action
  under `src/app/[locale]/admin/**/actions.ts` re-checks `isOwner(user.role)`
  independently, even when the page/route that calls it is already gated —
  never assume the proxy or `requireOwner()` already covered it, and never
  add a new mutation without repeating the check yourself.
- **The RSC-payload leak is the realistic way private data escapes, not a
  theoretical one.** A Server Component that fetches a full product row
  (e.g. via the admin-only `queries/products.ts`) and hands it to a client
  component serializes **every field into the RSC payload** — including
  `originalPrice`, `buyingSource`, `sourceLink`, `margin`, and exact variant
  `quantity`, even for fields the JSX never renders. Clean-looking HTML is
  not proof the page is safe. The structural defense is
  `src/db/queries/storefront.ts`'s `PUBLIC_PRODUCT_COLUMNS` — every public
  read (storefront pages, `GET /api/products`) must derive its select list
  from that object, so the private columns are never selected out of the
  database on a public path in the first place. Never spread `products.*`
  and never pass a full product row into anything that renders on `/` or
  `/shop`. `docs/health-check.md` carries the standing curl-based leak test
  — re-run it after touching `queries/storefront.ts` or `/api/products`.
- **`/track/[code]` is a second public read of a table that also carries
  private figures, and it gets the identical treatment.** Guest checkout
  (no accounts at all — see the domain invariant below) means anyone with a
  preorder code, or anyone who guesses one, can load `/track/<code>` with no
  session check whatsoever. `orders` carries `profit`, `totalCost`,
  `itemsCost`, `advertisingCost`, `packingCost`, and each line carries
  `productCost`/`lineCost` — none of which may ever reach this path. The
  structural defense is `src/db/queries/track.ts`'s
  `PUBLIC_ORDER_COLUMNS`/`PUBLIC_ORDER_ITEM_COLUMNS` — the only column sets
  `getOrderByPreorderCode` may select. Also deliberately absent from the
  response: `orders.orderNo` — it is a sequential, enumerable bigint
  identity, and printing it on a public URL would let anyone page through
  every order in the shop by incrementing a number, defeating the entire
  reason the preorder code is random rather than sequential. Never spread
  `orders.*`/`orderItems.*` here, and never pass an admin-fetched order row
  (e.g. from `queries/orders.ts`) into anything that renders under
  `/track`. `docs/health-check.md`'s check 6 is the standing curl-based leak
  test for this route — re-run it after touching `queries/track.ts` or the
  track page components.

## Framework specifics (differ from common assumptions)

- **Next.js 16** uses `src/proxy.ts`, not `middleware.ts` — Next 16 renamed
  Middleware to Proxy (file convention `src/proxy.ts`, named export `proxy`).
  `NextProxy` is a type alias for `NextMiddleware`, so Auth.js v5's
  `auth(callback)` — which already returns a `NextMiddleware`-shaped function
  — composes directly with zero adapter needed, just the export name change.
  **Next 16's proxy runs on the Node runtime, not edge** — do not assume
  edge-only APIs are available inside it, and do not "port" it back to an
  edge runtime config.
- **The auth guard is inverted (denylist, not allowlist)** — the opposite of
  `carstockpro`'s `PUBLIC_PATHS` allowlist. This shop's storefront is
  public-by-design (the storefront *is* the product), so `src/proxy.ts`
  checks the request path against `PROTECTED_PREFIXES = ["/admin",
  "/api/admin", "/api/uploads"]` and lets everything else through
  unauthenticated. `/api/**` paths that fail this check get a JSON `401`;
  page paths get a `307` redirect to `/login` — an API caller must never see
  a redirect (a `fetch`/`curl` following it would see a `200` HTML login
  page instead of a clear failure).
- **`setRequestLocale()` is load-bearing — do not skip it on any layout or
  page that should render statically.** Calling `getLocale()` (or any
  next-intl API) before `setRequestLocale(locale)` has run for the request
  falls through to `headers()`, which silently forces the route to dynamic
  (`ƒ`) rendering — no error, no warning, just a route that quietly stops
  being ISR-cached. `src/i18n/request.ts` deliberately reads the locale from
  `requestLocale` (populated by the proxy from the URL segment), never from
  `cookies()`, for the same reason.
- **`<html lang>` lives in `src/app/[locale]/layout.tsx`, not the root
  layout — this is deliberate, do not move it back up.** The root layout
  (`src/app/layout.tsx`) is a passthrough that renders no `<html>`/`<body>`
  at all, because it sits above the `[locale]` segment and structurally
  cannot know the locale without a dynamic read (which would undo the whole
  point of URL-segment locales). Putting `<html lang>` in the `[locale]`
  layout means the **prerendered bytes** carry the correct locale — the
  thing crawlers, `hreflang` consumers, and screen readers actually read.
  Every route that renders outside `[locale]` (currently `not-found.tsx` and
  Next's global-error boundary) must supply its own `<html>`/`<body>`.
- **The client message bundle is scoped — a new namespace must be classified
  or it silently fails to reach the client.** `[locale]/layout.tsx` defines
  `PUBLIC_NAMESPACES` (currently `app`, `common`, `nav`, `auth`, `home`,
  `footer`, `shop`, `cart`, `checkout`, `track`, `errors`) and ships **only** those to
  `NextIntlClientProvider` on public pages — the admin vocabulary
  (`product`, `order`, `dashboard`, `reports`, `import`, `settings`,
  `variant`) would otherwise bloat every customer-facing page's RSC payload
  for no reason (not a leak — they're field labels, never values — but dead
  weight that grows with every admin feature). `admin/layout.tsx`
  re-provides the full bundle for the admin subtree. Add a namespace to
  `src/messages/{th,en}.json` and forget to add it to `PUBLIC_NAMESPACES` (if
  it's meant to be public) and a public client component's translated string
  will silently be missing at runtime — no build error.
- **Tailwind v4, no config file** — theme tokens are CSS variables in
  `src/app/globals.css`. shadcn/ui `base-nova` style built on **`@base-ui`**
  (not Radix) — components use the `render` prop, not `asChild`.

## Domain invariants (do not "fix" these)

- **Manual stock is deliberate — never add an order→stock decrement
  trigger.** `productVariants.quantity` and orders are independent ledgers
  by design (see the comment on `productVariants` in `src/db/schema.ts`).
  The owner adjusts quantities by hand after checking physical stock.
  Wiring a decrement on order creation would silently start lying about
  stock the moment a cancelled or edited order didn't reverse cleanly.
- **Order lines are snapshots — reports group on `orderItems.productCode`,
  never `productId`.** `orderItems.productId` is `ON DELETE SET NULL`
  (a soft link for reporting convenience only); `productCode`, `productName`,
  `productType`, `color`, `size`, `productCost`, and `sellPrice` are all
  copied onto the line item at order time so a later product edit — or a
  product delete — never rewrites history. `src/db/queries/reports.ts`'s
  `profitByProduct` groups on the snapshotted `productCode` specifically so
  a deleted product's historical profit survives the product row being gone.
- **Computed fields are DB-enforced — never write them from application
  code.** `products.margin`, `orders.totalCost`/`profit`, and
  `orderItems.lineTotal`/`lineCost` are Postgres `GENERATED ALWAYS AS (...)
  STORED` columns (added by `drizzle/0001_init_extras.sql`, not modeled as
  generated in `schema.ts`'s column builders — see that file's header
  comment). Postgres rejects a write that names them (`23P05`). Separately,
  `orders.itemsTotal`/`itemsCost` are **trigger-maintained** (not generated —
  a stored generated column can't reference another generated column, and
  `totalCost`/`profit` need to read from these), recomputed by
  `recalc_order()` on every `order_items` insert/update/delete. Never set
  any of these six columns directly from a Server Action.
- **`db.transaction()` works. `txDb()` is a deprecated alias for `db`, not a
  separate client — don't reach for it in new code.** `src/db/index.ts` now
  wraps a single pooled `node-postgres` client (`pg.Pool` +
  `drizzle-orm/node-postgres`), and that driver supports real interactive
  transactions directly on `db`. This used to be a hard split: the previous
  Neon HTTP driver had no interactive transactions at all, and calling
  `.transaction()` on it failed **at runtime, not compile time** — it would
  typecheck fine and then blow up the first time it actually ran, which is
  why a second client, `txDb()`, existed. That hazard is gone. `txDb()`
  still exists purely so the existing call sites (product + variants +
  images; order + line items; a product-type rename's cascade; a bulk
  reorder) keep working unmodified — it just returns `db`. Write
  `db.transaction(async (tx) => {...})` directly for any new multi-table
  write, and feel free to migrate an existing `txDb().transaction(...)` call
  site to `db.transaction(...)` opportunistically; do not add a new call to
  `txDb()`. Both rollback (on a thrown error) and commit are verified
  end-to-end by `npm run smoke` (see `docs/health-check.md`).
- **One connection pool per process, sized for a single-owner shop.** The
  pool (`src/db/index.ts`) is created once at module load with `max: 10` —
  deliberately modest, since Railway Postgres plans cap total connections
  and this app has no concurrency need anywhere near that ceiling; leaving
  headroom means a migration or a `psql` session can still connect while the
  app is running. SSL is chosen by host, not hardcoded: `sslFor()` disables
  it for `localhost`/`127.0.0.1` and Railway's private `*.railway.internal`
  network (unterminated TLS there), and enables it
  (`rejectUnauthorized: false`) for any public host — the same code runs
  unmodified against a local Docker Postgres, Railway's private URL, and
  Railway's public proxy URL.
- **Upserting a row with an explicit pre-existing `id` collides with the
  PRIMARY KEY, not the named arbiter index.** When `updateProduct` upserts a
  brand-new variant row via `.onConflictDoUpdate({ target: [productId,
  color, size] })`, that target only matters if no `id` is sent — a UUID
  primary key column always exists and always wins the conflict-resolution
  check first if it's ever present in the values. Keep new-variant inserts
  free of an `id` field; only an existing row being updated-by-id should
  ever carry one.
- **Product codes are server-generated and immutable.** The form's code
  input is read-only and `createProduct` ignores whatever the client sends —
  it mints the code itself inside its own transaction via
  `src/lib/product-code.ts` (`<product_types.code_prefix>-<NNN>`). Neither
  `updateProduct` nor `updateProductInline` writes `productCode` at all, even
  when the product's type changes: the code is the storefront URL
  (`/shop/<code>`) and the key every order line snapshotted. The next number
  is `max + 1` across **both** `products.product_code` and
  `orderItems.product_code` — reading the order lines too is what stops a
  deleted product's code being reissued and its sales silently merging into
  the new product's row in `profitByProduct`.
- **Preorder codes are server-minted, random, and immutable — the opposite
  of product codes on purpose.** `orders.preorderCode` (`PO-<10 random
  chars>`, `src/lib/preorder-code.ts`) is generated with
  `crypto.getRandomValues` and needs **no database read at all** to produce,
  unlike `product-code.ts`'s sequential `max + 1`. Never make it sequential,
  never derive it from `orderNo`, and never let a caller supply one — both
  `submitCheckout` and `admin/orders/actions.ts#createOrder` always call
  `generatePreorderCode()` themselves. It is the sole public identifier for
  `/track/[code]` (a route with no session check at all — see the security
  model above), so a random, unguessable code is the only thing standing
  between "this customer's order" and "any order in the shop." Collisions
  are handled by generate-and-insert-and-retry, exactly like product codes:
  a pre-flight `SELECT` would be a TOCTOU race, so the
  `orders_preorder_code_unique` index is the real authority, and a `23505`
  against it retries the **entire** `db.transaction(...)` with a fresh code
  (bounded at 3 attempts) — a unique-violation aborts the transaction
  outright, so the retry can never reuse the same `tx`.
- **Cover photo = `sortOrder` 0.** No separate "is cover" flag — whichever
  `productImages` row has `sortOrder = 0` is the cover, full stop. Setting a
  cover means reordering, not flagging.
- **The pre-row UUID upload trick.** `ProductForm` generates the product's
  `id` client-side (`crypto.randomUUID()`) *before* the product row exists,
  so image uploads can start immediately under `products/<id>/...` in R2
  without waiting on a database round trip. `createProduct` then accepts
  that same id as its insert value instead of letting Postgres generate one.
  This is why `products.id`'s default (`gen_random_uuid()`) is a *fallback*,
  not the only path a row's id can come from.
- **Storefront revalidation must cover both locales on every product
  mutation.** `revalidateStorefront()` loops every configured locale
  (`th`, `en`) and busts `/`, `/shop`, `/admin`, `/admin/products`, and (when
  known) `/shop/<code>` in each — a mutation made while the owner is on one
  locale must not leave the *other* locale's cached page stale. Any new
  product-type or product-mutating action must route through this helper
  (or `revalidateOrders()`/`revalidateSettings()`, which wrap it), never
  call `revalidatePath()` ad hoc.

## Schema changes

Edit `src/db/schema.ts`, run `drizzle-kit generate` (`npm run db:generate`),
and hand-maintain `drizzle/0001_init_extras.sql` for anything Drizzle can't
model (generated columns, `pg_trgm` indexes, triggers, check constraints,
reference data — see that file's own header for the full list). **Never
hand-edit drizzle-generated SQL** (`drizzle/0000_init.sql` or any future
`NNNN_*.sql` Drizzle produces) — if it's wrong, fix the schema and
regenerate. `0001_init_extras.sql` is a `--custom` migration and **is**
registered in Drizzle's migration journal (`drizzle/meta/_journal.json`), so
`npm run db:migrate` applies it automatically right after `0000_init.sql` —
there is no manual `psql` step, on any environment including a fresh one. If
`drizzle/meta/` is ever deleted and `db:generate` is re-run, that regenerates
`0000_init.sql` but not `0001_init_extras.sql` — recreate it from
`schema.ts`'s own comments and re-register it with
`drizzle-kit generate --custom`.

## Verify

```bash
npx tsc --noEmit
npm run build
npm run lint
npx drizzle-kit check
```

A database-less build (e.g. CI with no live `DATABASE_URL`) needs dummy env
vars so the module-level `requireEnv()`/`requireDatabaseUrl()` calls in
`src/db/index.ts` and `src/lib/r2.ts` don't throw before Next even reaches
prerendering:

```bash
DATABASE_URL="postgres://user:pass@localhost:5432/db" \
AUTH_SECRET="dummy" \
AUTH_URL="http://localhost:3000" \
R2_ACCOUNT_ID="dummy" R2_ACCESS_KEY_ID="dummy" R2_SECRET_ACCESS_KEY="dummy" \
R2_BUCKET="dummy" NEXT_PUBLIC_R2_PUBLIC_URL="https://img.example.com" \
NEXT_PUBLIC_SITE_URL="http://localhost:3000" \
npm run build
```

Every public-page prerender path (`/`, `/shop`, `/shop/[code]`'s
`generateStaticParams`, `sitemap.ts`) catches its own database errors and
falls back to an empty result, so this build succeeds even against a dummy
`DATABASE_URL` that can't actually connect — check the build output marks
`/` and `/shop/[code]` as static/ISR (`●`), not dynamic (`ƒ`).

Check `docs/health-check.md`'s standing security block after any change to
`queries/storefront.ts` or `/api/products` — it is the regression test for
the private-field leak, and there is no database-level backstop behind it.
