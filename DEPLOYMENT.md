# Deployment

The hosting target is **Railway**. The app runs there as a long-lived Node
container, built and started per `railway.json` (Nixpacks, `npm run build`
then `npm run start`) — not serverless functions, so there's no per-request
cold start and no function-invocation connection-count pressure on Postgres.

The codebase itself stays portable: no platform-specific package, no
platform cron, and the S3-compatible storage adapter remains portable.

## 1. Railway Postgres setup

1. In your Railway project, **attach a Postgres service** (New → Database →
   PostgreSQL). Railway provisions it and injects `DATABASE_URL` into your
   app service's environment automatically — you don't set it by hand in
   production.
2. Prefer the **private** connection string (the `*.railway.internal` host)
   over the public proxy one for the app service: it keeps database traffic
   off the public internet and costs no egress. `src/db/index.ts` detects
   the host and disables SSL for `*.railway.internal` and `localhost`,
   enabling it (with `rejectUnauthorized: false`) for any public host — see
   `sslFor()` there. Use the **public** connection string only when you need
   to reach the database from outside Railway (e.g. `psql` from your own
   machine for the manual migration step below).
3. The app opens one connection pool per process (`max: 10`,
   `src/db/index.ts`) — modest on purpose, since Railway Postgres plans cap
   total connections and a single-owner shop has no need for high
   concurrency. Consider creating a **separate Postgres service per
   environment** (production vs. staging) rather than sharing one database.

## 2. Migrations — including the manual step

```bash
npm run db:migrate
```

Then, **manually, every environment, every time**:

```bash
psql "$DATABASE_URL" -f drizzle/0000_init_extras.sql
```

This second step is not optional and is not run by `db:migrate` —
`drizzle/0000_init_extras.sql` is a hand-written companion migration that is
**not listed in `drizzle/meta/_journal.json`**, so Drizzle's own migration
runner has no way to know it exists. It adds:

- the generated columns (`products.margin`, advertising-aware
  `orders.total_cost`/`orders.profit`, `order_items.line_total`,
  `order_items.line_cost`),
- the `pg_trgm` extension and its two GIN search indexes on `products`,
- `updated_at` triggers on `products`, `product_variants`, `orders`,
- the `recalc_order()` function and its trigger on `order_items`,
- check constraints on the two quantity columns.

It is idempotent (`drop ... if exists` / `create ... if not exists`
throughout), so re-running it against an already-migrated database is safe
and a reasonable thing to do as part of every deploy, not just the first
one.

**Symptom if this step is skipped:** the app builds and runs without error,
but every money figure — margin, order totals, profit, line totals — is
silently `NULL` or `0`, and product search falls back to a slow sequential
scan instead of using the trigram index. Nothing in application code
detects or warns about this; it must be caught by the health-check block
below or by noticing the numbers are wrong.

## 3. Seed data

```bash
npm run db:seed
```

Seeds the 13 Thai product types (idempotent — matched by unique `name`, safe
to re-run).

## 4. Create the first owner account

```bash
npm run create-owner
```

Interactive prompt — email + password (min 8 characters), confirmed twice.
This is the **only** way an `owner` row is ever created; public registration
always creates a `customer`. Run this against the target environment's `DATABASE_URL`
(i.e. with the right `.env` loaded, or the variable exported directly) —
running it against your local dev database does not create an account on
production.

## 5. Railway Storage Bucket setup

1. In the project canvas choose **Create → Bucket**, select the Singapore
   region (`sin`), and name it `clothshop-images`.
2. In the app service's Variables tab add references to the Bucket service:
   `STORAGE_ENDPOINT` → `ENDPOINT`, `STORAGE_ACCESS_KEY_ID` → `ACCESS_KEY_ID`,
   `STORAGE_SECRET_ACCESS_KEY` → `SECRET_ACCESS_KEY`, `STORAGE_BUCKET` →
   `BUCKET`, and `STORAGE_REGION` → `REGION`. Set
   `STORAGE_FORCE_PATH_STYLE=false`. Use the globally unique `BUCKET`, not
   the bucket display-name variable.
3. Do not create a public domain. Railway Buckets are private; the app serves
   immutable product images through `/api/images/*` and caches those responses.
