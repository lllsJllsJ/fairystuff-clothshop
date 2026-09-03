"use server"

import { eq } from "drizzle-orm"
import { z } from "zod"

import { db, txDb } from "@/db"
import { orderItems, orderStatus, orders } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth-helpers"
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
 * ORDER ITEMS HAVE NO CLIENT-SIDE IDENTITY — this diverges from
 * `updateProduct`'s variant handling on purpose
 * ---------------------------------------------------------------------
 * `productVariantSchema` (validations/product.ts) carries an optional
 * `id` so `updateProduct` can delta-match: update existing rows by id,
 * delete the ones dropped, insert the ones without an id. `orderItemSchema`
 * (validations/order.ts — not a file this phase owns, so it is used
 * as-is) has NO `id` field at all. There is nothing to delta-match
 * against, so `updateOrder` instead deletes every existing `order_items`
 * row for the order and reinserts the submitted set fresh, inside the
 * same transaction. This sidesteps the primary-key-vs-arbiter trap Phase 3
 * hit entirely (there are no pre-existing ids being re-sent) and is the
 * correct behavior for this schema shape, not a shortcut around it — see
 * the phase report for the fuller reasoning.
 *
 * ---------------------------------------------------------------------
 * GENERATED / TRIGGER-MAINTAINED COLUMNS — never write these
 * ---------------------------------------------------------------------
 * `orders.totalCost`, `orders.profit`, `orderItems.lineTotal`, and
 * `orderItems.lineCost` are `GENERATED ALWAYS AS (...) STORED` (added by
 * drizzle/0000_init_extras.sql). Postgres rejects a write that names them
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
    productCode: item.productCode,
    productName: item.productName,
    productType: toNullable(item.productType),
    color: toNullable(item.color),
    size: toNullable(item.size),
    productCost: toMoney(Number(item.productCost)),
    sellPrice: toMoney(Number(item.sellPrice)),
    quantity: Number(item.quantity),
    sortOrder: i,
  }))
}

export async function createOrder(values: OrderFormValues): Promise<OrderResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsed = orderFormSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const v = parsed.data

  let insertedId: string
  try {
    insertedId = await txDb().transaction(async (tx) => {
      const [row] = await tx
        .insert(orders)
        .values({
          orderDate: v.orderDate,
          customerName: v.customerName,
          customerAddress: toNullable(v.customerAddress),
          customerPhone: toNullable(v.customerPhone),
          shippingCost: toMoney(v.shippingCost),
          packingCost: toMoney(v.packingCost),
          status: v.status,
          note: toNullable(v.note),
          createdBy: user.id,
        })
        .returning({ id: orders.id })

      if (!row) throw new Error("insert_failed")

      await tx.insert(orderItems).values(toItemRows(v.items, row.id))

      return row.id
    })
  } catch (error) {
    console.error("createOrder failed", error)
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

  try {
    await txDb().transaction(async (tx) => {
      const [updatedRow] = await tx
        .update(orders)
        .set({
          orderDate: v.orderDate,
          customerName: v.customerName,
          customerAddress: toNullable(v.customerAddress),
          customerPhone: toNullable(v.customerPhone),
          shippingCost: toMoney(v.shippingCost),
          packingCost: toMoney(v.packingCost),
          status: v.status,
          note: toNullable(v.note),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id))
        .returning({ id: orders.id })

      if (!updatedRow) throw new Error("not_found")

      // Full replace — see the file header's "ORDER ITEMS HAVE NO
      // CLIENT-SIDE IDENTITY" note for why this is delete-all + insert-all
      // rather than update-existing-by-id.
      await tx.delete(orderItems).where(eq(orderItems.orderId, id))
      await tx.insert(orderItems).values(toItemRows(v.items, id))
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

export async function setOrderStatus(id: string, status: string): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  if (!isOwner(user.role)) return { ok: false, error: "forbidden" }

  const parsed = z.enum(orderStatus.enumValues).safeParse(status)
  if (!parsed.success) return { ok: false, error: "invalid" }

  const [row] = await db
    .update(orders)
    .set({ status: parsed.data, updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning({ id: orders.id })

  if (!row) return { ok: false, error: "not_found" }

  revalidateOrders(id)
  return { ok: true, id }
}
