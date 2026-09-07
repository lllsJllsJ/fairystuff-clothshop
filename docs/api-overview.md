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
- **Public, unguessable-URL:** `submitCheckout` (the `/checkout` Server
  Action) and `GET /[locale]/track/[code]` require no session at all — guest
  checkout removed the `customer` role and every account gate on these flows
  entirely (see `CLAUDE.md`). Their security instead rests on a random,
  unguessable `preorderCode` (`src/lib/preorder-code.ts`: 50 bits of entropy,
  no database read needed to generate one) standing in for a session:
  knowing the code is what proves the request is the customer who placed
  that order. **Rate limiting is not implemented at the application layer
  for either flow** — a deliberately accepted gap (anti-abuse work was
  explicitly out of scope for this migration), noted here so it isn't
  mistaken for an oversight. `submitCheckout` is consequently an
  **unauthenticated write**: anyone can place a guest order, which is the
  intended trade-off for removing the account wall — the order still lands
  in `new` and requires the owner's manual acceptance before anything ships
  (see `docs/application-flow.md`'s Checkout + Order Creation flow).

---

## `GET /api/products`

Public. Backs `ShopBrowser`'s client-side filtering on `/shop`. Every
parameter is validated and clamped server-side — there is no auth, so
nothing is trusted to be well-formed.

**Query parameters**

| Param | Type | Notes |
|---|---|---|
| `search` | string | Matches `productName` or `productCode`, substring, case-insensitive. Clamped to 100 chars. |
| `character` | string | Exact character slug linked through `product_characters`. |
| `color` | string | Exact match on any variant's `color`. |
| `size` | string | Exact match on any variant's `size`. |
| `minPrice`, `maxPrice` | number | Clamped to `[0, 10_000_000]`. |
| `sort` | `newest` \| `price_asc` \| `price_desc` | Defaults to `newest`. Anything else falls back to `newest`. |
| `page` | integer | Clamped to `[1, 10_000]`. |
| `pageSize` | integer | Clamped to `[1, 48]`, default `24`. |

**Example request**

```
GET /api/products?search=dress&character=mickey&sort=price_asc&page=1
```

**Example response — `200`**

```json
{
  "rows": [
    {
      "id": "b2f0...",
      "productCode": "DR-001",
      "productName": "Linen Wrap Dress",
      "description": "...",
      "sellPrice": "1290.00",
      "createdAt": "2026-01-14T08:00:00.000Z",
      "coverImageUrl": "https://img.example.com/products/.../1600.webp",
      "colors": ["ดำ", "ครีม"],
      "characters": [
        { "id": "c_...", "slug": "mickey", "name": "มิกกี้", "nameEn": "Mickey" }
      ]
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
      "preorderMinDays": 14,
      "preorderMaxDays": 30,
      "margin": "640.00",
      "status": "active",
      "createdBy": "u_...",
      "createdAt": "...",
      "updatedAt": "...",
      "variants": [{ "id": "...", "color": "ดำ", "size": "S", "quantity": 3, "sku": null, "sortOrder": 0, "createdAt": "...", "updatedAt": "..." }],
      "images": [{ "id": "...", "url": "...", "storageKey": "...", "alt": null, "color": null, "sortOrder": 0, "createdAt": "..." }],
      "characters": [{ "id": "...", "slug": "mickey", "name": "มิกกี้", "nameEn": "Mickey", "sortOrder": 0 }]
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
| `status` | `new` \| `accepted` \| `preorder` \| `packaging` \| `shipping` \| `complete` \| `cancelled` \| `refund` \| `all` | Default `all`. |
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
      "preorderCode": "PO-4F7K9XW2QA",
      "orderDate": "2026-08-01",
      "customerName": "คุณสมชาย",
      "customerAddress": null,
      "customerPhone": "081...",
      "shippingCost": "50.00",
      "packingCost": "10.00",
      "advertisingCost": "30.00",
      "shippingConfirmedAt": null,
      "itemsTotal": "1290.00",
      "itemsCost": "650.00",
      "totalCost": "740.00",
      "profit": "550.00",
      "status": "new",
      "refundReason": null,
      "refundedAt": null,
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

## `GET /api/admin/users`

Owner-gated. Paginated account list backing `/admin/users`, with search and
role/verification filters resolved in SQL (not filtered in memory).

**Never returns `passwordHash`.** The query derives its select list from
`ADMIN_USER_COLUMNS` in `src/db/queries/users.ts` — the same structural
defense `PUBLIC_PRODUCT_COLUMNS` provides for the storefront. The hash is
never selected out of the database on this path, so it cannot reach an RSC
payload or this JSON body even by accident.

**Query parameters**

| Param | Type | Notes |
|---|---|---|
| `role` | `owner` \| `staff` \| `all` | Default `all`; an unrecognised value falls back to it. There is no `customer` role — guest checkout needs no account (see `CLAUDE.md`), so this list is owner/staff accounts only. |
| `search` | string | Case-insensitive substring across `email`, `fullname`, and `phone`. |
| `verified` | `all` \| `verified` \| `unverified` | Filters on `emailVerifiedAt` being set. Cosmetic as of guest checkout: `authorize()` in `src/auth.ts` no longer gates sign-in on this column (that gate only ever applied to the removed `customer` role) — an unverified owner/staff account can still sign in normally. |
| `sort` | `newest` \| `oldest` \| `name_az` \| `name_za` | Default `newest`; an unrecognised value falls back to it. Every sort breaks ties on `users.id`, so the list paginates stably when `createdAt` ties. |
| `page` | integer | Default `1`. |
| `pageSize` | integer | Clamped to `[1, 100]`, default `20`. |

**Example response — `200`**

```json
{
  "rows": [
    {
      "id": "u_...",
      "email": "owner@example.com",
      "fullname": "คุณสมชาย",
      "phone": "081...",
      "role": "owner",
      "emailVerifiedAt": "2026-09-01T04:12:00.000Z",
      "createdAt": "2026-08-26T13:27:31.477Z"
    }
  ],
  "count": 2,
  "page": 1,
  "pageSize": 20
}
```

There is no `orderCount` field anymore — `orders` carries no account
reference at all as of guest checkout (see `CLAUDE.md`), so there is no
per-account order count to compute or display.

**Status codes:** same shape as `GET /api/admin/products` — `200` / `401` /
`403` / `500`, identical meanings.

---

## `POST /api/uploads/presign`

Owner-gated. Returns presigned Railway Bucket `PUT` URLs for storage keys the browser
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
(`http://localhost:9000/clothshop/products/...`) — set by `STORAGE_ENDPOINT`, see
the README's Environment Variables. The request/response contract and every
validation layer are identical either way.

**Status codes**

| Code | When |
|---|---|
| `200` | Success. |
| `400` | Request body fails the schema, or any key doesn't match the well-formed-key pattern. Body: `{ "error": "invalid" }`. |
| `401` | No session. Body: `{ "error": "unauthorized" }`. As above, `src/proxy.ts` already blocks this in normal operation; the handler's own check is the real backstop. |
| `403` | Session exists but not `owner`. Body: `{ "error": "forbidden" }`. |
| `500` | Bucket/signing error. Body: `{ "error": "failed" }`. |

---

## `POST /api/uploads/presign-logo`

Owner-gated. Same shape and rationale as `POST /api/uploads/presign` above,
scoped to the single brand logo instead of a per-product image matrix — see
`src/lib/brand-image-keys.ts`. Split into its own route rather than widening
the product one because the key shape carries no `productId` segment at all
(there is only ever one logo).

**Request body**

```json
{
  "keys": [
    "brand/logo-1700000000000-128.webp",
    "brand/logo-1700000000000-256.webp",
    "brand/logo-1700000000000-512.webp"
  ]
}
```

`keys`: 1–3 entries, each must match `brand/logo-<timestamp>-(128|256|512).webp`
exactly — the request schema, the regex, and `presignBrandLogoPut()`'s own
prefix check all re-validate this shape independently.

**Example response — `200`**

```json
{
  "uploads": [
    { "key": "brand/logo-1700000000000-128.webp", "url": "https://..." },
    { "key": "brand/logo-1700000000000-256.webp", "url": "https://..." },
    { "key": "brand/logo-1700000000000-512.webp", "url": "https://..." }
  ]
}
```

Each `url` is valid for 300 seconds and accepts exactly one `PUT` with
`Content-Type: image/webp`. Same status-code table as `POST
/api/uploads/presign`.

---

## `GET /api/images/[...key]`

Public, read-only proxy for object storage. Accepts keys matching EITHER
`products/<uuid>/<generated-name>-(480|800|1600).webp` (product photos) or
`brand/logo-<timestamp>-(128|256|512).webp` (the single brand logo — see
`src/lib/brand-image-keys.ts`); all other paths return `404`. Successful
responses stream `image/webp` with `ETag`, `nosniff`, and
`Cache-Control: public, max-age=31536000, immutable`. A matching
`If-None-Match` returns `304`.

| Code | When |
|---|---|
| `200` | The object exists and is streamed successfully. |
| `304` | The request ETag matches the stored object. |
| `404` | The key is malformed or the object does not exist. |
| `502` | Authenticated storage read failed. No storage credentials are exposed. |

---

## `GET|POST /api/auth/[...nextauth]`

Auth.js v5's catch-all route handler (`export const { GET, POST } = handlers`
from `src/auth.ts`). Handles the Credentials provider's sign-in POST,
session/CSRF token endpoints, and sign-out — the standard Auth.js surface,
not custom application logic. Configuration:

- **Provider:** Credentials only (email-or-phone identifier + password).
  `authorize()` validates the payload with `loginSchema`, lowercases email or
  strips common phone formatting, looks up the user by either unique field,
  and compares the password with `bcrypt.compare()` against either the
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
  description: products.description,
  sellPrice: products.sellPrice,
  createdAt: products.createdAt,
} as const
```

Layered on top for list/detail views: a computed `coverImageUrl`, a
deduplicated `colors` array, safe variant identifiers/options, and linked
character objects — never the raw variant row or stock quantity.

**`productType`, preorder lead-time fields, `originalPrice`, `buyingSource`,
`sourceLink`, `margin`, and any variant's exact `quantity` are never present
in any public response — including RSC payloads.** Product type and lead time
are admin-only; characters are the public taxonomy. All active variants are
preorderable regardless of the admin stock ledger.

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

### Public order data — `PUBLIC_ORDER_COLUMNS`

`GET /[locale]/track/[code]` (a page route, not a JSON endpoint — see the
Auth model section above) is the second public read of a table that also
carries private figures, and it gets the identical structural treatment:
`src/db/queries/track.ts`'s `PUBLIC_ORDER_COLUMNS` /
`PUBLIC_ORDER_ITEM_COLUMNS` are the **only** column sets
`getOrderByPreorderCode` may ever select from `orders` / `orderItems`.

```ts
const PUBLIC_ORDER_COLUMNS = {
  id: orders.id, // internal join key only — stripped before the function returns
  preorderCode: orders.preorderCode,
  orderDate: orders.orderDate,
  status: orders.status,
  customerName: orders.customerName,
  customerPhone: orders.customerPhone,
  customerAddress: orders.customerAddress,
  note: orders.note,
  itemsTotal: orders.itemsTotal,
  shippingCost: orders.shippingCost,
  shippingConfirmedAt: orders.shippingConfirmedAt,
  updatedAt: orders.updatedAt, // operational timestamp, safe — see below
} as const