4. **Configure CORS on the bucket** — product images upload directly from
   the owner's browser via presigned `PUT` URLs
   (`src/app/api/uploads/presign`), so the bucket must allow cross-origin
   `PUT` from your app's origin(s):
   ```json
   [
     {
       "AllowedOrigins": ["https://your-production-domain", "https://your-staging-domain"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Without this, image uploads in the admin will fail with a browser CORS
   error on the `PUT` request even though the presign call itself succeeds.

## 6. Environment variables per environment

| Variable | Production | Staging | Notes |
|---|---|---|---|
| `DATABASE_URL` | prod Postgres service (private URL) | staging Postgres service (private URL) | Railway injects this automatically per environment when a Postgres service is attached — never share one Postgres between environments |
| `AUTH_SECRET` | unique, generated | unique, generated | `npx auth secret` per environment — never reuse |
| `AUTH_URL` | `https://your-production-domain` | `https://your-staging-domain` | Must match the deployment's real canonical URL |
| `STORAGE_ENDPOINT` / `STORAGE_REGION` | references to prod Bucket | references to staging Bucket | Use Railway reference variables so each environment follows its own bucket instance |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | references to prod Bucket | references to staging Bucket | Secrets remain server-side |
| `STORAGE_BUCKET` | reference to prod `BUCKET` | reference to staging `BUCKET` | Use the S3 bucket name, not `RAILWAY_BUCKET_NAME` |
| `STORAGE_FORCE_PATH_STYLE` | `false` | `false` | Set `true` only when the Bucket Credentials tab explicitly reports path style |
| `NEXT_PUBLIC_SITE_URL` | `https://your-production-domain` | `https://your-staging-domain` | Feeds sitemap/robots/JSON-LD/canonical URLs |
| `EMAIL_ENABLED` | `false` until email is ready | `false` or `true` for email testing | With `false`, new customers are auto-verified and verification/reset controls make no Resend calls |
| `RESEND_API_KEY` | Resend secret when enabled | separate/test Resend secret | Leave empty while `EMAIL_ENABLED=false` |
| `RESEND_FROM_EMAIL` | verified sender when enabled | verified test sender | Resend requires a valid sender; leave empty while disabled |

Never commit real values for any of these — `.env.example` holds only
placeholders, and every environment's real values live in the host's own
secret/environment-variable store.

## 7. Build and deploy (Railway)

1. Create a Railway project and connect this repository (or a fork of it).
   Railway detects `railway.json` and uses it: `builder: "NIXPACKS"`,
   `buildCommand: "npm run build"`, `startCommand: "npm run start"`. **Do
   not override the build/start commands** — the ones in `railway.json` are
   correct.
2. Attach a Postgres service to the project (step 1 above) — Railway wires
   `DATABASE_URL` into the app service automatically once they're linked.
3. Set every remaining variable from step 6 in the app service's
   **Variables** tab, for Production and any Staging environment
separately. `AUTH_URL` and `NEXT_PUBLIC_SITE_URL` differ per environment
   — an environment pointed at the Production `AUTH_URL` will fail its auth
callback.

If no public domain is available yet, keep `EMAIL_ENABLED=false`. The account,
cart, checkout, generated order number, LINE/Instagram handoff, and tracking
flows still work; only verification and password-reset delivery are disabled.
When a domain/sender is ready, set `AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, the two
Resend values, then switch `EMAIL_ENABLED=true` in one deployment.
4. Give the Staging environment its **own** Postgres service, not a copy of
   the production one connected to both. An environment that can write to
   production is one bad click from real data loss.
5. The app runs as a **long-lived container**, not serverless functions —
   keep it at a **single replica** unless you've also attached a shared
   volume for `.next/cache` (see the README's "ISR cache lives on the
   container's disk"); multiple replicas without a shared volume means
   `revalidatePath()` on one doesn't invalidate the others' cached pages.
6. Deploy. The first build runs without a populated database if the schema
   is not applied yet — prerender paths fall back to empty and ISR fills in
   real content once data exists. **This is why a green build does not mean
   the deployment works** — run the checklist in step 8.

### A build succeeding is not the same as it working

Two failure modes survive a green build and neither is visible in the
Railway build log:

- **`drizzle/0000_init_extras.sql` not applied** (step 2). Orders silently
  report zero profit, because every monetary figure is computed by generated
  columns and the `recalc_order` trigger, all of which live only in that file.
- **Bucket CORS not configured** (step 5). The admin loads fine and image uploads
  fail only when someone actually tries one, since the browser PUTs directly
  to the Bucket.

## 8. Post-deploy checklist

- [ ] `npm run db:migrate` ran, **and** `psql "$DATABASE_URL" -f drizzle/0000_init_extras.sql` ran manually against this environment's database.
- [ ] `npm run db:seed` ran (product types visible in `/admin/settings`).
- [ ] An owner account exists for this environment (`npm run create-owner` was run against the right `DATABASE_URL`) and sign-in works at `/<locale>/login`.
- [ ] `/api/images/<valid-storage-key>` serves an uploaded test image without exposing a signed bucket URL.
- [ ] Bucket CORS is configured — uploading a product photo in `/admin/products/new` succeeds end to end (resize → presign → PUT).
- [ ] The latest generated migration is applied so customer accounts,
  characters, preorder lead times, checkout orders, workflow labels, line-item
  statuses, and refund metadata exist (along with advertising-aware profit).
- [ ] Admin Settings has at least one LINE or Instagram contact; checkout is
  intentionally blocked without a handoff channel.
- [ ] `EMAIL_ENABLED=false` is set while there is no verified sending domain,
  or (when true) a registration verification and password-reset email both
  succeed through Resend.
- [ ] `sitemap.xml` and `robots.txt` resolve and reference the correct `NEXT_PUBLIC_SITE_URL`.
- [ ] Run the full [`docs/health-check.md`](docs/health-check.md) security block against this environment's real URL — every check must pass (empty greps on 1/2/3/5, `401` on both checks in 4) before treating the environment as live.
- [ ] Edit a product's price in admin, then hard-reload `/shop` in an incognito window — the new price must appear without waiting out the 300s ISR window (the storefront-revalidation check called out in step 7 above).
- [ ] Confirm `/admin` and `/api/admin/*` reject an anonymous browser session (already covered by the health-check block, but worth confirming visually too).
