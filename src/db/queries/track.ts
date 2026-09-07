import "server-only"

import { asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { orderItems, orders } from "@/db/schema"

/**
 * ============================================================================
 * THE PUBLIC / PRIVATE SPLIT FOR ORDERS — read this before touching this file.
 * ============================================================================
 *
 * `/track/[code]` is a PUBLIC read of `orders`, reachable by anyone who has
 * (or guesses) a preorder code — there is no session check here at all. That
 * makes this file's column discipline exactly as load-bearing as
 * `PUBLIC_PRODUCT_COLUMNS` in `src/db/queries/storefront.ts`: `orders` and
 * `orderItems` carry `profit`, `totalCost`, `itemsCost`, `advertisingCost`,
 * `packingCost`, and each line's `productCost`/`lineCost` — none of which may
 * ever reach this path. Never spread `orders.*` or `orderItems.*` here, and
 * never pass a full order row (fetched elsewhere, e.g. the admin-only
 * `queries/orders.ts`) into anything that renders under `/track`.
 *
 * Deliberately ALSO absent from the returned shape: `checkoutKey`,
 * `createdBy`, `refundReason`, `refundedAt`, and — most importantly —
 * `orders.orderNo`. `orderNo` is a sequential, enumerable bigint identity;
 * printing it on a public URL would let anyone page through every order in
 * the shop by incrementing a number, which defeats the entire reason
 * `preorderCode` is random. `orders.id` is selected internally ONLY to join
 * to `orderItems` and is stripped before this function returns — it is never
 * part of `TrackedOrder`.
 */
const PUBLIC_ORDER_COLUMNS = {
  id: orders.id,
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
  // Operational timestamp, not sensitive — safe to expose (unlike the
  // money/profit columns above it). It's a BEFORE UPDATE trigger
  // (`set_updated_at()`, 0001_init_extras.sql) that bumps on ANY change to
  // the row, not a dedicated status-history log — the track page's timeline
  // treats it accordingly (see status-stepper/page comments).
  updatedAt: orders.updatedAt,
} as const

/**
 * Never spread `orderItems.*` — `productCost`/`lineCost` are private.
 * `preorderMinDays`/`preorderMaxDays` ARE safe to expose here: they're
 * lead-time metadata snapshotted from the product at order time (see
 * schema.ts's comment on `orderItems`), not cost/profit figures.
 */
const PUBLIC_ORDER_ITEM_COLUMNS = {
  id: orderItems.id,
  productName: orderItems.productName,
  color: orderItems.color,
  size: orderItems.size,
  sellPrice: orderItems.sellPrice,
  quantity: orderItems.quantity,
  preorderMinDays: orderItems.preorderMinDays,
  preorderMaxDays: orderItems.preorderMaxDays,
} as const

export type TrackedOrderItem = {
  id: string
  productName: string
  color: string | null
  size: string | null
  sellPrice: string
  quantity: number
  preorderMinDays: number | null
  preorderMaxDays: number | null
}

export type TrackedOrder = {
  preorderCode: string
  orderDate: string
  status: (typeof orders.$inferSelect)["status"]
  customerName: string
  customerPhone: string | null
  customerAddress: string | null
  note: string | null
  itemsTotal: string
  shippingCost: string
  shippingConfirmedAt: Date | null
  updatedAt: Date
  items: TrackedOrderItem[]
}

/**
 * Looks up an order by its public preorder code. `code` should already be
 * normalized (see `src/lib/preorder-code.ts#normalizePreorderCode`) — this
 * does an exact match, no fuzzy/case-insensitive fallback, since a
 * normalized code has one canonical uppercase form.
 */
export async function getOrderByPreorderCode(code: string): Promise<TrackedOrder | null> {
  const [row] = await db
    .select(PUBLIC_ORDER_COLUMNS)
    .from(orders)
    .where(eq(orders.preorderCode, code))
    .limit(1)
  if (!row) return null

  const items = await db
    .select(PUBLIC_ORDER_ITEM_COLUMNS)
    .from(orderItems)
    .where(eq(orderItems.orderId, row.id))
    .orderBy(asc(orderItems.sortOrder))

  // Built field-by-field (not `{ ...row, items }`) so `id` — selected only
  // to join to `orderItems` above — can never ride along into the returned
  // shape and end up serialized into a client component's RSC payload.
  return {
    preorderCode: row.preorderCode,
    orderDate: row.orderDate,
    status: row.status,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerAddress: row.customerAddress,
    note: row.note,
    itemsTotal: row.itemsTotal,
    shippingCost: row.shippingCost,
    shippingConfirmedAt: row.shippingConfirmedAt,
    updatedAt: row.updatedAt,
    items,
  }
}
