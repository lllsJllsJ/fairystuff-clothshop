import "server-only"

import type { Column } from "drizzle-orm"
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm"

import { db } from "@/db"
import { orderItems, orderStatus, orders, preorderShipments, productImages, products } from "@/db/schema"

/**
 * Admin order reads. Read-only — creating/editing an order writes to both
 * `orders` and `orderItems` (and relies on the `recalc_order` trigger for
 * `itemsTotal`/`itemsCost`), so that write belongs in a
 * `db.transaction(...)` inside the owning server action, not here.
 */

export type OrderStatusValue = (typeof orderStatus.enumValues)[number]

export type OrderRow = typeof orders.$inferSelect
/** A list row carries its line counts so the list view needn't N+1:
 * `receivedCount` = lines in a received-or-refunded status, the preorder
 * progress shown as "2/3". */
export type OrderListRow = OrderRow & { itemCount: number; receivedCount: number }
export type OrderItemRow = typeof orderItems.$inferSelect
export type PreorderShipmentRow = typeof preorderShipments.$inferSelect
export type OrderWithItems = OrderRow & {
  items: OrderItemRow[]
  /** Admin-only inbound legs — never passed to anything public. */
  shipments: PreorderShipmentRow[]
}

export type OrderSort =
  | "newest"
  | "oldest"
  | "orderno_high"
  | "orderno_low"
  | "total_high"
  | "total_low"

export type OrderListParams = {
  status?: OrderStatusValue | "all"
  /** Matches customer name, phone, or preorder code (case-insensitive
   * substring — `PO-AB12` or just `ab12`), or an exact order no. */
  search?: string
  /** Inclusive ISO `yyyy-mm-dd` bounds on `orderDate`. */
  dateFrom?: string
  dateTo?: string
  sort?: OrderSort
  page?: number
  pageSize?: number
}

export type OrderListResult = {
  rows: OrderListRow[]
  count: number
  page: number
  pageSize: number
}

const DEFAULT_PAGE_SIZE = 20

const SORT_MAP: Record<OrderSort, { column: Column; ascending: boolean }> = {
  newest: { column: orders.orderDate, ascending: false },
  oldest: { column: orders.orderDate, ascending: true },
  orderno_high: { column: orders.orderNo, ascending: false },
  orderno_low: { column: orders.orderNo, ascending: true },
  total_high: { column: orders.itemsTotal, ascending: false },
  total_low: { column: orders.itemsTotal, ascending: true },
}

/** Paginated order list with date-range + status filters, for
 * `/admin/orders`. */