const PUBLIC_ORDER_ITEM_COLUMNS = {
  id: orderItems.id,
  productName: orderItems.productName,
  color: orderItems.color,
  size: orderItems.size,
  sellPrice: orderItems.sellPrice,
  quantity: orderItems.quantity,
  preorderMinDays: orderItems.preorderMinDays, // lead-time snapshot, safe
  preorderMaxDays: orderItems.preorderMaxDays, // — see below
} as const
```

**`itemsCost`, `totalCost`, `profit`, `advertisingCost`, `packingCost`, each
line's `productCost`/`lineCost`, `checkoutKey`, `createdBy`, `refundReason`,
`refundedAt`, and — the one most worth calling out — `orders.orderNo` are
never present in this response.** `orderNo` is deliberately excluded even
though it is not a money field: it is a sequential, enumerable bigint
identity, and printing it on a public URL would let anyone page through
every order in the shop by incrementing a number, defeating the entire
reason `preorderCode` is random rather than sequential. `docs/health-check.md`
carries the matching curl-based leak test (check 6); re-run it after any
change to `queries/track.ts` or the track page components.

`updatedAt` (added for the tracking page's 2-row timeline) and each item's
`preorderMinDays`/`preorderMaxDays` (added for the tracking page's
"slowest item wins" lead-time estimate) are the two newest additions to
this allowlist. Both are deliberately safe to expose despite living on the
same allowlist as the cost/profit fields above: `updatedAt` is an
operational timestamp with no monetary content (it is a BEFORE UPDATE
trigger, `set_updated_at()` in `0001_init_extras.sql`, that fires on ANY
change to the row — not a dedicated per-status-transition log, which is why
the track page's timeline never shows more than 2 rows), and
`preorderMinDays`/`preorderMaxDays` are lead-time metadata snapshotted from
`products` at order-insert time (same snapshot principle as
`productName`/`color`/`size` above them), not a cost or profit figure.

## Internal mutation contract

Application writes are Next.js **Server Actions** under the locale routes —
there is no REST/JSON endpoint for creating or editing a product, order, or
product type. Owner mutations live under `admin/**/actions.ts`; password
recovery and guest checkout actions live under the relevant public route
groups. These are **build-internal, not a stable public API**: they are
called directly from client components via Next's Server Actions RPC
mechanism, are not versioned, and are not intended to be called from outside
this application.

Every owner action follows the same five-step shape: authenticate → re-check
`isOwner(user.role)` independently → `zod` parse the input → write (via `db`
for single-statement writes, `txDb().transaction()` for multi-table writes) →
revalidate the affected paths. `submitCheckout` (guest checkout) is the one
exception to the "authenticate" step — there is no session to check at all,
by design (see the Auth model section above); it validates and re-resolves
its input just as strictly, it simply has no identity to verify first.
Return values are a discriminated
union, `{ ok: true, id? } | { ok: false, error: string }`, with terse error
codes (`"unauthorized"`, `"forbidden"`, `"invalid"`, `"duplicate_code"`,
`"not_found"`, `"insert_failed"`, `"update_failed"`) that the UI maps through
`next-intl` rather than displaying raw. See `docs/application-flow.md` for
the full list of actions and `CLAUDE.md` for the security reasoning behind
the repeated `isOwner()` check.

Product creation validates the generated-code form independently from its
image list. An empty asynchronous code preview is valid because the immutable
code is minted inside the transaction; each submitted image must instead use
the exact same-origin `/api/images/<storageKey>` URL for its validated product
key. Products can link multiple managed characters and store an admin-only
minimum/maximum preorder-day range. Order create/update payloads include non-negative `advertisingCost` along
with shipping and packing. Postgres derives
`totalCost = itemsCost + shippingCost + packingCost + advertisingCost` and
`profit = itemsTotal - totalCost`; callers never submit either derived value.

The Settings mutation surface includes product types, shop contacts,
characters, fixed admin/customer status labels, configurable line-item
statuses, and `clearShopData`. Deleting referenced character or item-status
rows is blocked. Exactly one line-item status may be the default.

`submitCheckout` re-resolves active products, variants, and current prices
server-side; it never trusts the client's cart snapshot for anything but
which items/quantities were requested. A UUID checkout key makes retries
idempotent (unique globally now, not scoped to an account — there is no
account to scope it to). The resulting order stores a server-minted, random
`preorderCode` (see the `PUBLIC_ORDER_COLUMNS` section above), generates
`orderNo`, starts at `new`, and receives no online payment; nothing
auto-advances it past `new` — the owner accepts it by hand from
`/admin/orders`. `admin/orders/actions.ts#createOrder` mints a `preorderCode`
too, so an owner-typed phone order is trackable at the same `/track/[code]`
URL. Both mint paths share the same retry-on-`23505` strategy (see
`src/lib/preorder-code.ts`), bounded at 3 attempts, because a unique-index
collision aborts the whole Postgres transaction and cannot be retried on the
same `tx`. Public reads of an order (`getOrderByPreorderCode`) always scope
by the code itself — there is no session to additionally scope by. Internal
order statuses map to `Received`, `Preparing`, `Shipping`, or `Complete`,
with `Cancelled`/`Refunded` exceptional stages.

