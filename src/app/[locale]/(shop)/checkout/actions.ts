"use server"

import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import { orderItems, orderItemStatuses, orders, products, productVariants } from "@/db/schema"
import { isUniqueViolation } from "@/lib/db-errors"
import { getShopSettings } from "@/db/queries/settings"
import { generatePreorderCode } from "@/lib/preorder-code"
import { checkoutSchema, type CheckoutInput } from "@/lib/validations/checkout"
import { routing } from "@/i18n/routing"

/**
 * Guest checkout — no account required. `"unauthorized"` is deliberately
 * NOT in this error union: keeping a stale error string around would leave
 * dead branches in every caller with no compiler signal, whereas removing it
 * makes `tsc` point at every place that still handled it (see plan). This
 * action re-resolves products/variants/prices server-side and never trusts
 * the client's cart snapshot for anything but which items and quantities
 * were requested.
 */
export type CheckoutResult =
  | { ok: true; id: string; orderNo: number; preorderCode: string }
  | { ok: false; error: "invalid" | "cart_changed" | "contact_missing" | "failed" }

/** A 23505 aborts the whole Postgres transaction — see preorder-code.ts's
 * header. The retry re-runs the ENTIRE transaction with a fresh code, never
 * just the insert statement on an already-aborted `tx`. */
const MAX_PREORDER_CODE_ATTEMPTS = 3

export async function submitCheckout(values: CheckoutInput): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const v = parsed.data
  const customerName = `${v.customerFirstName} ${v.customerLastName}`.trim()

  // Idempotency keys on `checkoutKey` ALONE now that there is no account to
  // additionally scope it by — the partial unique index on a non-null
  // `checkout_key` (schema.ts) already enforces global uniqueness, so the
  // old `eq(orders.customerId, user.id)` half was never load-bearing at the
  // database level; it only narrowed which row a signed-in customer's retry
  // could see.
  const existing = await db.select({ id: orders.id, orderNo: orders.orderNo, preorderCode: orders.preorderCode })
    .from(orders).where(eq(orders.checkoutKey, v.checkoutKey)).limit(1)
  if (existing[0]) return { ok: true, ...existing[0] }

  const settings = await getShopSettings()
  if (!settings.lineId && !settings.instagramHandle && !settings.facebookUrl) return { ok: false, error: "contact_missing" }

  const productIds = [...new Set(v.items.map((item) => item.productId))]
  const [productRows, variantRows, defaultStatuses] = await Promise.all([
    db.select().from(products).where(and(inArray(products.id, productIds), eq(products.status, "active"))),
    db.select().from(productVariants).where(inArray(productVariants.productId, productIds)),
    db.select({ code: orderItemStatuses.code }).from(orderItemStatuses).where(eq(orderItemStatuses.isDefault, true)).limit(1),
  ])
  const productMap = new Map(productRows.map((product) => [product.id, product]))
  const variantMap = new Map(variantRows.map((variant) => [variant.id, variant]))
  const variantsByProduct = new Map<string, number>()
  for (const variant of variantRows) variantsByProduct.set(variant.productId, (variantsByProduct.get(variant.productId) ?? 0) + 1)

  const resolved: Array<{
    item: (typeof v.items)[number]
    product: (typeof productRows)[number]
    variant: (typeof variantRows)[number] | null
  }> = []
  for (const item of v.items) {
    const product = productMap.get(item.productId)
    if (!product || Number(product.sellPrice) !== Number(item.expectedSellPrice)) return { ok: false, error: "cart_changed" }
    const variant = item.productVariantId ? (variantMap.get(item.productVariantId) ?? null) : null
    if (item.productVariantId && (!variant || variant.productId !== product.id)) return { ok: false, error: "cart_changed" }
    if (!item.productVariantId && (variantsByProduct.get(product.id) ?? 0) > 0) return { ok: false, error: "cart_changed" }
    resolved.push({ item, product, variant })
  }

  for (let attempt = 0; attempt < MAX_PREORDER_CODE_ATTEMPTS; attempt += 1) {
    const preorderCode = generatePreorderCode()
    try {
      const result = await db.transaction(async (tx) => {
        const [order] = await tx.insert(orders).values({
          customerName,
          customerPhone: v.customerPhone,
          customerAddress: v.customerAddress,
          preorderCode,
          checkoutKey: v.checkoutKey,
          // Lifecycle invariant (see CLAUDE.md): a guest order always lands
          // in "new" and nothing here advances it automatically — the owner
          // accepts it by hand from the admin order list.
          status: "new",
          note: v.note || null,
        }).returning({ id: orders.id, orderNo: orders.orderNo, preorderCode: orders.preorderCode })
        if (!order) throw new Error("insert_failed")
        await tx.insert(orderItems).values(resolved.map(({ item, product, variant }, index) => ({
          orderId: order.id,
          productId: product.id,
          productVariantId: variant?.id ?? null,
          productCode: product.productCode,
          productName: product.productName,
          productType: product.productType,
          color: variant?.color && variant.color !== "-" ? variant.color : null,
          size: variant?.size ?? null,
          productCost: product.originalPrice,
          sellPrice: product.sellPrice,
          // Lead-time snapshot (see schema.ts's comment on orderItems) — a
          // later edit to the product's preorder window must never rewrite
          // this order's estimate.
          preorderMinDays: product.preorderMinDays,
          preorderMaxDays: product.preorderMaxDays,
          quantity: item.quantity,
          statusCode: defaultStatuses[0]?.code ?? "not_ordered",
          sortOrder: index,
        })))
        return order
      })
      for (const locale of routing.locales) {
        revalidatePath(`/${locale}/admin/orders`)
      }
      return { ok: true, ...result }
    } catch (error) {
      if (isUniqueViolation(error, "orders_preorder_code_unique")) continue
      if (isUniqueViolation(error, "orders_checkout_key_idx")) {
        const retry = await db.select({ id: orders.id, orderNo: orders.orderNo, preorderCode: orders.preorderCode })
          .from(orders).where(eq(orders.checkoutKey, v.checkoutKey)).limit(1)
        if (retry[0]) return { ok: true, ...retry[0] }
      }
      console.error("submitCheckout failed", error)
      return { ok: false, error: "failed" }
    }
  }
  console.error("submitCheckout failed: exhausted preorder code retries")
  return { ok: false, error: "failed" }
}
