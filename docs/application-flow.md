# Application Flow

## Flow Index

**Bootstrap & Auth**
1. [Request / Proxy Bootstrap — Locale Negotiation + Auth Guard](#request--proxy-bootstrap--locale-negotiation--auth-guard)
2. [Login](#login)
3. [Session — JWT Callbacks](#session--jwt-callbacks)
4. [Sign Out](#sign-out)
5. [Locale Switch](#locale-switch)

**Public**
6. [Home — ISR Render](#home--isr-render)
7. [About — ISR Render](#about--isr-render)
8. [Catalogue — SSR + Client Hydration (`/shop`)](#catalogue--ssr--client-hydration-shop)
9. [`GET /api/products` — Client-Side Filter/Sort/Paginate](#get-apiproducts--client-side-filtersortpaginate)
10. [Product Detail — Static Generation + Metadata + JSON-LD](#product-detail--static-generation--metadata--json-ld)
11. [Colour Selection](#colour-selection)
12. [Size Selection / Sold-Out](#size-selection--sold-out)
13. [Filter + Sort — URL Sync](#filter--sort--url-sync)
14. [Sitemap](#sitemap)
15. [Robots](#robots)
16. [404 — Draft/Archived/Unknown Product Code](#404--draftarchivedunknown-product-code)
17. [`GET /api/images/[...key]` — Private Bucket Read](#get-apiimageskey--private-bucket-read)

**Admin**
18. [Admin Dashboard](#admin-dashboard)
19. [Product Browse](#product-browse)
20. [Image Upload — Resize → Presign → Bucket PUT](#image-upload--resize--presign--bucket-put)
21. [Create Product](#create-product)
22. [Product Code Generation](#product-code-generation)
23. [Edit Product + Cover Reorder](#edit-product--cover-reorder)
24. [Inline Table Edit](#inline-table-edit)
25. [Delete Product](#delete-product)
26. [Variant Rows Save](#variant-rows-save)
27. [Excel Import — Parse → Preview → Commit](#excel-import--parse--preview--commit)
28. [Orders List](#orders-list)
29. [Create Order](#create-order)
30. [Edit Order](#edit-order)
31. [Quick Order Status Change](#quick-order-status-change)
32. [Print Order Receipt](#print-order-receipt)
33. [Delete Order](#delete-order)
34. [Reports — View + Excel Export + Print](#reports--view--excel-export--print)
35. [Settings — Create Product Type](#settings--create-product-type)
36. [Settings — Rename Product Type (Cascade)](#settings--rename-product-type-cascade)
37. [Settings — Delete Product Type (Blocked When In Use)](#settings--delete-product-type-blocked-when-in-use)
38. [Settings — Reorder Product Types](#settings--reorder-product-types)
39. [Settings — Clear Shop Data](#settings--clear-shop-data)

**Catalogue CLI**
40. [Catalogue Prepare — Workbook Extraction](#catalogue-prepare--workbook-extraction)
41. [Catalogue Prepare — Supplier Enrichment + Workbook Fallback](#catalogue-prepare--supplier-enrichment--workbook-fallback)
42. [Catalogue Verify + Import Dry Run](#catalogue-verify--import-dry-run)
43. [Catalogue Apply — Storage Staging](#catalogue-apply--storage-staging)
44. [Catalogue Apply — Transactional Replacement](#catalogue-apply--transactional-replacement)
45. [Catalogue Apply — Rollback + Object Cleanup](#catalogue-apply--rollback--object-cleanup)

**Cross-cutting**
46. [Storefront Revalidation After a Product Mutation](#storefront-revalidation-after-a-product-mutation)
47. [Unauthorized / Forbidden Denial Paths](#unauthorized--forbidden-denial-paths)
48. [Transaction Rollback on Mid-Write Failure](#transaction-rollback-on-mid-write-failure)

---

## Request / Proxy Bootstrap — Locale Negotiation + Auth Guard

Runs on **every** request matched by `src/proxy.ts`'s `config.matcher`
(effectively all page paths plus `/api/admin/*` and `/api/uploads/*`).
Composes next-intl's locale routing with Auth.js's session check, in a fixed
order: locale first, then auth — because a protected-prefix check against an
unprefixed path (`/admin` vs. `/th/admin`) would never match correctly.

```
Request
  │
  ▼
starts with /api/ ? ──yes──▶ protected prefix + no session? ──yes──▶ 401 JSON
  │no                              │no
  ▼                                ▼
next-intl: resolve/redirect locale │ pass through
  │                                │
  redirect issued? ──yes──▶ 307 to /<locale>/... (browser re-requests)
  │no
  ▼
strip locale segment -> bare path
  │
  ▼
protected prefix + no session? ──yes──▶ 307 redirect to /<locale>/login?redirect=<path>
  │no
  ▼
already signed in + path === /login? ──yes──▶ 307 redirect to /<locale>/admin
  │no
  ▼
pass through to the matched page
```

Failure/edge behavior: an `/api/**` path never gets a redirect — it fails
with a JSON `401`, because a `fetch`/`curl` caller following a redirect would
otherwise see a `200` HTML login page instead of a clear failure. Protected
prefixes are a **denylist** (`/admin`, `/api/admin`, `/api/uploads`) — the
inverse of an allowlist — because this shop's storefront is public-by-default.

## Login

`POST` via the `login` Server Action (`src/app/[locale]/(auth)/login/actions.ts`),
called from `LoginForm`. Triggered by submitting the sign-in form on `/login`.

```
┌────────┐  email+password   ┌──────────────┐  safeParse   ┌────────────┐
│ Browser│ ────────────────▶ │ login() action│ ───────────▶ │ loginSchema│
└────────┘                   └──────┬────────┘              └────────────┘
                                     │ signIn("credentials", {redirect:false})
                                     ▼
                          ┌────────────────────────┐
                          │ Auth.js authorize()      │
                          │ SELECT users WHERE email  │
                          │ bcrypt.compare(pw, hash   │
                          │   OR dummy hash)          │
                          └──────┬────────────────────┘
                                 │ user + valid?
                     ┌───yes─────┴─────no───┐
                     ▼                      ▼
              JWT session issued      AuthError thrown
                     │                      │
                     ▼                      ▼
        { ok: true } returned      { ok:false, error:"invalid" }
                     │                      │
                     ▼                      ▼
      client router.push(redirectTo)  toast: invalidCredentials
```

Failure: **every** failure mode — malformed input, unknown email, wrong
password — collapses to the same `{ ok: false, error: "invalid" }` and the
same generic UI message. This is deliberate, not an oversight: revealing
*which* part failed would let a caller enumerate registered emails. The
constant-time defense is in `authorize()` itself — when no user row matches,
`bcrypt.compare()` still runs against a fixed dummy hash of the same cost
factor, so a "no such account" rejection and a "wrong password" rejection
cost the same wall-clock time.

## Session — JWT Callbacks

Runs on every authenticated request as part of Auth.js resolving `auth()`
(used directly by `getCurrentUser()`, and internally by the proxy's
`req.auth`). No database round trip after initial sign-in.

```
Request with session cookie
        │
        ▼
Auth.js decodes JWT
        │
        ▼
jwt() callback: user present (sign-in only)? ──yes──▶ token.id/token.role = user.id/user.role
        │no (normal request)
        ▼
session() callback: session.user.id/role = token.id/token.role
        │
        ▼
req.auth / getCurrentUser() resolves { id, email, name, role }
```

Failure: an invalid/expired/tampered JWT decodes to no session — every
downstream check (`req.auth`, `getCurrentUser()`) sees `null`/`undefined`
and the request is treated as anonymous, falling into the proxy's
unauthenticated branch.

## Sign Out

`signOutAction` (`src/components/auth/actions.ts`), bound to a
`<form action={signOutAction}>` in `UserMenu`. Triggered by the owner
clicking "sign out" in the admin header.

```
┌────────┐  form submit   ┌─────────────────┐  signOut()  ┌──────────────┐
│ Browser│ ─────────────▶ │ signOutAction()  │ ──────────▶ │ Auth.js clears│
└────────┘                └──────┬───────────┘             │ session cookie│
                                  │ getLocale()              └──────┬───────┘
                                  ▼                                  ▼
                        redirectTo: `/${locale}`          307 to /<locale>
```

Failure: none meaningful — sign-out has no failure branch; it always clears
the session and redirects to the locale-correct home.

## Locale Switch

`LocaleToggle` (`src/components/layout/locale-toggle.tsx`), a client
component present on both the storefront header and the login page.
Triggered by clicking the TH/EN toggle button.

```
┌────────┐  click   ┌────────────────────┐  router.replace(pathname, {locale: next})
│ Browser│ ───────▶ │ LocaleToggle (client)│ ─────────────────────────────────────▶ same page, new locale prefix
└────────┘          └─────────────────────┘
```

Failure: none — this is a pure client-side navigation using next-intl's
locale-aware router; it re-requests the same pathname under the other
locale's prefix, which the proxy resolves like any other page request.

## Home — ISR Render

`GET /`, `src/app/[locale]/(shop)/page.tsx`. Statically generated for both
locales at build time (`generateStaticParams`), revalidates every 300s.

```
┌────────┐  GET /<locale>   ┌──────────────────┐
│ Browser│ ───────────────▶ │ Next.js ISR cache  │
└────────┘                  └────────┬───────────┘
                                      │ cache stale (>300s) or miss?
                          ┌───yes─────┴─────no────┐
                          ▼                        ▼
              re-render: getPublicProducts     serve cached HTML
              (newest 6) + getPublicTypes
              via db/queries/storefront.ts
              (PUBLIC_PRODUCT_COLUMNS only)
                          │
                          ▼
                cache updated, served
```

Failure: `getPublicProducts`/`getPublicTypes` are wrapped in try/catch
(`safeGetPublicProducts`/`safeGetPublicTypes`) — a database error during
prerender (e.g. a database-less CI build) falls back to an empty result
instead of failing the build; a live database error at revalidation time
means the previously-cached page keeps serving until the next successful
revalidation.

## About — ISR Render

`GET /about`, `src/app/[locale]/(shop)/about/page.tsx`. Static, no database
read at all — brand copy comes from `src/lib/brand.ts` constants.

```
┌────────┐  GET /<locale>/about   ┌─────────────────────┐
│ Browser│ ─────────────────────▶ │ prerendered HTML (ISR)│
└────────┘                        └──────────────────────┘
```

Failure: none — no external dependency to fail against.

## Catalogue — SSR + Client Hydration (`/shop`)

`GET /shop`, `src/app/[locale]/(shop)/shop/page.tsx` + `ShopBrowser` client
component. The server render exists for two reasons: a crawlable page-1 grid
for SEO, and an `initialData` seed so the client doesn't refetch on load.

```
┌────────┐ GET /<locale>/shop  ┌───────────────────┐
│ Browser│ ──────────────────▶ │ Server render (ISR) │
└────────┘                     │ getPublicProducts    │
                                │ getPublicTypes        │
                                │ (page 1, no filters)  │
                                └──────────┬────────────┘
                                           │ HTML + initialResult
                                           ▼
                                 ┌──────────────────────┐
                                 │ ShopBrowser hydrates   │
                                 │ useQuery(initialData)  │
                                 │ = initialResult        │
                                 │ (no refetch on load)   │
                                 └──────────────────────┘
```

Failure: same try/catch fallback pattern as the home page — a database
error during prerender yields an empty grid rather than a failed build;
`ShopBrowser`'s `useQuery` shows its loading skeleton on a client-side fetch
failure and the grid stays on whatever it last successfully rendered.

## `GET /api/products` — Client-Side Filter/Sort/Paginate

Fired by `ShopBrowser`'s TanStack Query whenever search/filters/sort/page
change (debounced 350ms for the search box). Public, no auth. See
`docs/api-overview.md` for the full param/response contract.

```
┌────────┐ fetch /api/products?... ┌──────────────┐
│ Browser│ ───────────────────────▶│ route handler │
└────────┘                         └──────┬────────┘
                                            │ clamp/validate every param
                                            ▼
                                  getPublicProducts(params)
                                  (storefront.ts, PUBLIC_PRODUCT_COLUMNS)
                                            │
                                            ▼
                                  { rows, count, page, pageSize }
```

Failure: `500` with `{ error: "failed" }` on any unexpected error (caught,
logged server-side); the client's `useQuery` surfaces this as an error state
and `keepPreviousData` keeps showing the last good page rather than blanking
the grid.

## Product Detail — Static Generation + Metadata + JSON-LD

`GET /shop/[code]`, `src/app/[locale]/(shop)/shop/[code]/page.tsx`.
`generateStaticParams` builds every `{locale, code}` pair for active
products at build time (bottom-up, covering both dynamic segments);
`dynamicParams` defaults to `true` so an unseen code at request time still
renders (and caches) on first hit.

```
┌────────┐ GET /<locale>/shop/<code>  ┌─────────────────────┐
│ Browser│ ──────────────────────────▶│ generateStaticParams  │
└────────┘                            │ (build time, or first │
                                       │  request if new code) │
                                       └──────────┬─────────────┘
                                                  ▼
                                    getPublicProductByCode(code)
                                    (status='active' AND lower(code)=...)
                                                  │
                              found? ──no──▶ notFound() -> 404
                                  │yes
                                  ▼
                    generateMetadata() + ProductJsonLd
                    (title/description/OG/alternates + schema.org)
                                  │
                                  ▼
                    ProductDetail render + related products
                    (getPublicProducts({type}), same product excluded)
```

Failure: a code that doesn't exist, or exists but is `draft`/`archived`,
returns `null` from `getPublicProductByCode` and the page calls `notFound()`
— identical 404 behavior either way, so a draft code never leaks its
existence through a different response shape or status.

## Colour Selection

Client interaction inside `ProductDetail` → `ColorSelector`, on `/shop/[code]`.

```
┌────────┐ click colour chip  ┌───────────────────┐
│ Browser│ ─────────────────▶ │ ColorSelector state │
└────────┘                    │ (client only)        │
                               └──────────┬────────────┘
                                          ▼
                          gallery swaps to that colour's images
                          (productImages.color match, else the
                           colour-agnostic set)
                                          │
                                          ▼
                          size list re-filters to that colour's
                          variants (SizeSelector re-renders)
```

Failure: none — pure client state, no network call. A colour with zero
stock across every size still renders (desaturated chip) so the shopper can
browse its photos; it just starts every size disabled.

## Size Selection / Sold-Out

Client interaction inside `ProductDetail` → `SizeSelector`, on `/shop/[code]`.

```
┌────────┐ click size chip  ┌──────────────────┐
│ Browser│ ────────────────▶│ SizeSelector state │
└────────┘                  └──────────┬──────────┘
                                        ▼
                          quantity > 0 for (colour, size)? ──no──▶ chip stays
                                        │yes                        aria-disabled,
                                        ▼                            click no-ops
                          selection recorded (contact-CTA copy
                          can reference it; no checkout exists)
```

Failure: a sold-out size is rendered `aria-disabled` (struck through), never
removed from the list — clicking it is a no-op, not an error. There is no
checkout flow to fail; the storefront's CTA is a LINE/Instagram DM link, not
a cart.

## Filter + Sort — URL Sync

`ShopBrowser`'s `syncUrl()`, fired on every filter/sort/page/search change.
Keeps the URL as the source of truth for shareable/bookmarkable catalogue
state (search-first pattern).

```
┌────────┐ change filter/sort/page  ┌───────────────────┐
│ Browser│ ────────────────────────▶│ setState + syncUrl │
└────────┘                          └──────────┬──────────┘
                                                ▼
                                router.replace(pathname?params,
                                                {scroll: false})
                                     (no history entry added)
                                                │
                                                ▼
                              useQuery re-keys on the new params
                              -> GET /api/products fires
```

Failure: none — a malformed/missing param simply falls back to its default
(e.g. `sort` falls back to `newest`) rather than erroring; see
`GET /api/products`'s own clamping for the server-side half of this.

## Sitemap

`GET /sitemap.xml`, `src/app/sitemap.ts`. Cached like any other route
handler; lists every static storefront route and every active product, in
both locales, with `hreflang` alternates.

```
┌────────┐ GET /sitemap.xml  ┌────────────────────────┐
│Crawler │ ─────────────────▶│ sitemap() route handler  │
└────────┘                   └──────────┬────────────────┘
                                        ▼
                          static entries (/, /shop, /about x 2 locales)
                          + getActiveProductCodes() -> product entries
                                        │
                                        ▼
                              MetadataRoute.Sitemap XML
```

Failure: `getActiveProductCodes()` is wrapped in try/catch — a database
error yields a sitemap covering only the static routes (empty product list)
rather than failing the whole response.

## Robots

`GET /robots.txt`, `src/app/robots.ts`. Static — no database read.

```
┌────────┐ GET /robots.txt  ┌─────────────────────────────┐
│Crawler │ ────────────────▶│ allow "/"; disallow          │
└────────┘                  │ "/*/admin", "/*/login",       │
                             │ "/api/"; sitemap: <url>       │
                             └───────────────────────────────┘
```

Failure: none — fully static, no external dependency.

## 404 — Draft/Archived/Unknown Product Code

Triggered by `notFound()` inside `/shop/[code]`'s page component (see
"Product Detail" above) or by any path that resolves to no route at all.

```
┌────────┐ GET /<locale>/shop/<bad-code>  ┌─────────────────────┐
│ Browser│ ──────────────────────────────▶│ getPublicProductByCode│
└────────┘                                └──────────┬─────────────┘
                                                     │ null (not found,
                                                     │  OR found but
                                                     │  draft/archived)
                                                     ▼
                                              notFound() -> 404 page
                                              (locale-scoped chrome)
```

Failure mode is the point of this flow: a draft/archived code and a
genuinely nonexistent code are indistinguishable to the caller — both hit
the same `null` branch and the same 404, so a guessed code can never be used
to confirm a product exists but isn't published yet. A path that doesn't
resolve to any `[locale]` segment at all falls through to the root-level
`src/app/not-found.tsx` instead (its own `<html>`/`<body>`, default locale).

## Admin Dashboard

`GET /admin`, `src/app/[locale]/admin/page.tsx`. Always dynamic (`ƒ`) — the
admin layout's `requireOwner()` forces that for the whole subtree.

```
┌────────┐ GET /<locale>/admin  ┌────────────────┐
│ Owner  │ ────────────────────▶│ requireOwner()   │
└────────┘                      └──────┬────────────┘
                                        ▼
                              getDashboardData()
                              (products+variants+images+orders,
                               fetched once, aggregated in JS)
                                        │
                                        ▼
                      KPI cards + charts (Recharts) + alerts panel
                      (no photo / no price / no variants / all sold out)
```

Failure: this route never runs at prerender time (it's gated dynamic), so
there is no build-time fallback path like the public pages have — a
database error here surfaces as a normal Next.js error boundary/500, since
the owner is already authenticated and expects live data.

## Product Browse

`GET /admin/products`, `ProductBrowser` client component + `GET
/api/admin/products`. Card/table view toggle, URL-synced filters.

```
┌────────┐ GET /<locale>/admin/products  ┌───────────────────┐
│ Owner  │ ─────────────────────────────▶│ requireOwner()      │
└────────┘                               │ + getProductTypes()  │
                                          └──────────┬────────────┘
                                                     ▼
                               ProductBrowser (client) hydrates
                                                     │
                                          useQuery -> GET /api/admin/products
                                          (full columns, owner-gated, 401/403
                                           re-checked independently)
                                                     │
                                                     ▼
                               card grid or dense table (localStorage
                               remembers column visibility)
```

Failure: `401`/`403` from the API route if the session somehow lapsed
between page load and the client fetch (rare — the page itself already
required a session); `500` on an unexpected query error, surfaced as a
`useQuery` error state.

## `GET /api/images/[...key]` — Private Bucket Read

Public product-image request. The URL remains stable while Railway credentials
and signed storage URLs stay private.

```
Browser / next/image loader
          │ GET /api/images/products/<uuid>/<immutable-file>.webp
          ▼
validate exact product key ──invalid──▶ 404
          │ valid
          ▼
Railway private Bucket GetObject
          ├── missing ────────────────▶ 404
          ├── storage failure ────────▶ 502
          └── WebP stream + ETag + one-year immutable cache ──▶ Browser/CDN
```

An `If-None-Match` request matching the stored ETag returns `304`. The route
accepts only generated `products/<uuid>/*-(480|800|1600).webp` keys.

## Image Upload — Resize → Presign → Bucket PUT

Runs inside `ProductForm` whenever the owner picks image files, for both
create and edit. The file never touches this app's server.

```
┌────────┐ pick files        ┌─────────────────────────┐
│ Browser│ ─────────────────▶│ resizeProductImage(file)  │
└────────┘                   │ canvas -> WebP x3 widths   │
                              │ (480/800/1600, skip if     │
                              │  source is narrower)        │
                              └──────────┬──────────────────┘
                                        │ buildProductImageKey() x3
                                        ▼
                        POST /api/uploads/presign
                        { productId, keys }  (owner-gated)
                                        │
                              3-layer key validation
                              (schema, regex, prefix re-check
                               in lib/r2.ts)
                                        ▼
                        { uploads: [{key,url}] }  (300s-valid PUT URLs)
                                        │
                                        ▼
                        Browser PUTs each WebP blob
                        directly to the Railway Bucket (parallel)
                                        │
                                        ▼
                        widest rendition's URL/key stored
                        as the "canonical" image (form state,
                        not yet written to the DB)
```

Failure: any failed presign or failed PUT throws inside `handleFiles`,
caught and surfaced as a generic error toast (`errors.generic`); nothing
partially uploaded is referenced by the product until the surrounding
create/edit action actually saves, so a failed upload just means the image
never appears in the picker — no orphaned DB reference, though the bucket
objects themselves may be orphaned (see the product-form.tsx comment on
`handleRemoveImage`).

Local development runs this flow unchanged against the MinIO container in
`docker-compose.yml`: `STORAGE_ENDPOINT` swaps the S3 endpoint and
`STORAGE_FORCE_PATH_STYLE=true` selects MinIO addressing. Every other box
above — resize, key building, the 3-layer validation, the presigned PUT — is
the same code. See the README's Installation & Setup.

## Create Product

`createProduct` Server Action, `src/app/[locale]/admin/products/actions.ts`.
Triggered by submitting `ProductForm` in create mode.

```
┌────────┐ submit form  ┌───────────────────┐
│ Owner  │ ────────────▶│ createProduct()     │
└────────┘               └──────┬───────────────┘
                                 │ auth -> isOwner -> zod parse
                                 ▼
                      db.transaction(async tx => {
                        nextProductCodeIn(tx, type)   <- code is MINTED here;
                          -> "TS-003"                     v.productCode (the
                                                          form's preview) is
                                                          ignored outright
                        insert products (+ optional pre-set id)
                        insert productVariants[]  (sortOrder = index)
                        insert productImages[]    (sortOrder = index)
                      })
                                 │
                    success? ──no──▶ unique_violation? -> retry with the next
                        │yes                              number (up to 5x),
                        │                                 then duplicate_code
                        │                    other -> insert_failed (rollback)
                        ▼
              learnProductType() (best-effort, non-blocking)
              revalidateStorefront(assignedCode)  (both locales)
                                 │
                                 ▼
                    { ok: true, id }  ->  router.push /admin/products
```

Failure: a duplicate `productCode` (case-insensitive, unique index) rolls
back the whole transaction and returns `duplicate_code` — no partial
product/variants/images row survives. Any other insert failure rolls back
identically and returns `insert_failed`. Auth/role failures short-circuit
before any database work at all (`unauthorized`/`forbidden`).

## Product Code Generation

`src/lib/product-code.ts`, reached two ways: `previewProductCode` (the form,
on every type change) and `nextProductCodeIn` (inside `createProduct`'s
transaction). Product codes are never typed — the form's code input is
read-only and the server ignores whatever it receives.

```
owner picks a product type
        │
        ▼
previewProductCode(type)   [owner-gated action]
        │
        ▼
codePrefixFor(type):  product_types.code_prefix ──found──▶ "TS"
        │not set
        ▼
derivePrefix(nameEn -> slug -> name, avoiding taken prefixes)
   "T-Shirt" -> TS   |   "Shorts" vs "Shirt" -> SH / SHO
        │ persist onto the type row (best-effort)
        ▼
nextSequence("TS"):  max over BOTH sources
        ┌───────────────────┐        ┌──────────────────────┐
        │ products          │        │ order_items          │
        │ .product_code     │  UNION │ .product_code        │
        │ (live catalogue)  │        │ (snapshotted history)│
        └─────────┬─────────┘        └──────────┬───────────┘
                  └────────────┬────────────────┘
                               ▼
                        highest + 1  ->  "TS-003"
                               │
                               ▼
                form shows it, read-only (a PREVIEW)
                               │
                    on save, createProduct mints again
                    inside its own transaction
```

Reading `order_items` too is what stops a retired code coming back: a
deleted product's code still lives on its order lines, and
`reports.ts#profitByProduct` groups on that snapshot — reissuing the code
would merge a dead product's sales into a new one's report row. A code whose
product was deleted before it was ever ordered *is* reusable, which is
harmless because no history refers to it.

Failure: no type selected returns `null` and the form leaves the code empty
(and every other field disabled — the product's identity depends on the
type). A type with no ASCII letters anywhere and no stored prefix falls back
to `PR`; the owner sets a real one in **Settings -> product types**, where
each type shows and edits its prefix. Codes are **immutable once assigned** —
`updateProduct` and `updateProductInline` never write `productCode`, even
when the product's type changes, because it is the storefront URL
(`/shop/<code>`) and the key every order line snapshotted.

## Edit Product + Cover Reorder

`updateProduct` Server Action. Triggered by submitting `ProductForm` in edit
mode. Cover photo = whichever image sits at `sortOrder = 0`; dragging or
star-clicking a different image to the front in the UI is what sets that.

```
┌────────┐ submit form (id, values,        ┌────────────────────┐
│ Owner  │ newImages, removedImageIds,      │ updateProduct()      │
│        │ imageOrder[{id,sortOrder}])  ───▶│                       │
└────────┘                                   └──────┬─────────────────┘
                                                     │ auth -> isOwner -> zod parse
                                                     ▼
                                    fetch storageKeys of removedImageIds
                                    (BEFORE the transaction deletes them —
                                     R2 cleanup runs after commit)
                                                     ▼
                              txDb().transaction(async tx => {
                                update products
                                delta-match productVariants:
                                  delete stale ids, update-by-id kept,
                                  upsert (productId,color,size) new ones
                                delete removedImageIds
                                insert newImages
                                update imageOrder[].sortOrder  <- cover
                              })
                                                     │
                                    success? ──no──▶ duplicate_code /
                                        │yes              not_found / update_failed
                                        ▼
                          best-effort R2 delete for removedKeys
                          (derive + remove 480/800/1600 siblings)
                          learnProductType() + revalidateStorefront(code)
```

Failure: same rollback semantics as create — a duplicate code or any insert
error rolls back the whole transaction, so variants/images never end up
half-updated. R2 cleanup for removed images is deliberately **outside** the
transaction and best-effort (caught, logged) — a storage-delete failure must
never undo an already-committed database write.

## Inline Table Edit

`updateProductInline` Server Action, triggered from `ProductRow` (table
view) — Enter or blur saves, Escape cancels.

```
┌────────┐ edit cell, blur/Enter  ┌─────────────────────────┐
│ Owner  │ ──────────────────────▶│ updateProductInline(id,v) │
└────────┘                        └──────────┬─────────────────┘
                                             │ auth -> isOwner -> zod parse
                                             ▼
                                db.update(products).set({...})
                                (single statement, plain `db` —
                                 no multi-table write here)
                                             │
                              success? ──no──▶ duplicate_code / not_found /
                                  │yes              update_failed
                                  ▼
                    learnProductType() + revalidateStorefront(code)
```

Failure: a validation or uniqueness failure leaves the row's on-screen value
unchanged and surfaces the error inline (the row's own edit-state error
handling) — no partial write, since this is always a single UPDATE
statement.

## Delete Product

`deleteProduct` Server Action. Triggered from a delete button/confirm in the
product browser or edit form.

```
┌────────┐ confirm delete  ┌────────────────┐
│ Owner  │ ───────────────▶│ deleteProduct(id)│
└────────┘                 └──────┬─────────────┘
                                  │ auth -> isOwner -> fetch productCode
                                  │            + productImages.storageKey[]
                                  ▼
                      db.delete(products).where(id=...)
                      (single statement — FK ON DELETE CASCADE
                       removes productVariants + productImages
                       rows in the same statement)
                                  │
                                  ▼
                      best-effort R2 delete for each storageKey
                      (derive + remove 480/800/1600 siblings)
                      revalidateStorefront(code)
```

Failure: a nonexistent id returns `not_found` before any delete runs. R2
cleanup failures are caught/logged and never block the response — an
orphaned R2 object costs storage, not correctness.

## Variant Rows Save

Not a separate Server Action — the stock grid built by `VariantRowsEditor`
is submitted as part of **Create Product** or **Edit Product** (see those
flows for the actual database write). Documented separately because it has
its own distinct client-side data shape.

One block per colour, every standard size across it. "Add color (all
sizes)" creates the whole block at once with each size already at 0, so a
new colourway is one click plus the numbers — no size buttons to press
first.

```
┌────────┐ "Add color (all sizes)"  ┌───────────────────────────────┐
│ Owner  │ ────────────────────────▶│ VariantRowsEditor               │
└────────┘                           │                                 │
                                      │  [colour combobox]         [x]  │
                                      │  XS   S   M   L   XL  2XL  Free │
                                      │   0   0   0   0   0    0    0   │
                                      │                                 │
                                      │ colour: presets (No color/Black/│
                                      │ White/Pink/Yellow/Grey/Blue),   │
                                      │ free text wins if typed         │
                                      └──────────────┬──────────────────┘
                                                     │ toVariants(): one row
                                                     │ per cell that HOLDS A
                                                     │ NUMBER — a blank cell
                                                     │ is not a row
                                                     ▼
                                    form.setValue("variants", next)
                                    -> productFormSchema validates
                                       (duplicate (colour,size) rejected)
                                                     │
                                                     ▼
                                    submitted with the rest of the
                                    product form -> create/updateProduct
```

Blank vs `0` is the load-bearing distinction: `0` is a real row meaning
"this combination exists and is sold out"; blank means the combination does
not exist at all. Opening an existing product shows the standard sizes it
never had as blank cells, so saving without touching them leaves it exactly
as it was — the editor never quietly adds zero-quantity rows to a product
the owner only came to re-price. Typing into a blank creates that row;
clearing one back to blank removes it.

Renaming a block's colour rewrites the colour on its existing rows rather
than replacing them, so variant ids survive and `updateProduct` takes its
update-by-id path instead of delete-and-reinsert.

Failure: two blocks with the same colour are flagged inline and fail
`productFormSchema`'s refine check (`duplicate_variant`) before the form
submits — the server action re-validates the same schema regardless, so a
hand-crafted payload cannot get past it either.

## Excel Import — Parse → Preview → Commit

`ProductImport` client component (parse) + `importProducts` Server Action
(commit), reached from `/admin/products/import`.

```
┌────────┐ upload .xlsx  ┌────────────────────────────┐
│ Owner  │ ─────────────▶│ parseProductWorkbook(data)   │
└────────┘                │ (client-side, xlsx library)   │
                           │ findHeaderRow -> mapColumns    │
                           │ (Thai/English header aliases)  │
                           │ parseVariantCell() for "ไซซ์"  │
                           └──────────┬───────────────────────┘
                                     ▼
                       editable preview table (per-row include
                       toggle; duplicate productCode flagged
                       against existingCodes, update-or-skip
                       chosen per row — default: skip)
                                     │ owner confirms
                                     ▼
                       importProducts(rows)  [Server Action]
                                     │ auth -> isOwner -> zod parse (array, max 1000)
                                     ▼
                    txDb().transaction(async tx => {
                      one bulk SELECT of existing (code -> id)
                      for each row:
                        exists + updateExisting? -> update product,
                          delete+reinsert its variants wholesale
                        exists + !updateExisting -> skip
                        new -> insert product + variants
                    })
                                     │
                                     ▼
                    learnProductType() per distinct type (deduped)
                    revalidateStorefront()  (no single code — whole
                    /shop list invalidated; individual /shop/[code]
                    pages age out on their normal 300s window)
```

Failure: the whole batch is one transaction — a mid-batch error (e.g. an
unexpected constraint violation) rolls back every row in the import, not
just the failing one, so a partial import never lands. A row that fails the
per-row zod schema is rejected before the transaction opens at all
(`invalid`).

## Orders List

`GET /admin/orders`, `OrderList` client component + `GET /api/admin/orders`.

```
┌────────┐ GET /<locale>/admin/orders  ┌──────────────────┐
│ Owner  │ ────────────────────────────▶│ requireOwner()     │
└────────┘                              └──────────┬───────────┘
                                                   ▼
                                   OrderList (client) hydrates
                                                   │
                                        useQuery -> GET /api/admin/orders
                                        (status/date-range/search filters
                                         AND sort resolved in SQL, not in
                                         memory)
                                                   │
                                                   ▼
                                     table: order#, date, customer,
                                     status (inline changer), totals
                                                   │
                        click "Order no." or "Order date" header
                                                   │
                                    first click -> descending
                                    click again -> ascending
                                    (aria-sort set; page resets to 1)
                                                   ▼
                                     refetch with sort=orderno_high
                                     | orderno_low | newest | oldest
```

Sorting is shared state with the sort dropdown, so the two never disagree.
Every date sort carries `orderNo DESC` as a tiebreaker — `orderDate` is a
DATE, so a day's orders would otherwise tie and paginate unstably, dropping
or repeating rows between pages.

Failure: `401`/`403` on a lapsed session, `500` on an unexpected query
error — identical shape to Product Browse. An unrecognised `sort` value
falls back to `newest` at the route boundary.

## Create Order

`createOrder` Server Action, triggered by submitting `OrderForm` (new
order). The `recalc_order` Postgres trigger — not application code —
computes `orders.itemsTotal`/`itemsCost` from the inserted line items.

```
┌────────┐ submit multi-line order  ┌─────────────────┐
│ Owner  │ ─────────────────────────▶│ createOrder()     │
└────────┘                           └──────┬───────────────┘
                                            │ auth -> isOwner -> zod parse
                                            ▼
                             txDb().transaction(async tx => {
                               insert orders (shipping/packing/status/note)
                               insert orderItems[] (snapshotted product
                                 fields: code/name/type/color/size/cost/price)
                             })
                                            │
                                     [Postgres AFTER INSERT trigger fires
                                      on order_items -> recalc_order(order_id)
                                      -> orders.items_total/items_cost updated
                                      -> totalCost/profit GENERATED columns
                                         recompute automatically]
                                            │
                                    success? ──no──▶ insert_failed (rollback)
                                        │yes
                                        ▼
                            revalidateOrders(id)  (admin paths only —
                            orders never affect the public storefront)
```

Failure: any insert failure rolls back the whole transaction — an order is
never created with a subset of its line items. **Stock is never touched
here** — `productVariants.quantity` is a completely separate, manually
maintained ledger; see `CLAUDE.md` for why that's deliberate.

## Edit Order

`updateOrder` Server Action, triggered by submitting `OrderForm` in edit
mode from `/admin/orders/[id]`.

```
┌────────┐ submit edited order  ┌─────────────────┐
│ Owner  │ ─────────────────────▶│ updateOrder(id,v) │
└────────┘                       └──────┬───────────────┘
                                        │ auth -> isOwner -> zod parse
                                        ▼
                          txDb().transaction(async tx => {
                            update orders (shipping/packing/status/etc)
                            delete ALL existing orderItems for this order
                            insert the submitted items[] fresh
                          })
                                        │
                              [recalc_order trigger fires again on both
                               the deletes and the inserts, leaving
                               items_total/items_cost correct either way]
                                        │
                                        ▼
                              revalidateOrders(id)
```

Failure: order line items have no client-side identity (`orderItemSchema`
carries no `id`), so edits are always **delete-all, reinsert-all** inside one
transaction — not a delta-match like variants. A failure mid-transaction
rolls back both the delete and the reinsert, so the order is never left with
zero or duplicate line items.

## Quick Order Status Change

`setOrderStatus` Server Action, triggered from the inline status dropdown in
`OrderList` (and also available on the order detail page).

```
┌────────┐ pick new status  ┌───────────────────────┐
│ Owner  │ ─────────────────▶│ setOrderStatus(id,status)│
└────────┘                   └──────────┬───────────────┘
                                        │ auth -> isOwner -> enum parse
                                        ▼
                              db.update(orders).set({status})
                              (single statement)
                                        │
                                        ▼
                              revalidateOrders(id)
```

Failure: an invalid status value fails the zod enum parse before any write
(`invalid`); a nonexistent order id returns `not_found`.

## Print Order Receipt

`PrintOrderButton` on `/admin/orders/[id]`. Purely a browser print dialog —
no server round trip.

```
┌────────┐ click "print"  ┌──────────────────┐
│ Owner  │ ───────────────▶│ window.print()     │
└────────┘                 └──────────┬───────────┘
                                      ▼
                    browser print dialog opens; CSS print
                    variants show only OrderReceipt
                    (`hidden print:block`) and hide the
                    interactive form (`print:hidden`)
```

Failure: none — no network call; if the browser blocks the print dialog
(popup-blocker-adjacent behavior) the button simply does nothing further.

## Delete Order

`deleteOrder` Server Action, triggered by a delete button/confirm in
`OrderList`.

```
┌────────┐ confirm delete  ┌─────────────┐
│ Owner  │ ───────────────▶│ deleteOrder(id)│
└────────┘                 └──────┬───────────┘
                                  │ auth -> isOwner -> fetch order exists
                                  ▼
                        db.delete(orders).where(id=...)
                        (single statement — FK ON DELETE CASCADE
                         removes orderItems in the same statement,
                         which ALSO fires the recalc_order DELETE
                         trigger per removed line — harmless, the
                         parent row is gone in the same statement)
                                  │
                                  ▼
                        revalidateOrders()
```

Failure: a nonexistent id returns `not_found` before any delete runs.

## Reports — View + Excel Export + Print

`GET /admin/reports`, `ReportView` client component reading
`getReportsData()`. Four tabs: monthly, annual, profit-by-product,
inventory (a point-in-time snapshot that ignores the date range).

```
┌────────┐ GET /<locale>/admin/reports?tab=..&year=..&month=..
│ Owner  │ ────────────────────────────────────────────────▶ ┌─────────────────────┐
└────────┘                                                    │ derive date range      │
                                                                │ from tab/year/month     │
                                                                └──────────┬────────────────┘
                                                                          ▼
                                                             getReportsData({dateFrom,dateTo})
                                                             (orders excl. cancelled,
                                                              inventory snapshot,
                                                              profitByProduct grouped
                                                              on orderItems.productCode
                                                              — the SNAPSHOT, never
                                                              orderItems.productId)
                                                                          │
                                                                          ▼
                                                             ReportView renders table
                                                                          │
                                          ┌───────────────────┴───────────────────┐
                                          ▼                                       ▼
                              "Export Excel" -> exportToExcel()          "Print" -> window.print()
                              (client-side xlsx, downloads .xlsx)        (print:-scoped CSS,
                                                                           header block only
                                                                           in print output)
```

Failure: no explicit error path in `getReportsData()` beyond a normal
database error surfacing as a Next.js error boundary — this route is always
dynamic (owner-gated), so there's no build-time fallback to reason about.
Grouping `profitByProduct` on the **snapshotted** `productCode` (not the
soft-linked, nullable `productId`) is what keeps a deleted product's
historical profit visible in this report after the product row itself is
gone.

## Settings — Create Product Type

`createProductType` Server Action, triggered from the "add" row in
`ProductTypeManager` on `/admin/settings`.

```
┌────────┐ type name (+ optional nameEn), Enter/click  ┌───────────────────┐
│ Owner  │ ─────────────────────────────────────────────▶│ createProductType()│
└────────┘                                                └──────────┬───────────┘
                                                                     │ auth -> isOwner -> zod
                                                                     ▼
                                                    SELECT max(sortOrder) -> +1
                                                    INSERT productTypes
                                                    (slugify(name), single db call)
                                                                     │
                                                        success? ──no──▶ duplicate_type
                                                            │yes           / insert_failed
                                                            ▼
                                                    revalidateSettings()
```

Failure: a duplicate name (unique constraint) returns `duplicate_type`
without touching the reference list.

## Settings — Rename Product Type (Cascade)

`renameProductType` Server Action, triggered from the inline edit row in
`ProductTypeManager`.

```
┌────────┐ edit name/nameEn, confirm  ┌──────────────────────┐
│ Owner  │ ───────────────────────────▶│ renameProductType(id,v)│
└────────┘                             └──────────┬────────────────┘
                                                   │ auth -> isOwner -> zod parse
                                                   ▼
                                    txDb().transaction(async tx => {
                                      fetch existing name
                                      update productTypes SET name,nameEn
                                      IF name actually changed:
                                        update products SET productType=new
                                        WHERE productType = old name
                                        (cascades to every product using it)
                                    })
                                                   │
                                        success? ──no──▶ duplicate_type /
                                            │yes            not_found / update_failed
                                            ▼
                                    revalidateSettings()
                                    (which itself calls revalidateStorefront() —
                                     a rename can change what /shop shows)
```

Failure: a duplicate target name rolls back the whole rename (including any
cascade that hadn't committed) and returns `duplicate_type` — no product is
left half-migrated to a name that then collides.

## Settings — Delete Product Type (Blocked When In Use)

`deleteProductType` Server Action, triggered from the delete button (with a
confirm dialog) in `ProductTypeManager`.

```
┌────────┐ confirm delete  ┌──────────────────────┐
│ Owner  │ ───────────────▶│ deleteProductType(id)  │
└────────┘                 └──────────┬────────────────┘
                                      │ auth -> isOwner -> fetch type name
                                      ▼
                          COUNT products WHERE productType = name
                                      │
                          count > 0? ──yes──▶ { ok:false, error:"in_use", count }
                              │no                (delete refused, UI shows the count)
                              ▼
                     DELETE productTypes WHERE id=...
                                      │
                                      ▼
                          revalidateSettings()
```

Failure (the flow's whole point): a type still referenced by any product is
**never** deleted — `products.productType` is free text, not a foreign key,
so a silent delete would leave products pointing at a name absent from the
managed list. The action returns the exact blocking count instead so the UI
can tell the owner what's in the way.

## Settings — Reorder Product Types

`reorderProductTypes` Server Action, triggered by the up/down arrows in
`ProductTypeManager`.

```
┌────────┐ click up/down arrow  ┌──────────────────────────┐
│ Owner  │ ─────────────────────▶│ reorderProductTypes(ids[]) │
└────────┘                       └──────────┬────────────────────┘
                                            │ auth -> isOwner -> zod (uuid array)
                                            ▼
                              txDb().transaction(async tx => {
                                for each id in the new order:
                                  update productTypes SET sortOrder=index
                              })
                                            │
                                            ▼
                                  revalidateSettings()
```

Failure: any single update failure rolls back the whole reorder — the list
is never left in a half-reordered state. `N` sequential updates inside one
transaction is accepted here because the reference list is small (a
boutique shop's product-type count, not a large catalogue).

## Settings — Clear Shop Data

`clearShopData` Server Action, `src/app/[locale]/admin/settings/actions.ts`,
from the Shop data panel (`components/settings/data-tools.tsx`). Empties the
shop; there is no demo-loader sibling action.

```
┌──────────┐  click "Clear all data"   ┌──────────────────┐
│  Owner   │ ────────────────────────▶ │ confirm dialog   │
└──────────┘                           │ type "DELETE"    │
                                       └────────┬─────────┘
                                                │ clearShopData("DELETE")
                                                ▼
                                   getCurrentUser() -> isOwner()
                                   -> confirmation === "DELETE"
                                                │  (any check fails -> return,
                                                │   nothing is deleted)
                                                ▼
                              read product_images.storage_key  (BEFORE the
                                                │               delete)
                                                ▼
                    ┌───────────── db.transaction() ─────────────┐
                    │ delete order_items -> orders               │
                    │ delete product_images -> product_variants  │
                    │        -> products                         │
                    │ ALTER orders.order_no RESTART              │
                    └────────────────────┬───────────────────────┘
                                         │ COMMIT
                                         ▼
                    best-effort object delete, ALL 3 widths per key
                    (480/800/1600 — only the widest is stored on
                     the row, so the others need deriving)
                                         │
                                         ▼
                       revalidateSettings() + revalidateOrders()
```

Kept on purpose: `users` (wiping the only owner locks you out of the admin
that triggered the wipe) and `product_types` (reference data, re-seeded by
`npm run db:seed`, referenced by name from products).

Failure: a failed check returns `unauthorized`/`forbidden`/`confirm_mismatch`
and deletes nothing; a mid-transaction error rolls the whole delete back and
returns `clear_failed` with every row still present. A failed object delete
is logged and ignored — an orphaned object costs storage, a half-committed
wipe costs correctness. **There is no undo**: recovery means a Railway
Postgres restore, and the deleted objects are gone.

## Catalogue Prepare — Workbook Extraction

`npm run catalog:prepare`, an out-of-band CLI for
`data/stock_fairystuff.xlsx`. It is separate from the ordinary owner-facing
Excel importer and never writes the database or object storage.

```
CLI
 │
 ▼
XLSX.readFile(bookFiles + cached formulas + hyperlinks)
 │
 ├── exact columns: A audit ref, C drawing, D colour,
 │                  E original cost, F selling price, G/H supplier
 ├── parse drawing XML + relationship XML -> embedded media by row
 └── retain rows with audit ref + numeric E + numeric F
                         │
                         ▼
                 exactly 53 rows?
                  │yes          │no
                  ▼             └──▶ stop: workbook selection drift
stable workbook-row order
 │
 ├── cached formula totals retained (SS/FF)
 ├── formula row references -> component product photos
 ├── incomplete/code-less rows excluded
 └── duplicate SS010 placement resolves to one complete row
                         │
                         ▼
              workbook ref kept for audit only
              (never becomes products.product_code)
```

Failure: a changed workbook that no longer yields exactly 53 complete rows
fails preparation before a manifest is written. Empty cached formula values
are not recomputed or treated as zero.

## Catalogue Prepare — Supplier Enrichment + Workbook Fallback

Runs once for each extracted row. Supplier HTML is fetched as bytes; page
scripts are never executed.

```
raw multiline cell / hyperlink
          │
          ▼
extract first URL -> canonical supplier identity
          │
          ├── SHEIN / Amazon / 1688 / Taobao only
          ├── strip tracking query parameters
          └── HTTPS + allow-listed host + public DNS required
                              │
                              ▼
                 bounded HTML fetch (manual redirects)
                              │
                metadata available? ──no──────────────┐
                              │yes                     │
                              ▼                        │
             title + selected colour + gallery URLs   │
                              │                        │
             each image: allow-listed CDN, HTTPS,     │
             bounded bytes, image MIME, dimensions,   │
             reject review/icon/swatch/size/video URLs│
                              │                        │
                              ▼                        │
                   hash-deduplicate clean images      │
                              │                        │
                 at least one accepted? ──no──────────┤
                              │yes                     │
                              ▼                        ▼
                 cache supplier originals      embedded C-column photo(s)
                                               (set formulas include component
                                                rows; hash-deduplicated)
                                                        │
                                           usable fallback?
                                            │yes       │no
                                            ▼          ▼
                                  cache workbook   approved row 77?
                                  originals         │yes       │no
                                                    ▼          ▼
                                          temporary-none     BLOCKING
                                          image policy       warning
```

The resulting entry carries a concise Thai name, curated type, canonical
Thai colour, verified prices, private source fields, provenance/hash, and
warnings. SS/FF bundles use `หลายสี`; `full set Belle` is never a colour.
Repeated supplier identities remain separate entries and are warned, because
workbook price/selected imagery can differ. Row 77 remains active with a
prominent `NEGATIVE MARGIN: -110` warning and an owner-approved
`temporary-none` image policy. It receives no `product_images` row and uses
the application's normal placeholder. A real photo may later be supplied as
an explicit reviewed override with `--image=77:<path>`.

Failure: network, redirect, host, MIME, size, or metadata failures do not
drop the product; they select the workbook fallback. If neither source has a
valid photo, preparation emits the review entry. Only the explicit row-77
exception may verify with no photo; every other empty-image row stays blocked.

## Catalogue Verify + Import Dry Run

`npm run catalog:verify` and the default `npm run catalog:import` are
read-only validation paths.

```
review manifest
      │
      ▼
Zod contract: version + exactly 53 products
      │
      ├── active status / allowed type / canonical fields
      ├── each product has an image, except explicit temporary-none
      ├── every local image exists + SHA-256 matches
      └── every binary still passes image validation
                    │
              valid? ──no──▶ stop with row/file reason
                    │yes
                    ▼
       catalog:verify -> summary only
       catalog:import (without --apply) -> dry-run summary only
                    │
                    └── no DB connection, no Bucket/MinIO write
```

Failure: any unapproved missing image fails closed. Applying cannot bypass
verification; the row-77 exception remains active and uses the standard
placeholder until a real photo is uploaded.

## Catalogue Apply — Storage Staging

Triggered only by `catalog:import -- --apply --replace` plus the exact phrase
printed by the CLI. A public database hostname additionally requires
`--allow-remote`.

```
all manifest checks pass
          │
          ▼
guard --apply + --replace + exact confirmation
          │
          ├── remote target? -> require --allow-remote
          └── show DB hostname + bucket (never credentials)
                              │
                              ▼
                         find owner user
                              │
                              ▼
                 allocate product UUIDs in row order
                              │
              per accepted source image:
                              ▼
               Sharp rotate/normalize -> WebP
                    480 / 800 / 1600
                              │
                              ▼
       upload deterministic products/<uuid>/catalog-...-<width>.webp
                              │
                              ▼
            remember every staged key; canonical URL = 1600
                              │
                              ▼
             all images staged BEFORE DB transaction opens
```

Failure: any read, decode, resize, or upload failure deletes every object
already staged by this run and leaves all database rows and old images
untouched.

## Catalogue Apply — Transactional Replacement

Runs only after storage staging succeeds completely.

```
snapshot old product image keys
          │
          ▼
┌──────────────────── one db.transaction() ────────────────────┐
│ delete order_items -> orders                                 │
│ delete product_images -> product_variants -> products        │
│ restart orders.order_no identity                             │
│ upsert 13 product types (including FW/BG/AW)                  │
│                                                              │
│ for 53 products in stable workbook-row order:                │
│   nextProductCodeIn(type) -> immutable application code      │
│   insert product status=active + private supplier fields     │
│   insert one variant: detected colour x Free Size, qty=99    │
│   insert images: cover colour=NULL; others=exact variant text│
│                  URL/storage key point to canonical 1600     │
│                  row 77 temporary-none -> no image row       │
│                                                              │
│ no fake orders are inserted                                  │
└──────────────────────────┬───────────────────────────────────┘
                           ▼
                         COMMIT
```

Failure: any delete, type upsert, code generation, or insert error rolls the
entire transaction back, preserving the old products and orders.

## Catalogue Apply — Rollback + Object Cleanup

Handles object storage on both sides of the database transaction boundary.

```
                         transaction result
                         /                \
                      failure            success
                        │                   │
                        ▼                   ▼
              database auto-rollback   new rows committed
                        │                   │
                        ▼                   ▼
              delete every staged      derive all siblings from each
              480/800/1600 key         old canonical storage key
                        │                   │
                        ▼                   ▼
                 old DB + objects      best-effort delete old
                 remain authoritative  480/800/1600 objects
```

Staged rollback deletion is required for correctness and is attempted for
every key. Post-commit old-object cleanup is best-effort: a storage failure is
logged but cannot undo a committed database replacement. Product edit,
delete, and Settings clear use the same three-sibling cleanup helper, so
narrow renditions are no longer orphaned.

## Storefront Revalidation After a Product Mutation

Cross-cutting — not its own entry point, but a required side effect of
**every** action in Create/Edit/Inline-Edit/Delete Product, Excel Import,
and all three product-type mutations. Centralized in
`revalidateStorefront()` (`src/app/[locale]/admin/products/revalidate.ts`).

```
Any product-mutating action commits
              │
              ▼
   revalidateStorefront(code?)
              │
   for EACH configured locale (th, en):
      revalidatePath(`/${locale}`)
      revalidatePath(`/${locale}/shop`)
      revalidatePath(`/${locale}/admin`)
      revalidatePath(`/${locale}/admin/products`)
      if (code) revalidatePath(`/${locale}/shop/${code}`)
              │
              ▼
   next request to any of those paths re-renders
   fresh instead of serving the stale ISR cache
```

Failure note: `revalidatePath` is native to Next.js — no cache adapter is
involved — but on Railway the ISR cache it writes to (`.next/cache`) lives on
the container's own disk, not a managed edge cache. Two consequences worth
knowing: a redeploy wipes that disk, so every page starts cold again after a
deploy (a cold cache, not stale or lost data — the next request just
re-renders); and at more than one replica, each replica has its own disk and
cache, so a `revalidatePath()` call landing on one replica does not
invalidate the others' copies until they separately re-render or restart.
Both are fine at the single-replica deployment this app expects — see the
README's "ISR cache lives on the container's disk". Beyond that, the
remaining risk is the same as on any host — a **missed path**, not a missing
runtime: revalidation must cover BOTH locales (`/th/...` and `/en/...`) plus
the product's own detail URL. Miss one and that page keeps serving stale
price or stock until the 300s ISR window expires on its own — with no error
anywhere to indicate it.

Verify on the live deployment before relying on it: edit a price in admin,
then hard-reload `/th/shop` in a private window and confirm the new value
appears immediately rather than up to five minutes later. Repeat for `/en`.

## Unauthorized / Forbidden Denial Paths

Cross-cutting — the shape every owner-gated surface falls back to when the
caller isn't authenticated or isn't an owner. Three independent layers,
each re-checking on purpose (see `CLAUDE.md`'s security-model section for
why none of them may be skipped as "already covered upstream").

```
Request to a protected surface
              │
   ┌──────────┴───────────┐
   ▼                        ▼
/admin/** page          /api/admin/**, /api/uploads/** route
   │                        │
Layer 1: src/proxy.ts (no session)
   │                        │
   ▼                        ▼
307 -> /<locale>/login   401 JSON {error:"unauthorized"}
   (page requests only — never for /api/**)

Request reaches the handler anyway (proxy narrowed/bypassed)?
              │
   ┌──────────┴───────────┐
   ▼                        ▼
Layer 2: requireOwner()   Layer 2: getCurrentUser() + isOwner()
(admin/layout.tsx)        (each route handler, independently)
   │ no session -> redirect /login
   │ session, not owner -> redirect /
   ▼                        ▼
(page never renders)     401 unauthorized / 403 forbidden JSON

Any Server Action called directly (e.g. from a forged client request)?
              │
              ▼
Layer 3: getCurrentUser() + isOwner() inside the action itself
   │ no session -> { ok:false, error:"unauthorized" }
   │ not owner  -> { ok:false, error:"forbidden" }
   ▼
no database write ever attempted
```

Failure is the intended outcome at every layer above — this diagram
documents the defense-in-depth shape itself, not a bug path. The critical
property: **Layer 3 (the action's own check) is the only one with no
backstop behind it.** There is no RLS in this stack, so if a future action
is ever written without repeating `isOwner()`, layers 1 and 2 being intact
does not save it — a route moved outside `/api/admin/*`, or a proxy matcher
edited to exclude it, would leave that single missing check as the entire
remaining defense.

## Transaction Rollback on Mid-Write Failure

Cross-cutting — applies to every action that opens `txDb().transaction(...)`:
Create/Edit Product, Excel Import, Create/Edit Order, Rename/Reorder Product
Type. Demonstrated concretely with Create Product below; the mechanism is
identical everywhere else that uses `txDb()`.

```
createProduct() called
        │
        ▼
txDb().transaction(async tx => {
   insert products           ──┐
   insert productVariants[]    │  all statements share one
   insert productImages[]    ──┘  Postgres transaction
})
        │
   any statement throws?
   (e.g. duplicate productCode
    hits the unique index)
        │
   ┌────┴─────┐
   ▼            ▼
 yes           no
   │            │
   ▼            ▼
Postgres ROLLBACK        COMMIT
(products row never      (all three tables' rows
 exists; no orphaned      now visible together)
 productVariants/
 productImages rows
 survive)
        │
        ▼
action returns
{ok:false, error:"duplicate_code"} 
or {ok:false, error:"insert_failed"}
```

Failure is the subject of this flow: the whole point of a multi-table write
running inside a real Postgres transaction is that a failure partway through
never leaves a half-written product, order, or product-type rename in the
database. `txDb()` is a deprecated alias for `db` — calling `.transaction()`
on `db` itself works identically, since both reach the same pooled
`node-postgres` client (see `CLAUDE.md`); existing call sites still say
`txDb().transaction(...)` only because nothing has forced them to change.
`npm run smoke` verifies both directions mechanically — a mid-transaction
throw rolls back and a successful transaction commits (see
`docs/health-check.md`) — but verifying it for a *specific* action still
means deliberately forcing a failure mid-write (e.g. submitting a duplicate
product code with variants already queued) and confirming no orphaned rows
survive in `product_variants`/`product_images` — a manual check worth
re-running after any change to `createProduct`/`updateProduct`/
`importProducts`/`createOrder`/`updateOrder`/`renameProductType`/
`reorderProductTypes`.
