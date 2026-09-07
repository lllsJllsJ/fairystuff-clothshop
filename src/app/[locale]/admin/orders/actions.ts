"use server"

import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { db, txDb } from "@/db"
import { orderItems, orderItemStatuses, orderStatus, orders } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth-helpers"
import { isUniqueViolation } from "@/lib/db-errors"
import { generatePreorderCode } from "@/lib/preorder-code"
import { isOwner } from "@/lib/roles"
import { orderFormSchema, type OrderFormValues } from "@/lib/validations/order"

import { revalidateOrders } from "./revalidate"

/**
 * Exact 5-step shape from `admin/products/actions.ts` (itself ported from
 * carstockpro's `cars/actions.ts`): auth -> role check -> zod parse ->
 * transactional write -> revalidatePath. Same `ok`/`error` discriminated
 * union convention, split into two aliases below because `createOrder`/
 * `updateOrder` always return a real `id` on success while `deleteOrder`/
 * `setOrderStatus` echo the products file's `ActionResult` (`id` optional).
 *
 * ---------------------------------------------------------------------
 * SECURITY — plan Risk 1, restated at every call site on purpose
 * ---------------------------------------------------------------------
 * There is no RLS in this stack. Every action below independently
 * re-checks `isOwner(user.role)` even though the proxy and the admin
 * layout's `requireOwner()` already gate the page/route that calls it —
 * never assume either of those already covered it. A missing check here
 * is a full breach with no backstop.
 *
 * ---------------------------------------------------------------------
 * TRANSACTIONS — plan Risk 3
 * ---------------------------------------------------------------------
 * An order and its line items must land atomically, so `createOrder` and
 * `updateOrder` open a transaction. `txDb()` is a deprecated alias for `db`
 * retained from the old Neon HTTP driver, which could not do interactive
 * transactions; the pooled node-postgres driver can, so `db.transaction(...)`
 * is equivalent and preferred in new code.
 * `deleteOrder` and `setOrderStatus` are single-statement
 * writes, so they use plain `db` — `deleteOrder` relies on the FK
 * `onDelete: "cascade"` declared on `orderItems.orderId` (schema.ts) to
 * remove the line items in the same statement, exactly like
 * `deleteProduct` relies on cascade for variants/images.
 *
 * ---------------------------------------------------------------------
 * ORDER-ITEM IDENTITY IS LOAD-BEARING
 * ---------------------------------------------------------------------
 * Fulfillment and refund metadata belongs to each order-item row, so edits
 * delta-match optional item ids: validate ownership, delete removed ids,
 * update retained rows, insert new rows. Never regress this to delete-all /
 * reinsert-all; doing so erases the per-item operational history.
 *
 * ---------------------------------------------------------------------
 * GENERATED / TRIGGER-MAINTAINED COLUMNS — never write these
 * ---------------------------------------------------------------------
 * `orders.totalCost`, `orders.profit`, `orderItems.lineTotal`, and
 * `orderItems.lineCost` are `GENERATED ALWAYS AS (...) STORED` (added by
 * drizzle/0001_init_extras.sql). Postgres rejects a write that names them
 * (23P05). `orders.itemsTotal`/`orders.itemsCost` are instead
 * trigger-maintained by `recalc_order()`, firing automatically on every
 * `order_items` insert/update/delete — never set them directly either.
 * None of the writes below ever touch any of these six columns.
 *
 * ---------------------------------------------------------------------
 * MANUAL STOCK — DELIBERATE, do not "fix" this
 * ---------------------------------------------------------------------
 * Neither `createOrder` nor `updateOrder` ever decrements
 * `productVariants.quantity`. Orders and stock are independent ledgers by
 * design (see schema.ts's comment on `productVariants` and plan §4/§15) —
 * the owner adjusts quantities by hand in the product editor after
 * checking physical stock. Adding a decrement here would silently start
 * lying about stock the moment a cancelled/edited order didn't reverse
 * cleanly. Do not add one.
 */

export type OrderResult = { ok: true; id: string } | { ok: false; error: string }
export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

/** A 23505 aborts the whole Postgres transaction — see preorder-code.ts's
 * header. The retry re-runs the ENTIRE transaction with a fresh code, never
 * just the insert statement on an already-aborted `tx`. */
const MAX_PREORDER_CODE_ATTEMPTS = 3

function toNullable(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim()
  return trimmed.length ? trimmed : null
}

/** `numeric(12,2)` columns take a string driver value (drizzle-orm's
 * default `numeric` mode) — see src/db/schema.ts's file-level comment.
 * Money fields are always defined post-parse (the `money` preprocessor in
 * validations/order.ts collapses "" to 0), so this never sees NaN. */