export async function getOrders(
  params: OrderListParams = {}
): Promise<OrderListResult> {
  const {
    status = "all",
    search = "",
    dateFrom,
    dateTo,
    sort = "newest",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = params

  const conditions = []
  if (status !== "all") conditions.push(eq(orders.status, status))

  // Search in SQL, not in memory. An earlier version of the API route pulled
  // up to 2000 rows and filtered them in JS, which silently truncates results
  // and degrades as the order book grows. `orderNo` is a bigint identity, so
  // it only participates when the term is all digits — casting it to text for
  // an ilike on every row would forfeit the index for no benefit.
  const term = search.trim()
  if (term) {
    const like = `%${term}%`
    const parts = [
      ilike(orders.customerName, like),
      ilike(orders.preorderCode, like),
      ilike(orders.customerPhone, like),
    ]
    if (/^\d+$/.test(term)) parts.push(eq(orders.orderNo, Number(term)))
    conditions.push(or(...parts)!)
  }
  if (dateFrom) conditions.push(gte(orders.orderDate, dateFrom))
  if (dateTo) conditions.push(lte(orders.orderDate, dateTo))

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const { column, ascending } = SORT_MAP[sort] ?? SORT_MAP.newest
  // `orderDate` is a DATE — a day's worth of orders all tie on it, and an
  // unstable tie makes pagination drop/repeat rows between pages. orderNo
  // is the identity column, so it breaks every tie deterministically.
  const orderBy = [
    ascending ? asc(column) : desc(column),
    column === orders.orderNo ? undefined : desc(orders.orderNo),
  ].filter((clause) => clause !== undefined)

  // itemCount comes from a correlated subquery rather than a second
  // round trip rather than a second query, keeping the list to one
  // statement per page render.
  const [rows, countRows] = await Promise.all([
    db
      .select({
        order: orders,
        // Table names are written out in full deliberately. Interpolating
        // `${orderItems.orderId}` / `${orders.id}` here emits UNQUALIFIED
        // column names ("order_id" = "id"), and since order_items has its own
        // "id" column, the predicate silently becomes
        // order_items.order_id = order_items.id — never true, so every count
        // came back 0. Qualify both sides; a smoke test caught this, tsc
        // could not, and the SQL is perfectly valid either way.
        itemCount: sql<number>`(
          select count(*)::int from "order_items"
          where "order_items"."order_id" = "orders"."id"
        )`.as("item_count"),
        receivedCount: sql<number>`(
          select count(*)::int from "order_items"
          join "order_item_statuses" on "order_item_statuses"."code" = "order_items"."status_code"
          where "order_items"."order_id" = "orders"."id"
            and ("order_item_statuses"."is_received" or "order_item_statuses"."is_refunded")
        )`.as("received_count"),
      })
      .from(orders)
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(orders).where(where),
  ])

  return {
    rows: rows.map((r) => ({ ...r.order, itemCount: r.itemCount, receivedCount: r.receivedCount })),
    count: countRows[0]?.value ?? 0,
    page,
    pageSize,
  }
}

/** Single order joined with its line items, for `/admin/orders/[id]`. */
export async function getOrderById(id: string): Promise<OrderWithItems | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
  if (!order) return null

  const [items, shipments] = await Promise.all([
    db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id))
      .orderBy(asc(orderItems.sortOrder)),
    db
      .select()
      .from(preorderShipments)
      .where(eq(preorderShipments.orderId, id))
      .orderBy(asc(preorderShipments.sortOrder), asc(preorderShipments.createdAt)),
  ])

  return { ...order, items, shipments }
}

/** What the owner needs to re-buy a line from the supplier: a photo and the
 * product's private source link. Admin-only — `sourceLink` is a private
 * column and must never reach a public page. */
export type OrderItemSourcing = {
  imageUrl: string | null
  sourceLink: string | null
  buyingSource: string | null
}

/**
 * Per-line sourcing info, keyed by order item id. Reads the LIVE product
 * (lines whose product was deleted get nulls). The photo is the first image
 * tagged with the line's colour, else the cover (lowest sortOrder).
 */
export async function getOrderItemSourcing(
  items: Pick<OrderItemRow, "id" | "productId" | "color">[]
): Promise<Record<string, OrderItemSourcing>> {
  const productIds = [...new Set(items.map((item) => item.productId).filter((id): id is string => !!id))]
  if (productIds.length === 0) return {}

  const [productRows, imageRows] = await Promise.all([
    db
      .select({ id: products.id, sourceLink: products.sourceLink, buyingSource: products.buyingSource })
      .from(products)
      .where(inArray(products.id, productIds)),
    db
      .select({ productId: productImages.productId, url: productImages.url, color: productImages.color })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt)),
  ])

  const productById = new Map(productRows.map((row) => [row.id, row]))
  const result: Record<string, OrderItemSourcing> = {}
  for (const item of items) {
    const product = item.productId ? productById.get(item.productId) : undefined
    if (!product) continue
    const images = imageRows.filter((image) => image.productId === product.id)
    const color = item.color?.toLowerCase()
    const match = color ? images.find((image) => image.color?.toLowerCase() === color) : undefined
    result[item.id] = {
      imageUrl: (match ?? images[0])?.url ?? null,
      sourceLink: product.sourceLink,
      buyingSource: product.buyingSource,
    }
  }
  return result
}
