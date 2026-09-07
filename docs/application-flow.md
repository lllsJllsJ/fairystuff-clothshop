# Application Flow

## Flow Index

**Bootstrap & Auth**
1. [Request / Proxy Bootstrap — Locale Negotiation + Auth Guard](#request--proxy-bootstrap--locale-negotiation--auth-guard)
2. [Login](#login)
3. [Password Reset](#password-reset)
4. [Session — JWT Callbacks](#session--jwt-callbacks)
5. [Sign Out](#sign-out)
6. [Locale Switch](#locale-switch)

**Public storefront & guest commerce**
7. [Home — ISR Render](#home--isr-render)
8. [About — ISR Render](#about--isr-render)
9. [Catalogue — SSR + Client Hydration (`/shop`)](#catalogue--ssr--client-hydration-shop)
10. [`GET /api/products` — Client-Side Filter/Sort/Paginate](#get-apiproducts--client-side-filtersortpaginate)
11. [Product Detail — Static Generation + Metadata + JSON-LD](#product-detail--static-generation--metadata--json-ld)
12. [Colour Selection](#colour-selection)
13. [Size Selection / Preorder](#size-selection--preorder)
14. [Filter + Sort — URL Sync](#filter--sort--url-sync)
15. [Local Cart](#local-cart)
16. [Checkout + Order Creation](#checkout--order-creation)
17. [Preorder Code Generation](#preorder-code-generation)
18. [Preorder-Code Contact Handoff](#preorder-code-contact-handoff)
19. [Public Preorder Tracking](#public-preorder-tracking)
20. [Preorder Code Lookup](#preorder-code-lookup)
21. [Sitemap](#sitemap)
22. [Robots](#robots)
23. [404 — Draft/Archived/Unknown Product Code](#404--draftarchivedunknown-product-code)
24. [`GET /api/images/[...key]` — Private Bucket Read](#get-apiimageskey--private-bucket-read)

**Admin**
25. [Admin Dashboard](#admin-dashboard)
26. [Product Browse](#product-browse)
27. [Image Upload — Resize → Presign → Bucket PUT](#image-upload--resize--presign--bucket-put)
28. [Create Product](#create-product)
29. [Product Code Generation](#product-code-generation)
30. [Edit Product + Cover Reorder](#edit-product--cover-reorder)
31. [Inline Table Edit](#inline-table-edit)
32. [Delete Product](#delete-product)
33. [Variant Rows Save](#variant-rows-save)
34. [Excel Import — Parse → Preview → Commit](#excel-import--parse--preview--commit)
35. [Orders List](#orders-list)
36. [Create Order](#create-order)
37. [Edit Order](#edit-order)
38. [Quick Order Status Change](#quick-order-status-change)
39. [Line-Item Fulfillment + Partial Refund](#line-item-fulfillment--partial-refund)
40. [Full Order Refund](#full-order-refund)
41. [Print Order Receipt](#print-order-receipt)
42. [Delete Order](#delete-order)
43. [Reports — View + Excel Export + Print](#reports--view--excel-export--print)
44. [Settings — Create Product Type](#settings--create-product-type)
45. [Settings — Rename Product Type (Cascade)](#settings--rename-product-type-cascade)
46. [Settings — Delete Product Type (Blocked When In Use)](#settings--delete-product-type-blocked-when-in-use)
47. [Settings — Reorder Product Types](#settings--reorder-product-types)
48. [Settings — Clear Shop Data](#settings--clear-shop-data)
49. [Settings — Shop Contacts](#settings--shop-contacts)
50. [Settings — Brand](#settings--brand)
51. [Settings — Character Taxonomy](#settings--character-taxonomy)
52. [Settings — Order Status Labels](#settings--order-status-labels)
53. [Settings — Line-Item Status Lifecycle](#settings--line-item-status-lifecycle)
54. [Users — List + Filter](#users--list--filter)
55. [Users — Change Role](#users--change-role)
56. [Users — Delete Account](#users--delete-account)
57. [Users — Mark Email Verified](#users--mark-email-verified)
58. [Users — Send Password Reset](#users--send-password-reset)

**Catalogue CLI**
59. [Catalogue Prepare — Workbook Extraction](#catalogue-prepare--workbook-extraction)
60. [Catalogue Prepare — Supplier Enrichment + Workbook Fallback](#catalogue-prepare--supplier-enrichment--workbook-fallback)
61. [Catalogue Verify + Import Dry Run](#catalogue-verify--import-dry-run)
62. [Catalogue Apply — Storage Staging](#catalogue-apply--storage-staging)
63. [Catalogue Apply — Transactional Replacement](#catalogue-apply--transactional-replacement)
64. [Catalogue Apply — Rollback + Object Cleanup](#catalogue-apply--rollback--object-cleanup)

**Cross-cutting**
65. [Storefront Revalidation After a Product Mutation](#storefront-revalidation-after-a-product-mutation)
66. [Unauthorized / Forbidden Denial Paths](#unauthorized--forbidden-denial-paths)
67. [Transaction Rollback on Mid-Write Failure](#transaction-rollback-on-mid-write-failure)

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
already signed in + path === /login? ──yes──▶ owner -> /admin; else -> /
  │no
  ▼
pass through to the matched page
```

Failure/edge behavior: an `/api/**` path never gets a redirect — it fails
with a JSON `401`, because a `fetch`/`curl` caller following a redirect would
otherwise see a `200` HTML login page instead of a clear failure. Protected
prefixes are a **denylist** (`/admin`, `/api/admin`, `/api/uploads`) — the
inverse of an allowlist — because this shop's storefront is public-by-default.
`/checkout` and `/track` were removed from this list when guest checkout
shipped: neither needs a session anymore, so both fall straight through to
"pass through to the matched page" like any other public storefront route
(see the Checkout + Order Creation and Public Preorder Tracking flows below).

## Login

`POST` via the `login` Server Action (`src/app/[locale]/(auth)/login/actions.ts`),
called from `LoginForm`. Triggered by submitting the sign-in form on `/login`.

```
┌────────┐ email/phone+password ┌──────────────┐ safeParse  ┌────────────┐
│ Browser│ ────────────────▶ │ login() action│ ───────────▶ │ loginSchema│
└────────┘                   └──────┬────────┘              └────────────┘
                                     │ signIn("credentials", {redirect:false})
                                     ▼
                          ┌────────────────────────┐
                          │ Auth.js authorize()      │
                          │ SELECT users WHERE         │
                          │ email OR normalized phone  │
                          │ bcrypt.compare(pw, hash   │
                          │   OR dummy hash)          │
                          └──────┬────────────────────┘
                                 │ user + valid?
                     ┌───yes─────┴─────no───┐
                     ▼                      ▼
              JWT session issued      AuthError thrown
                     │                      │
                     ▼                      ▼
        { ok: true, role }         { ok:false, error:"invalid" }
                     │                      │
                     ▼                      ▼
      safe return redirect: originating storefront page,
      cart, or customer checkout/account flow;
      otherwise role home         toast: invalidCredentials
```

Failure: **every** failure mode — malformed input, unknown email/phone, wrong
password — collapses to the same `{ ok: false, error: "invalid" }` and the
same generic UI message. This is deliberate, not an oversight: revealing
*which* part failed would let a caller enumerate registered accounts. The
constant-time defense is in `authorize()` itself — when no user row matches,
`bcrypt.compare()` still runs against a fixed dummy hash of the same cost
factor, so a "no such account" rejection and a "wrong password" rejection
cost the same wall-clock time.

The proxy adds a locale-prefixed `redirect` query when an anonymous caller
hits a protected `/admin` route. `loginDestination()` accepts only known paths
under the current locale, then applies role checks: storefront/cart returns
are shared by anyone, and resuming `/admin` requires `owner`. There is no
`customer` role or checkout/account redirect branch anymore — guest checkout
needs no sign-in at all, so `/login` only ever exists to get an owner/staff
account into `/admin`. External, cross-locale, and role-forbidden values fall
back to the role's normal landing page (`/admin` for an owner, the storefront
root otherwise).

## Session — JWT Callbacks

Runs on every authenticated request as part of Auth.js resolving `auth()`
(used directly by `getCurrentUser()`, by the client `SessionProvider`, and
internally by the proxy's `req.auth`). Normal reads do not query the database;
`LoginForm`'s `useSession().update()` right after sign-in is the one trigger
that forces a fresh database read (see the Login flow above).

```
Request with session cookie
        │
        ▼
Auth.js decodes JWT
        │
        ▼
jwt() callback: user present (sign-in only)? ──yes──▶ token.id/token.role = user.id/user.role
        │no
        ▼
trigger === update? ──yes──▶ SELECT user by token.id -> refresh name/email/role
        │no (normal request)
        ▼
session() callback: session.user.id/name/email/role = token fields
        │
        ▼
req.auth / getCurrentUser() resolves { id, email, name, role }
```

Failure: an invalid/expired/tampered JWT decodes to no session — every
downstream check (`req.auth`, `getCurrentUser()`) sees `null`/`undefined`
and the request is treated as anonymous, falling into the proxy's
unauthenticated branch.

## Sign Out

`SignOutButton` calls the Auth.js client `signOut()` helper from the admin
header's `UserMenu` — the only surface it's used from now that the storefront
has no account menu (guest checkout; see `CLAUDE.md`).

```
┌────────┐ click logout  ┌──────────────────────┐ POST    ┌──────────────┐
│ Browser│ ────────────▶ │ next-auth/react       │ ──────▶ │ Auth.js clears│
└────────┘               │ signOut(redirectTo)   │         │ session cookie│
                         └──────────┬────────────┘         └──────┬───────┘
                                    │ session broadcast            │
                                    ▼                              ▼
                         SessionProvider -> anonymous    window.location = /<locale>
```

Failure: a failed sign-out request leaves the user on the current page and
re-enables the control. A successful request broadcasts the anonymous session
state before a hard navigation to the locale-correct home, preventing stale
header state in the persistent layout.

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
              (newest 6) + getPublicCharacters + shop contacts
              via db/queries/storefront.ts
              (PUBLIC_PRODUCT_COLUMNS only)
                          │
                          ▼
                cache updated, served
```

The character facet feeds two link-only sections — `QuickFilterRail` (chips
above the "New in" grid) and `CollectionStrip` (promo cards). Both are
Server Components rendering plain `<Link>`s to `/shop?character=<slug>`;
neither ships filter state to the client, which is what keeps `/` in the
SSG column of `next build` rather than falling to dynamic (`ƒ`).

Character is the storefront's only *taxonomy* filter (`ShopFilters` adds
colour, size, and price, but those are variant/price attributes, not a
catalogue grouping). Product type is deliberately not offered: it is an
admin-facing attribute and `GET /api/products` exposes no `type` parameter
for a link to point at. Both sections therefore render `null` when no active
product has a character assigned, since every link would lead to an empty
result — an empty home page below the hero means the character taxonomy is
unpopulated, not that the code regressed.

Failure: product/character reads are wrapped in try/catch — a database error during
prerender (e.g. a database-less CI build) falls back to an empty result
instead of failing the build; a live database error at revalidation time
means the previously-cached page keeps serving until the next successful
revalidation.

## About — ISR Render

`GET /about`, `src/app/[locale]/(shop)/about/page.tsx`. Brand copy is static;
the contact CTA reads the owner-managed shop contacts.

```
┌────────┐  GET /<locale>/about   ┌─────────────────────┐
│ Browser│ ─────────────────────▶ │ prerendered HTML (ISR)│
└────────┘                        └──────────────────────┘
```

Failure: during a database-less production build, missing shop settings fall
back to no contact CTA. At runtime a database failure propagates.

## Catalogue — SSR + Client Hydration (`/shop`)

`GET /shop`, `src/app/[locale]/(shop)/shop/page.tsx` + `ShopBrowser` client
component. The server render exists for two reasons: a crawlable page-1 grid
for SEO, and an `initialData` seed so the client doesn't refetch on load.

```
┌────────┐ GET /<locale>/shop  ┌───────────────────┐
│ Browser│ ──────────────────▶ │ Server render (ISR) │
└────────┘                     │ getPublicProducts    │
                                │ getPublicCharacters   │
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
                                           │
                                           ▼
                                 ProductGrid: 2 columns on mobile,
                                 3 on large, 4 on extra-large screens
```

`ShopBrowser` seeds its filter state from the query string on mount, so a
`/shop?character=…` link — the home page's `QuickFilterRail` chips and
`CollectionStrip` cards are exactly this — lands with that character filter
already applied and reflected in the filter rail.

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

## Size Selection / Preorder

Client interaction inside `ProductDetail` → `SizeSelector`, on `/shop/[code]`.

```
┌────────┐ click size chip  ┌──────────────────┐
│ Browser│ ────────────────▶│ SizeSelector state │
└────────┘                  └──────────┬──────────┘
                                        ▼
                          matching (colour, size) variant exists?
                                  │yes                 │no
                                  ▼                    ▼
                          selection recorded      add-to-cart prompts
                          (stock is ignored for   for a valid selection
                           preorder products)
```

Failure: an add-to-cart attempt without a required variant selection is
rejected in the client. Exact stock depth and sold-out state are admin-only;
all active configured variants remain available for preorder.

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
                      10 KPI cards:
                      total / ready / sold-out SKUs, orders, revenue,
                      gross profit, advertising / shipping / packaging,
                      net profit
                                        │
                                        ▼
                      Recharts: monthly total cost vs net profit
                      + product-type distribution (no stock-level chart)
                                        │
                                        ▼
                      alerts: no photo / price / variants / all sold out
```

Failure: this route never runs at prerender time (it's gated dynamic), so
there is no build-time fallback path like the public pages have — a
database error here surfaces as a normal Next.js error boundary/500, since
the owner is already authenticated and expects live data.

Cancelled orders are excluded. Gross profit is item revenue minus item cost;
net profit additionally subtracts shipping, packaging, and advertising. A SKU
is one variant row: quantity above zero is ready to ship, and zero is sold out.

## Product Browse

`GET /admin/products`, `ProductBrowser` client component + `GET
/api/admin/products`. The card/table view toggle sits with the page actions;
search, status, type, sort, and the table-only column chooser occupy one
horizontal, URL-synced filter strip.

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

Railway Bucket CORS must allow `PUT` with `Content-Type` from both the deployed
origin and `http://localhost:3000`. A missing policy fails only the browser-to-
bucket step; the admin page and presign request can still succeed, which makes
this look like an Add Product form failure unless the browser upload is checked.

## Create Product

`createProduct` Server Action, `src/app/[locale]/admin/products/actions.ts`.
Triggered by submitting `ProductForm` in create mode.

```
┌────────┐ submit form  ┌───────────────────┐
│ Owner  │ ────────────▶│ createProduct()     │
└────────┘               └──────┬───────────────┘
                                 │ auth -> isOwner -> zod parse
                                 │ (empty code preview is allowed; image URL
                                 │  must exactly match its validated key)
                                 ▼
                      db.transaction(async tx => {
                        nextProductCodeIn(tx, type)   <- code is MINTED here;
                          -> "TS-003"                     v.productCode (the
                                                          form's preview) is
                                                          ignored outright
                        insert products (+ admin-only preorder day range)
                        insert productCharacters[] (many-to-many links)
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
Client validation failures also show an error toast; the submit can no longer
stop silently because an asynchronous, disabled code-preview input is empty.

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
                                update products (including preorder day range)
                                replace productCharacters links
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
                                db.update(products).set({...preorder day range})
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
Search, date range, status, and sort occupy one horizontal filter strip.

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
                    generatePreorderCode()  (see the guest-checkout
                       │                     Preorder Code Generation flow —
                       │                     an owner-typed phone order gets
                       │                     the same trackable /track/[code]
                       │                     URL a guest checkout would)
                       ▼
                             txDb().transaction(async tx => {
                               insert orders (preorderCode, shipping/packing/
                                 advertising/status/note)
                               insert orderItems[] (snapshotted product
                                 fields: code/name/type/color/size/cost/price)
                             })
                                            │
                             23505 on preorderCode unique index? ──yes──▶
                             retry with a NEW code, WHOLE tx again (bounded
                             at 3 attempts — a unique-violation aborts the
                             transaction, so a retry can't reuse the same tx)
                                            │no
                                            ▼
                                     [Postgres AFTER INSERT trigger fires
                                      on order_items -> recalc_order(order_id)
                                      -> orders.items_total/items_cost updated
                                      -> GENERATED columns recompute:
                                         totalCost = itemsCost + shipping
                                           + packing + advertising
                                         profit = itemsTotal - totalCost]
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
                            update orders (shipping/packing/advertising,
                              shipping confirmation, refund fields, status)
                            validate submitted item ids belong to this order
                            delete only removed item ids
                            update existing item ids in place
                            insert only new item rows
                          })
                                        │
                              [recalc_order trigger fires again on both
                               the deletes and the inserts, leaving
                               items_total/items_cost correct either way]
                                        │
                                        ▼
                              revalidateOrders(id)
```

Failure: a forged line-item id that belongs to another order is rejected.
Preserving existing ids also preserves each line's independently managed
preorder/refund history. Any mid-write failure rolls back the whole edit.

## Quick Order Status Change

`setOrderStatus` Server Action, triggered from the inline status dropdown in
`OrderList` (and also available on the order detail page).

```
┌────────┐ pick new status  ┌───────────────────────┐
│ Owner  │ ─────────────────▶│ setOrderStatus(id,status)│
└────────┘                   └──────────┬───────────────┘
                                        │ auth -> isOwner -> enum parse
                                        ▼
                              target packaging? -> verify every item is
                                received or refunded
                              target refund? -> require refund reason
                              db.update(orders).set({status, refund metadata})
                              (single statement)
                                        │
                                        ▼
                              revalidateOrders(id)
```

Failure: an invalid status fails before a write; `packaging` returns
`items_pending` until every line is resolved; `refund` returns
`reason_required` without a reason; a missing id returns `not_found`.

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
Advertising cost is internal accounting data and is deliberately omitted from
the customer-facing receipt; it remains visible in the admin form and reports.

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
                                                             + summary cards; monthly/
                                                             annual include each order's
                                                             advertising cost
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

Advertising is order-level rather than line-level, so it appears in monthly
and annual summaries, tables, Excel exports, and net profit. It is not
arbitrarily allocated across products in the profit-by-product tab.

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
from the Danger zone panel (`components/settings/data-tools.tsx`) — the panel
that collects every irreversible tool, alongside the character Restore/Reset
buttons below. Empties the shop; there is no demo-loader sibling action.

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
that triggered the wipe), `product_types` (reference data, re-seeded by
`npm run db:seed`, referenced by name from products) and `characters`
(reference data too — `product_characters` rows cascade away with their
product, but the taxonomy itself survives and is re-seeded/reset by
`npm run db:seed:characters`).

Failure: a failed check returns `unauthorized`/`forbidden`/`confirm_mismatch`
and deletes nothing; a mid-transaction error rolls the whole delete back and
returns `clear_failed` with every row still present. A failed object delete
is logged and ignored — an orphaned object costs storage, a half-committed
wipe costs correctness. **There is no undo**: recovery means a Railway
Postgres restore, and the deleted objects are gone.

## Users — List + Filter

`/admin/users` render + `GET /api/admin/users`. The owner's view of every
account that can sign in.

```
┌────────┐  /admin/users  ┌──────────────┐  requireOwner()  ┌───────────┐
│ Owner  │ ──────────────▶│ admin/layout │ ────────────────▶│ users/page│
└────────┘                └──────────────┘                  └─────┬─────┘
                                                                  │ passes ONLY
                                                                  │ currentUserId
                                                                  ▼
                                                            ┌───────────┐
                                                            │ UserList  │
                                                            │ (client)  │
                                                            └─────┬─────┘
                                     debounced search / role /    │
                                     verified / sort / page       │
                                                                  ▼
                                              GET /api/admin/users?...
                                                                  │
                                            auth -> isOwner -> listUsers()
                                                                  │
                                              select ADMIN_USER_COLUMNS
                                              (owner/staff accounts only —
                                               no `customer` role exists)
                                                                  │
                                                                  ▼
                                                     { rows, count, page }
```

The page passes **only** `currentUserId` to the client, never a user row —
the rows arrive over the JSON route, whose select list is
`ADMIN_USER_COLUMNS`. `passwordHash` is therefore never selected on this
path and cannot reach an RSC payload. Filtering and paging happen in SQL;
an in-memory filter over a capped fetch would silently truncate as the
account list grows. Every sort breaks ties on `users.id` so pages don't
drop or repeat rows. There is no orders column or orders-sort option
anymore — `orders` carries no account reference at all as of guest
checkout, so there is no per-account order count to show.

Failure: unauthenticated → `401` JSON (never a redirect — see the proxy
bootstrap flow); authenticated non-owner → `403`; query error → `500` and
the client renders its empty state.

## Users — Change Role

`setUserRole` Server Action, from the row menu's role dialog.

```
┌────────┐ pick role  ┌──────────────────────┐
│ Owner  │ ──────────▶│ setUserRole(id, role)│
└────────┘            └──────────┬───────────┘
                                 │ auth -> isOwner -> zod(uuid, enum)
                                 ▼
                        id === actor.id ? ──yes──▶ self_role_change
                                 │no
                                 ▼
                      target.role === "owner"
                      && newRole !== "owner" ?
                                 │yes
                                 ▼
                      countOtherOwners(id) === 0 ? ──yes──▶ last_owner
                                 │no
                                 ▼
                      db.update(users).set({ role })
                      revalidateUsers()
```

This is the only **in-app** path that can mint an `owner` — there is no
public registration at all (guest checkout needs no account; see
`CLAUDE.md`), and `scripts/create-owner.ts` needs shell access. Both
refusals are enforced **in the action**, not just by a hidden menu item: a
direct action invocation fails identically.

Failure: unknown id → `not_found`; a no-op role change returns `ok` without
a write; a write error → `update_failed`.

## Users — Delete Account

`deleteUser` Server Action, from the row menu's confirm dialog.

```
┌────────┐ confirm  ┌────────────────┐
│ Owner  │ ────────▶│ deleteUser(id) │
└────────┘          └───────┬────────┘
                            │ auth -> isOwner -> zod(uuid)
                            ▼
                   id === actor.id ? ──yes──▶ self_delete
                            │no
                            ▼
                   owner && countOtherOwners === 0 ? ──yes──▶ last_owner
                            │no
                            ▼
                   db.transaction:
                     delete authTokens where userId   (kills pending links)
                     delete users where id
                            │
                            ▼
                   orders.created_by ──▶ NULL   (FK ON DELETE SET NULL,
                                          only for orders THIS account typed
                                          in by hand — a guest order never
                                          referenced any account at all)
                   revalidateUsers()
```

**Order history survives — trivially now.** Guest checkout stores no account
reference on an order at all (see `CLAUDE.md`'s guest-checkout invariant), so
deleting an owner/staff account has nothing to unlink there. The only FK is
`orders.createdBy` (an admin-created order's author), which is `ON DELETE SET
NULL`; every order's customer name/phone/address and every product field were
already snapshotted at order time regardless. Reports — which group on
`orderItems.productCode`, never a live FK — are unaffected either way.

Failure: unknown id → `not_found`; a mid-transaction error rolls back both
deletes, leaving the account and its tokens intact.

## Users — Mark Email Verified

`verifyUserEmail` Server Action, offered only on rows whose
`emailVerifiedAt` is null.

```
┌────────┐  ┌─────────────────────┐
│ Owner  │ ▶│ verifyUserEmail(id) │
└────────┘  └──────────┬──────────┘
                       │ auth -> isOwner -> zod(uuid)
                       ▼
             already verified ? ──yes──▶ ok (no write)
                       │no
                       ▼
             db.transaction:
               update users set emailVerifiedAt = now()
               delete authTokens where userId
             revalidateUsers()
```

**Cosmetic as of guest checkout.** `authorize()` in `src/auth.ts` no longer
gates sign-in on `emailVerifiedAt` at all — that gate only ever existed for
the now-removed `customer` role, which could self-register without proving
an email. An owner/staff account signs in whether or not this is set. This
action is kept because it still has a real effect (dropping any outstanding
verify token) and removing it outright would be more churn than value; its
continued existence is not evidence that a login gate on this column still
exists.

Failure: unknown id → `not_found`; write error → `update_failed` and the
transaction rolls back, so the token is not deleted without the flag being
set.

## Users — Send Password Reset

`sendUserPasswordReset` Server Action, offered only when `EMAIL_ENABLED`.

```
┌────────┐  ┌────────────────────────────────┐
│ Owner  │ ▶│ sendUserPasswordReset(id, loc) │
└────────┘  └───────────────┬────────────────┘
                            │ auth -> isOwner
                            ▼
                  emailEnabled() ? ──no──▶ email_disabled
                            │yes
                            ▼
                  zod(uuid, locale enum) -> load target
                            ▼
                  sendTokenEmail(user, locale, "reset")
                    │  issueAuthToken(reset_password, 1h)
                    │    └─ token issued < 60s ago ? ──▶ cooldown
                    │  Resend ──▶ /<locale>/reset-password?token=...
                    ▼
                  ok   (no revalidate — nothing on screen changed)
```

Reuses the **same** `sendTokenEmail` helper (`src/lib/account-email.ts`)
`/forgot-password` uses, so token lifetime, single-use semantics, and the
one-per-minute cooldown are identical rather than a second implementation
that can drift. The owner never sees or sets the new password — this issues
exactly the link the account holder would have requested themselves.

Failure: no delivery channel → `email_disabled` (stated, never silently
skipped); too soon after a previous link → `cooldown`; a Resend error →
`email_failed`, logged server-side.

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

For a local database whose catalogue rows exist but whose MinIO volume is
empty, `npm run catalog:repair-images` re-renders the reviewed source images
to the existing database keys. It writes objects only and never changes
products, variants, images, or orders.

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

**`/checkout` and `/track/**` are deliberately absent from this diagram.**
`src/proxy.ts`'s `PROTECTED_PREFIXES` is now exactly `["/admin", "/api/admin",
"/api/uploads"]` — checkout and order tracking need no session at all (guest
checkout; see `CLAUDE.md`), so there is no "unauthenticated" branch for them
to fall into. Their security instead rests on possession of a random,
unguessable `preorderCode` rather than a session — see the Preorder Code
Generation and Public Preorder Tracking flows below.

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
On laptop/desktop breakpoints, the 4:5 gallery width is clamped from the
viewport height (360–560px wide). This keeps the main photo and thumbnail rail
inside a typical laptop viewport; mobile retains the full-width gallery.

## Password Reset

Owner/staff-only now — there is no public registration and no customer email
verification (both were removed with the `customer` role; see `CLAUDE.md`).
`/forgot-password` issues a one-hour token and `/reset-password?token=...`
consumes it.

```
Email form -> generic response -> known account? -> hashed reset token -> Resend
Reset link -> validate token/expiry -> bcrypt new password
                                      -> delete every token for that user
```

Failure: reset requests never reveal whether an email exists. Invalid or
expired tokens do not update the password. The entire feature is disabled in
UI and server actions while `EMAIL_ENABLED=false`. `verifyUserEmail`
(`admin/users/actions.ts`) is a separate, owner-only escape hatch covered
under Users — Mark Email Verified below; it is now cosmetic (no login gate
reads `emailVerifiedAt` anymore) but still has a real effect.

## Local Cart

The product detail add-to-cart action and `/cart` use `CartProvider`; cart data
is device-local and contains public snapshot fields only.

```
Product detail -> choose colour/size + quantity -> addItem()
                                                   |
                                                   v
                                    React cart state <-> localStorage
                                                   |
                                  header count + /cart edit/remove/subtotal
```

Failure: malformed stored JSON is discarded. Quantity is clamped to `1..99`.
The server does not trust cart prices or product availability at checkout.
There is deliberately no server-side "my orders in this browser" list backing
the cart or a post-checkout view — see Public Preorder Tracking below for why
a preorder code, not a browser-scoped list, is the durable link back to an
order.

## Checkout + Order Creation

`/checkout` requires **no session at all** — guest checkout removed the
account wall entirely (see `CLAUDE.md`'s security model). `submitCheckout`
creates the durable order from the form's own fields plus the local cart; no
online payment or stock decrement occurs, and nothing here advances the order
past `new` — the owner accepts it by hand later (see the Orders List /
Quick Order Status Change flows).

```
Guest -> fill first/last name, phone, address, note + local cart -> checkoutSchema
                              |
              LINE/Instagram/Facebook configured?
                              | no -> contact_missing
                              v
     reload active products + variants; compare ids and current prices
                         | changed -> cart_changed
                         v
     idempotency check: SELECT orders WHERE checkout_key = key
                         | found (retry of a completed checkout) -> return it
                         v (not found)
     generate a random preorder code (see Preorder Code Generation below)
                         |
                         v
 transaction: INSERT order(status=new, preorderCode, checkoutKey)
              INSERT snapshot line items(status=default configured status)
                         |
              23505 on preorderCode unique index? --yes--> retry with a NEW
                         |                                  code, whole tx
                         no                                 (bounded, 3x)
                         v
         Postgres total trigger -> generated order number (never shown to
                         |            the customer — see Preorder Code
                         v            Generation) -> clear local cart
         redirect to /track/<preorderCode>?new=1
```

Failure: `checkoutKey` makes retries idempotent — global uniqueness now, not
scoped to an account, since there is no account to scope it to. A
missing/inactive product, invalid variant, or changed price rejects the
entire checkout (`cart_changed`). Shipping stays unconfirmed and excluded
from the customer total until the owner confirms it. `admin/orders/
actions.ts#createOrder` mints a `preorderCode` through the identical
generate-and-retry loop, so an order the owner types in by hand from a phone
call is trackable at the same URL.

## Preorder Code Generation

Pure, synchronous, client-safe — `src/lib/preorder-code.ts` has no `db`
import and no `server-only`, unlike `src/lib/product-code.ts`'s sequential
codes (which must read `max + 1` from the database). A preorder code needs
no database read at all: it is `crypto.getRandomValues` mapped onto a
32-character alphabet, called from both `submitCheckout` and
`admin/orders/actions.ts#createOrder`.

```
generatePreorderCode()
        │
        ▼
crypto.getRandomValues(Uint8Array(10))
        │
        ▼
each byte & 31 -> index into "23456789ABCDEFGHJKLMNPQRSTUVWXYZ" (32 chars,
        │          excludes 0/1/I/O; byte&31 is exactly uniform over 32
        │          buckets since 256 is a multiple of 32 — no rejection
        │          sampling, no modulo bias)
        ▼
"PO-" + 10 characters = 50 bits of entropy (~1.13e15 possible codes)
        │
        ▼
caller INSERTs it; on a 23505 against orders_preorder_code_unique,
the WHOLE db.transaction(...) is retried with a fresh code (bounded at 3
attempts) — a unique-violation aborts the transaction outright, so a
retry cannot reuse the same `tx`
```

`normalizePreorderCode(input)` is the client-safe inverse: uppercases,
strips whitespace/dashes, re-adds a missing `PO-` prefix, then validates
against the exact alphabet and length — used both by the `/track` lookup
form (before any server round trip) and internally by the track page itself.

Failure: a `23505` on any other constraint (e.g. the idempotency check
racing itself) is not retried here — see the Checkout + Order Creation flow
above for that separate path. Exhausting all 3 preorder-code attempts (astronomically unlikely at 50 bits of
entropy) returns a generic `failed` result rather than looping forever.

## Preorder-Code Contact Handoff

`/track/[code]` (both the post-checkout `?new=1` view and a return visit)
renders a "contact the shop" button that opens a prefilled LINE chat.

```
Track page -> lineMessageUrl(settings, t("lineMessage", {code}))
                (built SERVER-SIDE so the message matches the request's
                 locale segment)
                              |
                              v
        https://line.me/R/oaMessage/<percent-encoded lineId>/?<percent-encoded text>
                              |
              ContactAdminButton: real <a target="_blank"> (NOT a click
              handler that awaits the clipboard then calls window.open —
              that would consume the click's user-gesture token and get the
              popup blocked)
                              |
              onClick fire-and-forget: navigator.clipboard?.writeText(code)
                              |
                              v
              LINE opens with the message prefilled (mobile) — or, on
              LINE for PC (prefill unsupported there), the code is already
              in the clipboard to paste
                              |
                              v
                    customer sends -> owner accepts order
```

Failure: `navigator.clipboard` is guarded (`?.`) since it is `undefined`
outside a secure context (plain HTTP); the copy failing never blocks or
delays the LINE navigation. If no LINE ID is configured, the button degrades
to Instagram/Facebook links only (`links.instagramUrl`/`links.facebookUrl`
from `contactLinks()`) with the large, always-visible `PreorderCodeCopy`
control as the fallback contact method — `submitCheckout` already refused to
create the order at all if none of LINE/Instagram/Facebook were configured
(see Checkout + Order Creation), so a successfully created order always has
at least one handoff path.

## Public Preorder Tracking

`/track/[code]` — **no session, no `customerId` scope, reachable by anyone
who has or guesses the code.** This is the one page in the app where "who is
allowed to read this order" is decided entirely by possession of a random
string rather than a session, which is exactly why
`src/db/queries/track.ts`'s column discipline matters as much as
`PUBLIC_PRODUCT_COLUMNS` does for the storefront (see
`docs/api-overview.md`'s `PUBLIC_ORDER_COLUMNS` section).

```
GET /[locale]/track/[code]  (dynamic = "force-dynamic" — see below)
                │
                ▼
normalizePreorderCode(code) -> null (malformed)? ──yes──▶ notFound()
                │ well-shaped
                ▼
getOrderByPreorderCode(code): SELECT PUBLIC_ORDER_COLUMNS
                              WHERE preorder_code = code
                │ not found? ──yes──▶ notFound()  (SAME 404 as malformed —
                │                      never let the response shape tell an
                │                      attacker which failure mode they hit)
                │ found
                ▼
SELECT PUBLIC_ORDER_ITEM_COLUMNS WHERE order_id = <internal id,
                                       stripped before the function returns>
                │
                ▼
internal status mapped to customer stage (customerStageFor)
 new -> Received; accepted/preorder/packaging -> Preparing
 shipping -> Shipping; complete -> Complete
 cancelled -> Cancelled; refund -> Refunded
                │
                ▼
isActiveStage(stage)?
  ├─ yes (received/preparing/shipping/complete) ──▶ render StatusStepper
  │      (4-step horizontal indicator) + a highlighted current-stage card
  │      (title/body copy per stage); on "preparing" ONLY, the card also
  │      shows estimatedLeadTime(items) — "slowest item wins": the max of
  │      each item's snapshotted preorderMinDays/preorderMaxDays, or no
  │      estimate line at all if no item in the order carries one
  └─ no (cancelled/refunded) ──▶ render CustomerStatusBadge alone + a short
         explanation line — never the stepper (these are exceptions
         outside the normal progression, see order-status-badge.tsx)
                │
                ▼
render: success banner (if ?new=1) + header (order label + code + date) +
        contact-admin handoff (LINE only — see below) + status section
        (badge + stepper/explanation, above) + a 2-row-max OrderTimeline
        (order-placed date always; the current stage's label + updatedAt
        ONLY once the order has moved past "received" — there is no
        order_status_history table, so no other row is ever fabricated) +
        items + totals (shipping/grand total only once shippingConfirmedAt
        is set) + delivery info + note
```

Contact handoff is **LINE only** on this page — `ContactAdminButton` — even
though the shop may also have Instagram/Facebook configured (those still
appear on `contact-cta.tsx`/`site-footer.tsx` elsewhere; this route was
narrowed deliberately so the tracking page has one unambiguous path back to
a human, not three).

Lead-time (`preorderMinDays`/`preorderMaxDays`) is a SNAPSHOT, copied from
`products` onto each `orderItems` row at insert time in both `submitCheckout`
(guest checkout) and the admin `createOrder`/`updateOrder` line-item builder
— the same principle as the `productCost`/`sellPrice` snapshot already
documented under Checkout + Order Creation, so a later edit to a product's
preorder window never rewrites an already-placed order's estimate. See
`src/lib/order-status.ts#estimatedLeadTime` and `#isActiveStage`.

**`export const dynamic = "force-dynamic"` is the single most important
line in this route.** `src/app/[locale]/(shop)/layout.tsx` sets
`export const revalidate = 300` as a floor for the whole storefront
subtree — without the override, order status here would be up to 5 minutes
stale, defeating the only reason this page exists. The production build
must show `ƒ` for `/[locale]/track/[code]`, not `●`.

Failure: a malformed code and an unknown-but-well-shaped code return the
identical 404 (see above). Never present: `orders.orderNo` (a sequential,
enumerable identity — printing it here would let anyone page through every
order by incrementing a number, exactly what the random `preorderCode`
exists to prevent), `itemsCost`/`totalCost`/`profit`/`advertisingCost`/
`packingCost`/`productCost`/`lineCost`, `checkoutKey`, `createdBy`,
`refundReason`, `refundedAt`. `docs/health-check.md` carries the standing
curl-based leak test (check 6) for this route.

## Preorder Code Lookup

`/track` (no `[code]` segment) — a static, crawlable entry point for a
customer who has lost the URL but still has the code from their LINE chat.

```
GET /[locale]/track  (static — generateStaticParams + setRequestLocale,
                       revalidate = 300 like any other storefront page)
                │
                ▼
render lookup form
                │
                ▼
TrackLookupForm (client): on submit, normalizePreorderCode(input)
                │
        null (garbage)? ──yes──▶ inline "invalid code" error, NO request sent
                │ well-shaped
                ▼
        router.push(`/track/${code}`)  -- the ONLY place that actually
                                           checks whether an order exists
```

Failure: garbage input never leaves the browser — `normalizePreorderCode`
rejects it client-side before any navigation. `robots.ts` disallows
`/*/track/` (trailing slash, so it blocks every `/th/track/<code>` detail
page without touching this plain `/th/track` form, which stays crawlable
and is listed in `sitemap.ts`).

## Line-Item Fulfillment + Partial Refund

On `/admin/orders/[id]`, `OrderFulfillment` changes each order item's private
status independently through `setOrderItemStatus`.

```
Owner -> choose item status -> owner check -> active definition lookup
                                      |
                         refunded status? -> require reason + timestamp
                                      |
                                      v
                         UPDATE only that order_items row
                                      |
             all lines received/refunded? -> show "ready for packaging"
                                      |
                               owner confirms packaging
```

Failure: inactive/unknown statuses, forged item/order pairs, and refund without
a reason are rejected. A partial refund leaves the order active while the
remaining lines continue through preorder fulfillment.

## Full Order Refund

An owner can select the fixed `refund` order status, or the system moves there
when every line item is changed to a status marked `isRefunded`.

```
Order refund selection -> reason required -> status=refund
                                          -> refund_reason + refunded_at

Last non-refunded line -> refunded -> all line definitions isRefunded?
                                      | yes -> order status=refund + timestamp
```

Failure: this is an operational record only; no payment provider is called.
Missing reasons are rejected, and the customer sees only the exceptional
`Refunded` order stage—not private supplier/item workflow details. Fully
refunded orders are excluded from dashboard/report revenue and profit.

## Settings — Shop Contacts

The owner saves LINE ID, Instagram handle, and an HTTPS Facebook page URL in the singleton
`shop_settings` row.

```
Owner -> Settings form -> validate + normalize -> UPSERT shop_settings(default)
                                              -> revalidate storefront/settings
                                              -> footer/CTA/checkout use links
```

Failure: empty values are allowed for maintenance, but checkout remains
disabled until at least one contact is configured. Facebook links are accepted
only for `facebook.com` or `fb.com` (including their subdomains), preventing an
owner typo from rendering an unsafe or lookalike URL.

## Settings — Brand

The owner sets the brand name, a TH/EN description, and a logo in the same
singleton `shop_settings` row as shop contacts. Every reader falls back to the
`src/lib/brand.ts` placeholder constants when a field is null, so an
unconfigured shop never renders blank copy.

```
Owner picks logo file -> resizeBrandLogo() (browser, 3 widths: 128/256/512)
                       -> POST /api/uploads/presign-logo -> signed PUT URLs
                       -> browser PUTs each rendition to object storage
Owner clicks Save -> saveBrandSettings(name, descTh, descEn, logoUrl, logoKey)
                   -> validate + isBrandLogoKey() re-check -> UPSERT shop_settings(default)
                   -> delete old logo renditions from storage (best-effort, if replaced/removed)
                   -> revalidate storefront/settings/about
                   -> header/footer/home/about read via resolvedBrandName()/resolvedBrandDescription()
```

Failure: an upload that fails presign or PUT leaves the previous logo
untouched (the form only swaps `logoUrl`/`logoStorageKey` after a successful
upload); a save with an invalid `logoStorageKey` (anything not matching
`brand/logo-<timestamp>-(128|256|512).webp`) is rejected before it reaches the
database, mirroring the product-image key defense in `POST
/api/uploads/presign`.

Character create/update/delete actions maintain the many-to-many taxonomy used
instead of product type on customer pages.

```
Owner -> create character -> slug + sort order -> INSERT characters
Owner -> product form -> character ids -> replace product_characters links
Owner -> delete character -> links exist? --yes--> in_use
                                      | no -> DELETE
```

Failure: duplicate names/slugs and invalid ids are rejected. Product types stay
available in admin only; public collection/filter/detail/card queries select
characters through the join table.

### Restore / Reset defaults

`restoreDefaultCharacters(reset)` re-applies the canonical list in
`src/lib/character-seed.ts` — the same list and the same code path as
`npm run db:seed:characters`, so the button and the CLI can never drift. Both
buttons live in the **Danger zone** panel (`components/settings/data-tools.tsx`)
next to `clearShopData`, not in the Characters editor above it: they rewrite
the taxonomy wholesale rather than edit one row.

```
Owner -> Restore defaults ──▶ upsert every canonical character (by name)
                              nameEn + sortOrder refreshed, slug left alone
                              (it is already live in /shop?character= URLs)
                                         │
Owner -> Reset to defaults ──▶ upsert, then for each NON-canonical character:
                                         │
                              product_characters link exists?
                                         │
                    ┌──── yes ───────────┴────────── no ────┐
                    ▼                                        ▼
        kept + reported in `skipped`                    DELETE character
        (FK is ON DELETE RESTRICT)                             │
                    └───────────────┬───────────────────────────┘
                                    ▼
                          revalidateSettings()
```

Everything above runs in ONE transaction — a half-applied reset is never left
behind. The CLI's `--force` (which deletes the `product_characters` links
first) is deliberately **not** exposed on the button: a click must never
silently detach a character from live products. Failure: a non-owner gets
`forbidden`, a database error rolls the whole thing back and returns
`seed_failed` with the list untouched.

## Settings — Order Status Labels

Admin and customer status keys are fixed while their Thai/English labels are
editable.

```
Owner -> choose fixed key + TH/EN labels -> enum validation
                                           |
                                           v
                              UPSERT admin/customer label row
                                           |
                              admin list/form or customer tracking renders it
```

Failure: unknown keys and blank labels are rejected. Fixed keys preserve the
workflow and the internal-to-customer mapping even when display text changes.

## Settings — Line-Item Status Lifecycle

The owner creates supplier-specific item statuses, chooses one default, and
marks terminal received/refunded semantics.

```
Owner -> create/edit status(code, labels, active, received, refunded)
                    |
                    +-> choose default -> transaction clears old + sets new
                    |
                    +-> delete -> default or referenced? --yes--> blocked
                                                       | no -> DELETE
```

Failure: only lowercase code keys are accepted; one partial unique index
enforces a single default. Referenced statuses cannot be deleted, and inactive
statuses remain visible on existing lines but cannot be newly selected.