function toMoney(value: number): string {
  return value.toFixed(2)
}

function toItemRows(items: OrderFormValues["items"], orderId: string) {
  return items.map((item, i) => ({
    orderId,
    productId: item.productId ? item.productId : null,
    productVariantId: item.productVariantId ? item.productVariantId : null,
    productCode: item.productCode,
    productName: item.productName,
    productType: toNullable(item.productType),
    color: toNullable(item.color),
    size: toNullable(item.size),
    productCost: toMoney(Number(item.productCost)),
    sellPrice: toMoney(Number(item.sellPrice)),
    // Lead-time snapshot — set by the product picker (order-line-row.tsx),
    // carried through untouched; both null is normal for a non-preorder item.
    preorderMinDays: item.preorderMinDays ?? null,
    preorderMaxDays: item.preorderMaxDays ?? null,
    quantity: Number(item.quantity),
    statusCode: item.statusCode ?? "not_ordered",
    sortOrder: i,
  }))
}

async function submittedItemsResolved(items: OrderFormValues["items"]): Promise<boolean> {
  const codes = [...new Set(items.map((item) => item.statusCode ?? "not_ordered"))]
  const definitions = await db.select().from(orderItemStatuses).where(inArray(orderItemStatuses.code, codes))
  const definitionMap = new Map(definitions.map((item) => [item.code, item]))
  return items.every((item) => {
    const definition = definitionMap.get(item.statusCode ?? "not_ordered")
    return !!definition && (definition.isReceived || definition.isRefunded)
  })
}

export async function createOrder(values: OrderFormValues): Promise<OrderResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsed = orderFormSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const v = parsed.data
  if (v.status === "refund" && !toNullable(v.refundReason)) return { ok: false, error: "reason_required" }
  if (v.status === "packaging" && !(await submittedItemsResolved(v.items))) return { ok: false, error: "items_pending" }

  let insertedId: string | null = null
  for (let attempt = 0; attempt < MAX_PREORDER_CODE_ATTEMPTS && insertedId === null; attempt += 1) {
  try {
    insertedId = await txDb().transaction(async (tx) => {
      const [row] = await tx
        .insert(orders)
        .values({
          orderDate: v.orderDate,
          customerName: v.customerName,
          customerAddress: toNullable(v.customerAddress),
          customerPhone: toNullable(v.customerPhone),
          preorderCode: generatePreorderCode(),
          shippingCost: toMoney(v.shippingCost),
          packingCost: toMoney(v.packingCost),
          advertisingCost: toMoney(v.advertisingCost),
          shippingConfirmedAt: v.shippingConfirmed ? new Date() : null,
          status: v.status,
          refundReason: v.status === "refund" ? toNullable(v.refundReason) : null,
          refundedAt: v.status === "refund" ? new Date() : null,
          note: toNullable(v.note),
          createdBy: user.id,
        })
        .returning({ id: orders.id })

      if (!row) throw new Error("insert_failed")

      await tx.insert(orderItems).values(toItemRows(v.items, row.id))

      return row.id
    })
  } catch (error) {
    if (isUniqueViolation(error, "orders_preorder_code_unique")) continue
    console.error("createOrder failed", error)
    return { ok: false, error: "insert_failed" }
  }
  }

  if (insertedId === null) {
    console.error("createOrder failed: exhausted preorder code retries")
    return { ok: false, error: "insert_failed" }
  }

  revalidateOrders(insertedId)
  return { ok: true, id: insertedId }
}