Refund actions require a reason and store a timestamp at order or line-item
level. Moving an order to `packaging` is blocked until every line-item status
is marked received or refunded; refunding every line automatically moves the
order to `refund`. No payment-provider API is called.

The user-admin surface (`admin/users/actions.ts`) adds `setUserRole`,
`deleteUser`, `verifyUserEmail`, and `sendUserPasswordReset`, operating on
owner/staff accounts only — there is no public registration and no
`customer` role to administer. It is the most privilege-sensitive action file
in the app — `setUserRole` is the only in-app path that can mint an `owner`
(the only other way is `scripts/create-owner.ts`, run out-of-band). Two
lockout rails are enforced **in the actions, not just the UI**: the acting
owner cannot change their own role or delete their own account
(`self_role_change` / `self_delete`), and the final remaining owner cannot be
demoted or deleted by anyone (`last_owner`) — recovery from that state would
mean re-running `npm run create-owner` against the production database.
`deleteUser` never touches order history either way: guest checkout stores no
account reference on an order at all, and an admin-created order's
`createdBy` is `ON DELETE SET NULL`. `sendUserPasswordReset` reuses the same
`sendTokenEmail` helper (`src/lib/account-email.ts`) that
`/forgot-password` uses, inheriting its lifetime, single-use semantics, and
one-per-minute `cooldown`; it requires `EMAIL_ENABLED` and reports
`email_disabled` rather than silently doing nothing, and returns `no_email`
for an account that has no address on file. The owner never sees or sets a
password. `verifyUserEmail` is now cosmetic — `authorize()` in `src/auth.ts`
no longer gates sign-in on `emailVerifiedAt` — but is kept because it still
has a real effect (dropping any outstanding verify token).

The former `loadDemoShopData` Server Action has been
removed; no Settings request can generate a mock catalogue or fake orders.
The FairyStuff replacement is an internal, guarded CLI workflow—not a public
HTTP route or Server Action—and therefore makes no REST response-contract
change. Its manifest and transaction flows are documented in
`docs/application-flow.md`.
