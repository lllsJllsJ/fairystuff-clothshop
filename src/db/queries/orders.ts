import "server-only"

import type { Column } from "drizzle-orm"
import { and, asc, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm"

import { db } from "@/db"
import { orderItems, orderStatus, orders } from "@/db/schema"

/**
 * Admin order reads. Read-only — creating/editing an order writes to both
 * `orders` and `orderItems` (and relies on the `recalc_order` trigger for
 * `itemsTotal`/`itemsCost`), so that write belongs in a
 * `db.transaction(...)` inside the owning server action, not here.
 */

export type OrderStatusValue = (typeof orderStatus.enumValues)[number]

export type OrderRow = typeof orders.$inferSelect
/** A list row carries its line count so the list view needn't N+1. */
export type OrderListRow = OrderRow & { itemCount: number }
export type OrderItemRow = typeof orderItems.$inferSelect
export type OrderWithItems = OrderRow & { items: OrderItemRow[] }

export type OrderSort =
  | "newest"
  | "oldest"
  | "orderno_high"
  | "orderno_low"
  | "total_high"
  | "total_low"

export type OrderListParams = {
  status?: OrderStatusValue | "all"
  /** Matches customer name (case-insensitive substring) or exact order no. */
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
    const parts = [ilike(orders.customerName, like)]
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
      })
      .from(orders)
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(orders).where(where),
  ])

  return {
    rows: rows.map((r) => ({ ...r.order, itemCount: r.itemCount })),
    count: countRows[0]?.value ?? 0,
    page,
    pageSize,
  }
}

/** Single order joined with its line items, for `/admin/orders/[id]`. */
export async function getOrderById(id: string): Promise<OrderWithItems | null> {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1)
  if (!order) return null

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, id))
    .orderBy(asc(orderItems.sortOrder))

  return { ...order, items }
}