export async function updateOrder(id: string, values: OrderFormValues): Promise<OrderResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsed = orderFormSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const v = parsed.data
  if (v.status === "refund" && !toNullable(v.refundReason)) return { ok: false, error: "reason_required" }
  if (v.status === "packaging" && !(await submittedItemsResolved(v.items))) return { ok: false, error: "items_pending" }

  try {
    await txDb().transaction(async (tx) => {
      const [currentOrder] = await tx
        .select({
          shippingConfirmedAt: orders.shippingConfirmedAt,
          refundedAt: orders.refundedAt,
        })
        .from(orders)
        .where(eq(orders.id, id))
        .limit(1)
      if (!currentOrder) throw new Error("not_found")

      const [updatedRow] = await tx
        .update(orders)
        .set({
          orderDate: v.orderDate,
          customerName: v.customerName,
          customerAddress: toNullable(v.customerAddress),
          customerPhone: toNullable(v.customerPhone),
          shippingCost: toMoney(v.shippingCost),
          packingCost: toMoney(v.packingCost),
          advertisingCost: toMoney(v.advertisingCost),
          shippingConfirmedAt: v.shippingConfirmed
            ? (currentOrder.shippingConfirmedAt ?? new Date())
            : null,
          status: v.status,
          ...(v.status === "refund" ? {
            refundReason: toNullable(v.refundReason),
            refundedAt: currentOrder.refundedAt ?? new Date(),
          } : {}),
          note: toNullable(v.note),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id))
        .returning({ id: orders.id })

      if (!updatedRow) throw new Error("not_found")

      const existing = await tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, id))
      const existingIds = new Set(existing.map((item) => item.id))
      const submittedIds = v.items.flatMap((item) => item.id ? [item.id] : [])
      if (submittedIds.some((itemId) => !existingIds.has(itemId))) throw new Error("invalid_item")

      const removedIds = [...existingIds].filter((itemId) => !submittedIds.includes(itemId))
      if (removedIds.length) await tx.delete(orderItems).where(and(eq(orderItems.orderId, id), inArray(orderItems.id, removedIds)))

      const rows = toItemRows(v.items, id)
      for (let index = 0; index < v.items.length; index++) {
        const item = v.items[index]
        const row = rows[index]
        if (item.id) {
          await tx.update(orderItems).set(row).where(and(eq(orderItems.id, item.id), eq(orderItems.orderId, id)))
        } else {
          await tx.insert(orderItems).values(row)
        }
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") {
      return { ok: false, error: "not_found" }
    }
    console.error("updateOrder failed", error)
    return { ok: false, error: "update_failed" }
  }

  revalidateOrders(id)
  return { ok: true, id }
}

export async function deleteOrder(id: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const [row] = await db.select({ id: orders.id }).from(orders).where(eq(orders.id, id)).limit(1)
  if (!row) return { ok: false, error: "not_found" }

  // A single statement — the FK `onDelete: "cascade"` on
  // `orderItems.orderId` (schema.ts) removes the line items in the same
  // delete, so this never needs txDb()'s multi-statement transaction.
  await db.delete(orders).where(eq(orders.id, id))

  revalidateOrders()
  return { ok: true, id }
}

export async function setOrderStatus(id: string, status: string, refundReason?: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsed = z.enum(orderStatus.enumValues).safeParse(status)
  if (!parsed.success) return { ok: false, error: "invalid" }

  if (parsed.data === "packaging") {
    const itemStates = await db
      .select({ isReceived: orderItemStatuses.isReceived, isRefunded: orderItemStatuses.isRefunded })
      .from(orderItems)
      .leftJoin(orderItemStatuses, eq(orderItems.statusCode, orderItemStatuses.code))
      .where(eq(orderItems.orderId, id))
    if (!itemStates.length || itemStates.some((item) => !item.isReceived && !item.isRefunded)) {
      return { ok: false, error: "items_pending" }
    }
  }

  const reason = toNullable(refundReason)
  if (parsed.data === "refund" && !reason) return { ok: false, error: "reason_required" }

  const [row] = await db
    .update(orders)
    .set({
      status: parsed.data,
      ...(parsed.data === "refund" ? { refundReason: reason, refundedAt: new Date() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id))
    .returning({ id: orders.id })

  if (!row) return { ok: false, error: "not_found" }

  revalidateOrders(id)
  return { ok: true, id }
}

export async function setOrderItemStatus(
  orderId: string,
  itemId: string,
  statusCode: string,
  refundReason?: string
): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const [definition] = await db
    .select()
    .from(orderItemStatuses)
    .where(eq(orderItemStatuses.code, statusCode))
    .limit(1)
  if (!definition || !definition.isActive) return { ok: false, error: "invalid" }
  const reason = toNullable(refundReason)
  if (definition.isRefunded && !reason) return { ok: false, error: "reason_required" }

  const [item] = await db
    .update(orderItems)
    .set({
      statusCode,
      ...(definition.isRefunded ? { refundReason: reason, refundedAt: new Date() } : {}),
    })
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)))
    .returning({ id: orderItems.id })
  if (!item) return { ok: false, error: "not_found" }

  const states = await db
    .select({ isRefunded: orderItemStatuses.isRefunded })
    .from(orderItems)
    .leftJoin(orderItemStatuses, eq(orderItems.statusCode, orderItemStatuses.code))
    .where(eq(orderItems.orderId, orderId))
  if (states.length > 0 && states.every((state) => state.isRefunded)) {
    await db.update(orders).set({
      status: "refund",
      refundReason: reason ?? "All items refunded",
      refundedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(orders.id, orderId))
  } else {
    await db.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, orderId))
  }

  revalidateOrders(orderId)
  return { ok: true, id: itemId }
}
