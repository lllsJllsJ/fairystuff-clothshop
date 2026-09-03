# clothshop

[![Node Version](https://img.shields.io/badge/node-24-339933.svg)](https://nodejs.org/en/blog/release/v24.0.0)

A personal clothing-brand storefront with an owner-only admin. Public
catalogue browsing (Thai/English, ISR-cached) on the front; product, order,
and inventory management behind a single-owner login on the back. See
`DESIGN.md` for the visual system.

> **Node version note.** The repo actually runs on **Node 24** (confirmed via
> `node -v` in this environment). `package.json`'s `devDependencies` still pins
> `@types/node@^20` and there is no `engines` field — that is a real
> divergence between the declared and actual runtime, not a documentation
> choice. Bump `@types/node` (and add an `engines.node` field) if you want the
> `package.json` to say what's true; until then, treat "Node 24" above as the
> verified fact and the `^20` types package as stale.

<!-- ai:anchor:overview -->

## Overview

**Two audiences, one codebase.** The public storefront (`/`, `/shop`,
`/shop/[code]`, `/about`) needs no session and is ISR-cached; the admin
(`/admin/*`) needs an `owner` session and renders dynamically. Both sides
share one Postgres database (Railway Postgres) and one Next.js 16 app,
running as a single long-lived Node container on Railway — there is no
separate API service and no serverless cold start.

### Architecture

```
   PUBLIC (no session)               OWNER (session)
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ Browser / crawler              │   │ Browser (signed in)            │
└───────────────┬────────────────┘   └───────────────┬────────────────┘
                │                                    │
                ▼                                    ▼
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ src/proxy.ts                   │   │ src/proxy.ts                   │
│ next-intl locale routing       │   │ next-intl locale routing       │
│ (no auth check on this path)   │   │ -> auth() denylist check       │
└───────────────┬────────────────┘   └───────────────┬────────────────┘
                │                                    │
                ▼                                    ▼
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ Next.js - ISR, revalidate 300s │   │ Next.js - dynamic (f)          │
│ queries/storefront.ts          │   │ requireOwner() in layout       │
│ PUBLIC_PRODUCT_COLUMNS only    │   │ + per-action isOwner() check   │
│                                │   │ full columns incl. margin      │
└───────────────┬────────────────┘   └───────────────┬────────────────┘
                │                                    │
                └─────────────────┬──────────────────┘
                                  ▼
                 ┌───────────────────────────────────┐   ┌──────────────────────┐
                 │ Railway Postgres                  │   │ Railway Bucket       │
                 │ pg.Pool + Drizzle - max 10        │   │ private images       │
                 │ no public API - no RLS            │   │ via /api/images/*    │
                 └───────────────────────────────────┘   └──────────────────────┘
```

### Flow summary

1. **Public request** hits `src/proxy.ts`, which lets next-intl resolve/redirect
   the locale segment (`/` → `/th`), then checks the locale-stripped path
   against a *denylist* of protected prefixes (`/admin`, `/api/admin`,
   `/api/uploads`) — everything else passes straight through, unauthenticated.
2. **Public pages** (`/`, `/shop`, `/shop/[code]`, `/about`) read exclusively
   through `src/db/queries/storefront.ts`, whose `PUBLIC_PRODUCT_COLUMNS`
   constant is the only column set the public may ever see. Pages render at
   build time / on first request and revalidate every 300s (ISR).
3. **The catalogue** (`/shop`) hydrates client-side into `ShopBrowser`, which
   calls the public `GET /api/products` for filtered/paginated results —
   the same column-safe query layer, just over JSON instead of SSR HTML.
4. **Admin requests** hit the same proxy; a request under a protected prefix
   with no session gets a 401 (`/api/**`) or a redirect to `/login`
   (pages). A second gate, `requireOwner()` in `admin/layout.tsx`, re-checks
   the session server-side. A third gate — an independent `isOwner()` check —
   runs inside every Server Action, because there is no database-level RLS
   backstop if either of the first two is ever skipped or narrowed.
5. **Product/order writes** that touch more than one table (product +
   variants + images; order + line items) run inside `db.transaction()`.
   Existing call sites reach it through `txDb()`, a deprecated alias
   retained only so those call sites keep working unchanged — the pooled
   `node-postgres` driver supports real interactive transactions on `db`
   itself, unlike the earlier Neon HTTP driver this replaced.
6. **Every product-mutating action** calls `revalidateStorefront()`, which
   busts `/`, `/shop`, `/admin`, `/admin/products`, and (when known) the
   specific `/shop/[code]` page, in **both** locales, so a price/stock edit
   never leaves stale ISR content live in the language the admin isn't
   looking at.
7. **Product images** are resized to three WebP widths in the browser, then
   uploaded straight to a private Railway Bucket via owner-gated presigned PUT
   URLs. Public reads use the cacheable same-origin `/api/images/*` proxy.
8. **The FairyStuff catalogue** is prepared out-of-band from the reviewed
   workbook into a manifest. Supplier photos are copied into Railway Bucket/MinIO (never
   hotlinked), and replacement stays a dry run unless all destructive CLI
   guards are supplied.

<!-- ai:anchor:features -->

## Features

- Public storefront: home, full catalogue with search/filter/sort, product
  detail with colour/size selection and sold-out handling, about page —
  Thai (default) and English, both path-prefixed (`/th`, `/en`).
- SEO: per-locale `sitemap.xml` with hreflang alternates, `robots.txt`,
  per-product metadata + JSON-LD, ISR-cached static rendering.
- Owner-only admin: dashboard (KPIs, charts, stock/alert panels), product
  CRUD with a card/table toggle and inline table editing, a per-colour stock
  grid (one click adds a colourway with every size at 0), drag-free cover-photo selection, Excel import with
  a preview/confirm step, order management with a multi-line builder
  and a sortable order list (order no. and order date),
  Excel/print reports (monthly, annual, profit-by-product, inventory
  snapshot), and a product-type reference-list manager.
- Credentials-only auth (single `owner` role; `staff` reserved with zero v1
  capability) — no public signup route; the only owner account is created via
  `npm run create-owner`.
- Browser-side image pipeline: canvas resize → WebP → presigned bucket PUT, so no
  file ever passes through the app server and no host's image-optimization
  service sits in the critical path.
- DB-enforced money math: margin, order totals, and line totals are Postgres
  generated columns / trigger-maintained — never computed and trusted
  client-side.
- Product codes are generated from the product's type (`TS-001`, `TS-002`, …)
  and are never hand-typed or edited: the type is picked first, the server
  mints the code, and it stays fixed for the product's life. Each type owns
  its prefix, editable in Settings.
- Reviewed FairyStuff catalogue pipeline: exact workbook prices/formulas,
  canonical supplier links, gallery-image extraction with embedded-workbook
  fallback, Thai names/colours/types, a review manifest, and a guarded,
  transactional replacement command. All imported products start as active
  with `Free Size`, quantity `99`, and application-generated immutable codes.
- Settings retains **Clear all data** as an owner-only, typed-confirmation
  action. There is no mock catalogue, procedural photo generator, or fake
  order loader.

<!-- ai:anchor:installation -->

## Installation & Setup

### Prerequisites

- Node 24 (see the version note above)
- [Docker](https://www.docker.com/) — runs the local dev database and local
  object storage (`docker-compose.yml`), plus the throwaway database
  `npm run smoke` uses
- A [Railway](https://railway.app) project with a Postgres service attached,
  for anything beyond local development
- A Railway Storage Bucket for production product images. Local development
  uses MinIO: `docker compose up -d` starts it as an
  S3-compatible stand-in (step 2 below).
- `psql` on your machine (for the manual migration step below)

### Development setup

```bash
npm install
cp .env.example .env.local   # fill in real values, see Environment Variables below
```

1. **Start the local database and object storage:**
   ```bash
   docker compose up -d
   ```
   Starts the containers defined in `docker-compose.yml`: Postgres, MinIO,
   and a one-shot `minio-init` that creates the public-read `clothshop`
   bucket and then exits (seeing it stopped in `docker compose ps` is the
   success state). Use the connection string already shown in `.env.example`
   for `DATABASE_URL`:
   `postgres://clothshop:devpassword@localhost:5432/clothshop`.
2. **Point storage at MinIO.** Copy these values from `.env.example`:
   ```
   STORAGE_ENDPOINT=http://localhost:9000
   STORAGE_ACCESS_KEY_ID=minioadmin
   STORAGE_SECRET_ACCESS_KEY=minioadmin
   STORAGE_BUCKET=clothshop
   STORAGE_REGION=auto
   STORAGE_FORCE_PATH_STYLE=true
   ```
   The endpoint points the S3 client at MinIO; path-style addressing is enabled
   explicitly. Reads still go through `/api/images/*`, matching production.
3. **Run the Drizzle-generated migration:**
   ```bash
   npm run db:migrate
   ```
4. **Apply the hand-written extras migration manually.** This is the step
   people forget: `drizzle/0000_init_extras.sql` is **not** in Drizzle's
   migration journal (`drizzle/meta/_journal.json` lists only `0000_init`), so
   `db:migrate` will never run it for you. It adds the generated columns
   (`products.margin`, `orders.total_cost`, `orders.profit`,
   `order_items.line_total`, `order_items.line_cost`), the `pg_trgm` search
   indexes, the `updated_at` triggers, and the order-totals recalculation
   trigger. Without this step the app will build and run but every money
   column will silently be wrong (NULL/zero) and product search will be much
   slower.
   ```bash
   psql "$DATABASE_URL" -f drizzle/0000_init_extras.sql
   ```
   It's idempotent — safe to re-run.
5. **Seed the reference data** (13 Thai product types):
   ```bash
   npm run db:seed
   ```
6. **Create the owner account** (the only way one is ever created — there is
   no signup route):
   ```bash
   npm run create-owner
   ```
7. **Set up Railway Bucket — deployment only.** Add a Bucket in the same
   Railway project, then reference its `ENDPOINT`, `ACCESS_KEY_ID`,
   `SECRET_ACCESS_KEY`, `BUCKET`, and `REGION` values using the `STORAGE_*`
   names shown in `.env.example`. Set `STORAGE_FORCE_PATH_STYLE=false` and
   configure bucket CORS for `PUT` from the storefront origin.
8. **Prepare and review the FairyStuff catalogue** (no database/storage writes):
   ```bash
   npm run catalog:prepare
   npm run catalog:verify
   npm run catalog:import
   ```
   `catalog:prepare` reads `data/stock_fairystuff.xlsx`, attempts allow-listed
   supplier pages without running their scripts, caches source images under
   the gitignored `data/.catalog-cache/`, and writes the review manifest.
   `catalog:verify` checks all 53 entries and image hashes. `catalog:import`
   is a dry run unless it receives `--apply --replace` and the exact phrase
   it prints; a public database additionally requires `--allow-remote`.
   Workbook row 77 is explicitly approved as a temporary no-image product and
   uses the storefront/admin placeholder; no fake image is stored. Supply its
   real photo later with `catalog:prepare -- --image=77:<local-path>`.
9. **Run the app:**
   ```bash
   npm run dev
   ```

### Docker setup

There is no Dockerfile for the app itself, and none is needed: Railway
builds it from source with Nixpacks (`railway.json`). Docker **is** used for
two other things:

- **The local dev database and object storage** — `docker-compose.yml` at
  the repo root starts a throwaway Postgres 16 container for `DATABASE_URL`
  plus a MinIO container (with a one-shot `minio-init` bucket bootstrapper)
  standing in for Railway Storage, so image uploads work locally (see
  steps 1–2 above). Neither container is used in production — Railway
  provides Postgres and private object storage.
- **Testing** — `npm run smoke` spins up its own separate throwaway
  Postgres container (different name and port from the dev database), runs
  the real `src/db/index.ts` query layer plus the schema assertions against
  it, and destroys the container on exit. See
  [docs/health-check.md](docs/health-check.md).

<!-- ai:anchor:environment -->

## Environment Variables

All variables live in `.env.example` (values there are always placeholders —
never real secrets).

### Required

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string — Railway injects this automatically when a Postgres service is attached; locally, `docker compose up -d` then use the value already shown in `.env.example` |
| `AUTH_SECRET` | Signs Auth.js session JWTs — generate with `npx auth secret` |
| `AUTH_URL` | Canonical deployment URL Auth.js uses to build callback/redirect URLs (`http://localhost:3000` in dev) |
| `STORAGE_ENDPOINT` | S3 endpoint: reference the Railway Bucket's `ENDPOINT`; use `http://localhost:9000` for MinIO |
| `STORAGE_ACCESS_KEY_ID` | Reference the Railway Bucket's `ACCESS_KEY_ID` |
| `STORAGE_SECRET_ACCESS_KEY` | Reference the Railway Bucket's `SECRET_ACCESS_KEY` |
| `STORAGE_BUCKET` | Reference the Railway Bucket's globally unique `BUCKET` value (not its display name) |
| `STORAGE_REGION` | Reference the Railway Bucket's `REGION` (`auto` locally) |
| `STORAGE_FORCE_PATH_STYLE` | `false` for current Railway Buckets; `true` for local MinIO or a legacy Railway bucket whose Credentials tab says path-style |
| `NEXT_PUBLIC_SITE_URL` | Canonical public site URL, used for sitemap/robots/metadata/JSON-LD — exposed to the browser |

The app stores same-origin `/api/images/*` URLs in Postgres. Railway's private
credentials are never exposed to the browser and no public bucket URL is needed.

### Optional

| Variable | Purpose |
|---|---|
| Legacy `R2_*` variables | Accepted as fallbacks for an existing Cloudflare R2 deployment; new Railway deployments should use `STORAGE_*` |

Every other variable is required for the app to function correctly (a
missing storage or `DATABASE_URL` value fails fast via
`requireEnv()`/`requireDatabaseUrl()` at the point of use, except during a
database-less build — see [Build & Deployment](#build--deployment)).

<!-- ai:anchor:structure -->

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── products/route.ts              # public product list JSON
│   │   ├── admin/products/route.ts        # owner-gated product list JSON
│   │   ├── admin/orders/route.ts          # owner-gated order list JSON
│   │   ├── uploads/presign/route.ts       # owner-gated bucket PUT presign
│   │   ├── images/[...key]/route.ts       # cached public proxy to private bucket
│   │   └── auth/[...nextauth]/route.ts    # Auth.js handlers
│   ├── [locale]/
│   │   ├── (shop)/                        # public storefront (ISR)
│   │   │   ├── page.tsx                   # home
│   │   │   ├── shop/page.tsx              # catalogue
│   │   │   ├── shop/[code]/page.tsx       # product detail
│   │   │   └── about/page.tsx
│   │   ├── (auth)/login/                  # login page + server action
│   │   ├── admin/                         # owner-only, dynamic
│   │   │   ├── layout.tsx                 # requireOwner() gate
│   │   │   ├── page.tsx                   # dashboard
│   │   │   ├── products/                  # browse/new/edit/import
│   │   │   ├── orders/                    # list/new/detail-edit
│   │   │   ├── reports/                   # monthly/annual/profit/inventory
│   │   │   └── settings/                  # product-type manager + shop data tools
│   │   └── layout.tsx                     # owns <html lang>, PUBLIC_NAMESPACES
│   ├── layout.tsx                         # passthrough root layout
│   ├── sitemap.ts / robots.ts / not-found.tsx
│   └── globals.css
├── auth.ts                                # Auth.js v5 config (Credentials, JWT)
├── proxy.ts                                # next-intl + auth guard (Next 16 "proxy")
├── db/
│   ├── schema.ts                          # single source of truth for tables/enums
│   ├── index.ts                           # pooled node-postgres client; txDb() is a deprecated alias for db
│   └── queries/
│       ├── storefront.ts                  # PUBLIC_PRODUCT_COLUMNS + public reads
│       ├── products.ts / orders.ts        # admin (full-column) reads
│       ├── dashboard.ts / reports.ts      # aggregation queries
│       └── product-types.ts
├── lib/
│   ├── auth-helpers.ts / roles.ts         # requireOwner(), isOwner()/isStaff()
│   ├── r2.ts                              # S3 read/presign/put/delete adapter
│   ├── product-code.ts                    # type -> prefix -> next code (server-owned)
│   ├── catalog/                           # FairyStuff parser, manifest, images, replacement
│   ├── shop-data.ts                       # owner-only transactional clear
│   ├── image-resize.ts / image-loader.ts  # browser resize + next/image loader
│   ├── import/parse-products.ts           # Excel/XLSX parsing
│   ├── validations/                       # Zod schemas (product, order, auth)
│   └── brand.ts                           # brand name/copy placeholders
├── i18n/                                  # next-intl routing/navigation/request config
└── messages/{th,en}.json                  # translation bundles
drizzle/
├── 0000_init.sql                          # drizzle-kit generated
└── 0000_init_extras.sql                   # hand-written — apply manually, see above
scripts/
├── catalog-{prepare,verify,import}.ts      # reviewed catalogue CLI
├── seed.ts                                # product-type reference data
└── create-owner.ts                        # interactive, only way to create an owner
```

<!-- ai:anchor:infrastructure -->

## Infrastructure / Integrations

- **Railway Postgres.** One pooled `node-postgres` client (`src/db/index.ts`,
  a `pg` `Pool` wrapped by `drizzle-orm/node-postgres`, `max: 10`) — a single
  pool per process, shared by reads and single-statement writes and by
  multi-table writes via `db.transaction()`. SSL is chosen by host: disabled
  for `localhost`/`127.0.0.1` and Railway's private `*.railway.internal`
  network, enabled (`rejectUnauthorized: false`) for any public host — see
  `sslFor()` in `src/db/index.ts`. `txDb()` still exists as a deprecated
  alias for `db`, kept only so existing call sites keep working unchanged.
  **Railway Postgres is always-on** — there is no autosuspend/pause state to
  defend against — see `docs/health-check.md` and `docs/cron-flow.md` for
  why that means no keepalive job is needed.
- **Railway Storage Bucket** (S3-compatible and private). Product images only.
  The cacheable `/api/images/*` route streams public catalogue images without
  revealing credentials. A **CORS policy** must allow browser-side
  `PUT` from your app's origin(s), since uploads go straight from the
  browser to the Bucket via presigned URLs:
  ```json
  [
    {
      "AllowedOrigins": ["https://your-deployment-domain", "http://localhost:3000"],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["Content-Type"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```
  **Locally, MinIO stands in for Railway Storage** — `docker-compose.yml` runs it on
  `http://localhost:9000` with a public-read `clothshop` bucket and
  `MINIO_API_CORS_ALLOW_ORIGIN=http://localhost:3000` (the same browser-PUT
  allowance the policy above grants). Its `STORAGE_FORCE_PATH_STYLE=true` is
  the only addressing difference; see `src/lib/r2.ts`.
- **Supplier catalogue sources.** The preparation CLI accepts only canonical
  HTTPS SHEIN, Amazon, 1688, and Taobao pages and their approved image CDNs.
  Downloads are bounded and MIME-checked. Accepted photos are re-encoded at
  480/800/1600 widths and copied into Railway Bucket/MinIO during apply; storefront URLs
  always point at owned storage, never at supplier hosts.
- **Auth.js v5** (Credentials provider, JWT session strategy, no database
  adapter — a single owner account doesn't need a `sessions` table). No
  external identity provider is wired up.
- **No runtime external services beyond Railway Postgres and Railway Bucket.** The
  out-of-band catalogue preparation described above may read supplier pages.
  There is no email provider, no
  payment processor (the storefront's order CTA is LINE/Instagram DM, not
  checkout — see `src/lib/brand.ts`), no analytics SDK.

<!-- ai:anchor:deployment -->

## Build & Deployment

**The hosting target is Railway.** The app runs there as a long-lived Node
container — not serverless functions — built by Nixpacks per `railway.json`
(`npm run build` at build time, `npm run start` to serve). See
[DEPLOYMENT.md](DEPLOYMENT.md) for the full setup walkthrough.

### Local build

```bash
npm run build
npm run start
```

A database-less build (no live `DATABASE_URL`, e.g. in CI) still succeeds:
every prerender path that hits the database (`/`, `/shop`, `/shop/[code]`'s
`generateStaticParams`, `sitemap.ts`) wraps its query in a try/catch and falls
back to an empty result, letting ISR fill in real content once a live
database is behind the deployment.

### ISR cache lives on the container's disk

`revalidate = 300` and `revalidatePath()` write to `.next/cache` on the
Railway container's own filesystem. That works, with two things worth
knowing:

- The cache is **wiped on every redeploy** — a cold cache after a deploy,
  not data loss; the first request to each page after a deploy just
  re-renders instead of serving a cached hit.
- With **more than one replica**, each replica has its own disk and its own
  cache, so `revalidatePath()` on one replica does not invalidate the
  others' copies. Fine at a single replica (the default for this app);
  attach a shared volume or stay single-replica if that ever changes.

### What is deliberately NOT host-specific

Choosing Railway did not make the codebase depend on it. There is still no
platform-specific package and no platform cron, and two decisions stay as
they are:

- **Images bypass any host's image-optimization service.** `next/image` uses
  a custom loader against three widths pre-generated in the browser or by the
  catalogue CLI. `/api/images/*` streams them from private storage with
  immutable cache headers. Railway Bucket egress is free, though proxying
  bytes through the app can count as service egress, and no image-optimization
  quota applies. A shop with colour variants would
  image-optimization quota applies. A shop with colour variants would
  otherwise burn through that quota quickly — 100 products × 4 photos ×
  3 colours is 1,200 source images.
- **No keepalive cron.** Railway Postgres is always-on — there is no
  autosuspend/pause state to defend against, so there is nothing for a
  keepalive job to do. See [docs/cron-flow.md](docs/cron-flow.md).

Keeping these means a future move off Railway is a redeploy, not a rewrite.

### Before going live

Run both standing checks against the deployed URL:

- the [security check](docs/health-check.md) — proves no private field reaches
  a public response
- `npm run smoke` — proves the money math, the query layer, and transaction
  rollback/commit still behave

and confirm the
[storefront revalidation flow](docs/application-flow.md#storefront-revalidation-after-a-product-mutation):
edit a price in admin, then hard-reload `/th/shop` in a private window and
check the new price appears without waiting out the 300s ISR window.

### CI/CD

No CI/CD pipeline is configured in this repo yet — add one if the deploy
process needs anything beyond Railway's own build-on-push.

<!-- ai:anchor:development -->

## Development

### Scripts

```bash
npm run dev            # next dev (Turbopack)
npm run build           # next build
npm run start            # next start
npm run lint              # eslint
npm run db:generate      # regenerate drizzle/*.sql from src/db/schema.ts
npm run db:migrate       # apply the drizzle-generated migration
npm run db:push          # push schema directly (dev convenience)
npm run db:studio        # Drizzle Studio
npm run db:seed          # seed the 13 Thai product types
npm run catalog:prepare  # build/refresh the review manifest (no DB writes)
npm run catalog:verify   # validate all entries and cached image hashes
npm run catalog:import   # dry run; apply requires explicit replacement guards
npm run catalog:repair-images # restore catalogue objects without changing DB rows
npm run create-owner     # create the (only) owner account
npm test                 # catalogue parser/enrichment/image policy tests
```

Every `db:*` script and `create-owner` runs under Node's
`--env-file-if-exists=.env.local`, so they pick up `DATABASE_URL` from the
same file `next dev` reads. Only Next.js loads `.env.local` on its own —
`drizzle-kit` and `tsx` do not — so without that flag these commands fail
with an empty `url`. In an environment that injects real env vars (Railway,
CI) there is no `.env.local` and the flag is a no-op.

### Verify

```bash
npx tsc --noEmit
npm run build
npm run lint
npx drizzle-kit check
```

A database-less build needs dummy env vars for `DATABASE_URL` and storage
variables so the module-level `requireEnv()`/`requireDatabaseUrl()` calls
don't throw before Next even gets to prerendering — see `CLAUDE.md`'s verify
section for the exact command.

### Key dependencies

Next.js 16.2.10 (App Router, Turbopack) · React 19.2.4 · TypeScript ·
Tailwind v4 (tokens in `src/app/globals.css`, no config file) · shadcn/ui
`base-nova` style on `@base-ui/react` (not Radix) · Drizzle ORM 0.45 +
`pg` (`node-postgres`) · Auth.js v5 (beta) · `@aws-sdk/client-s3` +
`s3-request-presigner` (Railway Bucket/MinIO) · `next-intl` v4 · TanStack Query v5 · React Hook
Form + Zod v4 · `xlsx` (import/export) · Sharp (catalogue renditions) ·
Recharts (dashboard charts).

<!-- ai:anchor:docs -->

## Documentation

- [`docs/api-overview.md`](docs/api-overview.md) — every API route, the
  public data contract, and the internal server-action mutation surface.
- [`docs/health-check.md`](docs/health-check.md) — liveness (there is no
  health endpoint) and the standing private-field-leak security check.
- [`docs/application-flow.md`](docs/application-flow.md) — every request
  entry point in the app (public, admin, cross-cutting), each with an ASCII
  diagram and its failure path.
- [`docs/cron-flow.md`](docs/cron-flow.md) — there are no scheduled jobs;
  this file explains why and records that deliberately.
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — Railway Postgres/Bucket setup, environment
  variables per environment, first-owner creation, and the post-deploy
  checklist.
- [`CLAUDE.md`](CLAUDE.md) — project-specific notes for AI coding assistants
  (security model, framework quirks, invariants not to "fix").
- [`DESIGN.md`](DESIGN.md) — the visual design system.
