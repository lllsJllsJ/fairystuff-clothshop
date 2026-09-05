"use server"

import { and, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import { orderItems, orderItemStatuses, orders, products, productVariants } from "@/db/schema"
import { getCurrentUser } from "@/lib/auth-helpers"
import { isCustomer } from "@/lib/roles"
import { getShopSettings } from "@/db/queries/settings"
import { checkoutSchema, type CheckoutInput } from "@/lib/validations/checkout"
import { routing } from "@/i18n/routing"

export type CheckoutResult =
  | { ok: true; id: string; orderNo: number }
  | { ok: false; error: "unauthorized" | "invalid" | "cart_changed" | "contact_missing" | "failed" }

export async function submitCheckout(values: CheckoutInput): Promise<CheckoutResult> {
  const user = await getCurrentUser()
  if (!user || !isCustomer(user.role) || !user.email) return { ok: false, error: "unauthorized" }
  const parsed = checkoutSchema.safeParse(values)
  if (!parsed.success) return { ok: false, error: "invalid" }
  const v = parsed.data

  const existing = await db.select({ id: orders.id, orderNo: orders.orderNo })
    .from(orders).where(and(eq(orders.checkoutKey, v.checkoutKey), eq(orders.customerId, user.id))).limit(1)
  if (existing[0]) return { ok: true, ...existing[0] }

  const settings = await getShopSettings()
  if (!settings.lineId && !settings.instagramHandle) return { ok: false, error: "contact_missing" }

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

  try {
    const result = await db.transaction(async (tx) => {
      const [order] = await tx.insert(orders).values({
        customerName: user.name || user.email!,
        customerEmail: user.email,
        customerPhone: v.customerPhone,
        customerAddress: v.customerAddress,
        customerId: user.id,
        checkoutKey: v.checkoutKey,
        status: "new",
        note: v.note || null,
        createdBy: user.id,
      }).returning({ id: orders.id, orderNo: orders.orderNo })
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
        quantity: item.quantity,
        statusCode: defaultStatuses[0]?.code ?? "not_ordered",
        sortOrder: index,
      })))
      return order
    })
    for (const locale of routing.locales) {
      revalidatePath(`/${locale}/admin/orders`)
      revalidatePath(`/${locale}/account/orders`)
    }
    return { ok: true, ...result }
  } catch (error) {
    const retry = await db.select({ id: orders.id, orderNo: orders.orderNo })
      .from(orders).where(and(eq(orders.checkoutKey, v.checkoutKey), eq(orders.customerId, user.id))).limit(1)
    if (retry[0]) return { ok: true, ...retry[0] }
    console.error("submitCheckout failed", error)
    return { ok: false, error: "failed" }
  }
}
