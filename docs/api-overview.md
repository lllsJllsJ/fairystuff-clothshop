# API Overview

This service exposes a small set of JSON routes under `src/app/api/**`, plus
the Auth.js credentials/session handlers. Everything else in the app —
product/order/settings mutations — runs as Next.js Server Actions, not HTTP
endpoints; see [Internal mutation contract](#internal-mutation-contract) at
the bottom.

## Auth model

- **Public:** no session required. Rate limiting is not implemented at the
  application layer for these routes (see the Security Guidelines checklist —
  this is a known gap to close at the host/CDN layer, e.g. Cloudflare rate
  limiting, once a host is chosen).
- **Owner-gated:** requires a signed-in `owner` session. `src/proxy.ts`
  guards `/api/admin/:path*` and `/api/uploads/:path*` first — an
  unauthenticated request to either gets a `401` **before** the route handler
  ever runs. Each handler **also** independently re-checks
  `getCurrentUser()` + `isOwner(user.role)` — this is not redundant defense,
  it is the design: there is no RLS in this stack (see `CLAUDE.md`), so a
  route handler's own check is what stops an anonymous or non-owner caller if
  the proxy's matcher is ever narrowed or the route is ever moved.

---

## `GET /api/products`

Public. Backs `ShopBrowser`'s client-side filtering on `/shop`. Every
parameter is validated and clamped server-side — there is no auth, so
nothing is trusted to be well-formed.

**Query parameters**

| Param | Type | Notes |
|---|---|---|
| `search` | string | Matches `productName` or `productCode`, substring, case-insensitive. Clamped to 100 chars. |
| `type` | string | Exact match on `productType`. |
| `color` | string | Exact match on any variant's `color`. |
| `size` | string | Exact match on any variant's `size`. |
| `inStock` | `"true"` | If present and exactly `"true"`, only products with at least one variant at `quantity > 0`. |
| `minPrice`, `maxPrice` | number | Clamped to `[0, 10_000_000]`. |
| `sort` | `newest` \| `price_asc` \| `price_desc` | Defaults to `newest`. Anything else falls back to `newest`. |
| `page` | integer | Clamped to `[1, 10_000]`. |
| `pageSize` | integer | Clamped to `[1, 48]`, default `24`. |

**Example request**

```
GET /api/products?search=dress&type=%E0%B9%80%E0%B8%94%E0%B8%A3%E0%B8%AA&sort=price_asc&page=1
```

**Example response — `200`**

```json
{
  "rows": [
    {
      "id": "b2f0...",
      "productCode": "DR-001",
      "productName": "Linen Wrap Dress",
      "productType": "เดรส",
      "description": "...",
      "sellPrice": "1290.00",
      "createdAt": "2026-01-14T08:00:00.000Z",
      "coverImageUrl": "https://img.example.com/products/.../1600.webp",
      "colors": ["ดำ", "ครีม"],
      "inStock": true
    }
  ],
  "count": 42,
  "page": 1,
  "pageSize": 24
}
```

**Status codes**

| Code | When |
|---|---|
| `200` | Always, on success — including zero results (`rows: []`). |
| `500` | Unexpected server/database error. Response body: `{ "error": "failed" }`. |

---

## `GET /api/admin/products`

Owner-gated. Full-column product list backing the `/admin/products` browser.
Every field a public caller would never see — `originalPrice`,
`buyingSource`, `sourceLink`, `margin` — is present here.

**Query parameters**

| Param | Type | Notes |
|---|---|---|
| `search` | string | Matches `productCode`, `productName`, or `buyingSource`. |
| `status` | `draft` \| `active` \| `archived` \| `all` | Default `all`. |
| `type` | string | Exact match on `productType`. |
| `sort` | `newest` \| `oldest` \| `price_high` \| `price_low` \| `name_asc` | Default `newest`. |
| `page` | integer | Default `1`. |
| `pageSize` | integer | Default `20`. |

**Example response — `200`**

```json
{
  "rows": [
    {
      "id": "b2f0...",
      "productCode": "DR-001",
      "productName": "Linen Wrap Dress",
      "productType": "เดรส",
      "description": "...",
      "sellPrice": "1290.00",
      "originalPrice": "650.00",
      "buyingSource": "Supplier A",
      "sourceLink": "https://...",
      "margin": "640.00",
      "status": "active",
      "createdBy": "u_...",
      "createdAt": "...",
      "updatedAt": "...",
      "variants": [{ "id": "...", "color": "ดำ", "size": "S", "quantity": 3, "sku": null, "sortOrder": 0, "createdAt": "...", "updatedAt": "..." }],
      "images": [{ "id": "...", "url": "...", "storageKey": "...", "alt": null, "color": null, "sortOrder": 0, "createdAt": "..." }]
    }
  ],
  "count": 118,
  "page": 1,
  "pageSize": 20
}
```

**Status codes**

| Code | When |
|---|---|
| `200` | Success. |
| `401` | No session. Body: `{ "error": "unauthorized" }`. In normal operation the caller never sees this — `src/proxy.ts` already 401s an unauthenticated `/api/admin/*` request before the handler runs. The handler's own check is the real backstop; see the auth model note above. |
| `403` | Session exists but `role !== "owner"`. Body: `{ "error": "forbidden" }`. |
| `500` | Unexpected error. Body: `{ "error": "failed" }`. |

---

## `GET /api/admin/orders`

Owner-gated. Paginated order list backing `/admin/orders`, with search and
date-range filters resolved in SQL (not filtered in memory).

**Query parameters**

| Param | Type | Notes |
|---|---|---|
| `status` | order status enum \| `all` | Default `all`. |
| `search` | string | Matches `customerName` (substring) or, if the term is all digits, an exact `orderNo`. |
| `dateFrom`, `dateTo` | ISO `yyyy-mm-dd` | Inclusive bounds on `orderDate`. |
| `sort` | `newest` \| `oldest` \| `orderno_high` \| `orderno_low` \| `total_high` \| `total_low` | Default `newest`; an unrecognised value falls back to it. `newest`/`oldest` sort on `orderDate` and `orderno_high`/`orderno_low` on the order number — the admin list's two sortable column headers set these. Every date sort breaks ties on `orderNo` descending, so a day's worth of orders paginates stably. |
| `page` | integer | Default `1`. |
| `pageSize` | integer | Clamped to `[1, 100]`, default `20`. |

**Example response — `200`**

```json
{
  "rows": [
    {
      "id": "o_...",
      "orderNo": 1042,
      "orderDate": "2026-08-01",
      "customerName": "คุณสมชาย",
      "customerAddress": null,
      "customerPhone": "081...",
      "shippingCost": "50.00",
      "packingCost": "10.00",
      "itemsTotal": "1290.00",
      "itemsCost": "650.00",
      "totalCost": "710.00",
      "profit": "580.00",
      "status": "new",
      "note": null,
      "createdBy": "u_...",
      "createdAt": "...",
      "updatedAt": "...",
      "itemCount": 1
    }
  ],
  "count": 87,
  "page": 1,
  "pageSize": 20
}
```

**Status codes:** same shape as `GET /api/admin/products` — `200` / `401` /
`403` / `500`, identical meanings.

---

## `POST /api/uploads/presign`

Owner-gated. Returns presigned R2 `PUT` URLs for storage keys the browser
already computed client-side (`lib/image-resize.ts#buildProductImageKey`).
This endpoint never invents a key — it only signs the ones it's handed, after
validating them.

**Request body**

```json
{
  "productId": "b2f0e6b4-....",
  "keys": [
    "products/b2f0e6b4-.../1700000000000-0-480.webp",
    "products/b2f0e6b4-.../1700000000000-0-800.webp",
    "products/b2f0e6b4-.../1700000000000-0-1600.webp"
  ]
}
```

- `productId` must be a valid UUID.
- `keys`: 1–30 entries, each must match
  `products/<productId>/<timestamp>-<index>-(480|800|1600).webp` exactly —
  three independent layers re-validate this shape (the request schema, the
  regex above, and `presignProductImagePut()`'s own prefix check), so a
  caller can never obtain a signed URL outside their own product's folder.

**Example response — `200`**

```json
{
  "uploads": [
    { "key": "products/b2f0.../1700000000000-0-480.webp", "url": "https://<account>.r2.cloudflarestorage.com/...&X-Amz-Signature=..." },
    { "key": "products/b2f0.../1700000000000-0-800.webp", "url": "https://..." },
    { "key": "products/b2f0.../1700000000000-0-1600.webp", "url": "https://..." }
  ]
}
```

Each `url` is valid for 300 seconds and accepts exactly one `PUT` with
`Content-Type: image/webp`.

In local development the signed URLs point at the MinIO container from
`docker-compose.yml` instead
(`http://localhost:9000/clothshop/products/...`) — set by `R2_ENDPOINT`, see
the README's Environment Variables. The request/response contract and every
validation layer are identical either way.

**Status codes**

| Code | When |
|---|---|
| `200` | Success. |
| `400` | Request body fails the schema, or any key doesn't match the well-formed-key pattern. Body: `{ "error": "invalid" }`. |
| `401` | No session. Body: `{ "error": "unauthorized" }`. As above, `src/proxy.ts` already blocks this in normal operation; the handler's own check is the real backstop. |
| `403` | Session exists but not `owner`. Body: `{ "error": "forbidden" }`. |
| `500` | R2/signing error. Body: `{ "error": "failed" }`. |

---

## `GET|POST /api/auth/[...nextauth]`

Auth.js v5's catch-all route handler (`export const { GET, POST } = handlers`
from `src/auth.ts`). Handles the Credentials provider's sign-in POST,
session/CSRF token endpoints, and sign-out — the standard Auth.js surface,
not custom application logic. Configuration:

- **Provider:** Credentials only (email + password). `authorize()` validates
  the payload with `loginSchema`, looks up the user by lowercased/trimmed
  email, and compares the password with `bcrypt.compare()` against either the
  real hash or a fixed dummy hash (constant-time defense against email
  enumeration — see `docs/application-flow.md`'s login flow and `CLAUDE.md`).
- **Session strategy:** `jwt` — no database session table. The JWT carries
  `id` and `role`, set once at sign-in and read on every subsequent request
  without a database round trip.
- **Sign-in page:** `pages.signIn = "/login"`.
- **No signup route exists anywhere in this API surface.** The only way an
  `owner` row is created is `scripts/create-owner.ts`, run out-of-band.

This route is not owner-gated (it can't be — signing in happens before a
session exists) and its status codes/response shapes follow Auth.js's own
conventions, not this app's `{ ok, error }` pattern.

---

## Public data contract

`src/db/queries/storefront.ts`'s `PUBLIC_PRODUCT_COLUMNS` is the **only**
column set any public response — `GET /api/products`, `/`, `/shop`, or
`/shop/[code]` — may ever expose. Every public query in the codebase derives
its select list from this object:

```ts
export const PUBLIC_PRODUCT_COLUMNS = {
  id: products.id,
  productCode: products.productCode,
  productName: products.productName,
  productType: products.productType,
  description: products.description,
  sellPrice: products.sellPrice,
  createdAt: products.createdAt,
} as const
```

Layered on top for list/detail views: a computed `coverImageUrl`, a
deduplicated `colors` array, and a boolean `inStock` — never the raw
variant row.

**`originalPrice`, `buyingSource`, `sourceLink`, `margin`, and any variant's
exact `quantity` are never present in any public response — including RSC
payloads.**

That last clause matters more here than in a typical app. A React Server
Component that fetches a *full* product row (e.g. via `queries/products.ts`,
the admin-only module) and passes it into a client component serializes
**every field of that row into the RSC payload** — including fields the JSX
never actually renders. The rendered HTML looking clean is not proof the page
is safe; the private fields can still be sitting in the payload the browser
downloaded to hydrate the page. The only reliable fix is structural: never
let a public-rendering code path fetch the private fields in the first
place, which is exactly what routing every storefront/API read through
`PUBLIC_PRODUCT_COLUMNS` guarantees — not "we remembered to redact it," but
"the private columns were never selected out of the database on this path at
all."

`docs/health-check.md` carries the standing curl-based test that re-verifies
this contract; re-run it after any change to `queries/storefront.ts` or
`/api/products`.

## Internal mutation contract

Every product, order, and settings write in this app is a Next.js **Server
Action** under `src/app/[locale]/admin/**/actions.ts` — there is no REST/JSON
endpoint for creating or editing a product, order, or product type. These are
**build-internal, not a stable public API**: they are called directly from
admin client components via Next's Server Actions RPC mechanism, are not
versioned, and are not intended to be called from outside this application.

Every action follows the same five-step shape: authenticate → re-check
`isOwner(user.role)` independently → `zod` parse the input → write (via
`db` for single-statement writes, `txDb().transaction()` for multi-table
writes) → revalidate the affected paths. Return values are a discriminated
union, `{ ok: true, id? } | { ok: false, error: string }`, with terse error
codes (`"unauthorized"`, `"forbidden"`, `"invalid"`, `"duplicate_code"`,
`"not_found"`, `"insert_failed"`, `"update_failed"`) that the UI maps through
`next-intl` rather than displaying raw. See `docs/application-flow.md` for
the full list of actions and `CLAUDE.md` for the security reasoning behind
the repeated `isOwner()` check.

The Settings mutation surface includes product-type management and
`clearShopData` only. The former `loadDemoShopData` Server Action has been
removed; no Settings request can generate a mock catalogue or fake orders.
The FairyStuff replacement is an internal, guarded CLI workflow—not a public
HTTP route or Server Action—and therefore makes no REST response-contract
change. Its manifest and transaction flows are documented in
`docs/application-flow.md`.
