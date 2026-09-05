import "server-only"

import { count, notInArray } from "drizzle-orm"

import { db } from "@/db"
import { orders, productImages, products, productVariants } from "@/db/schema"
import { monthKey } from "@/lib/format"

/**
 * Port of carstockpro's `services/dashboard.ts`. Keeps its shape exactly:
 * fetch everything once, then aggregate entirely in JS with `Map`s
 * (`lastMonths()` + `monthKey()` bucketing) rather than pushing the
 * aggregation into SQL. Swaps:
 *   - cars -> products, sales -> orders
 *   - brand distribution -> product-type distribution
 *   - alert set -> no photo / no price / no variants / all sizes sold out
 *
 * Business-logic call this file makes that the plan doesn't spell out
 * verbatim: `cancelled` and fully `refund` orders are excluded from every
 * revenue/profit/count aggregate below (neither is fulfilled revenue,
 * fulfilled, so it shouldn't inflate "this month's" numbers). Adjust here
 * if that assumption turns out wrong — it's centralised in `isCountedOrder`.
 */

const MONTHS_OF_HISTORY = 6

type ProductRow = {
  id: string
  status: (typeof products.$inferSelect)["status"]
  productType: string | null
  sellPrice: string
  originalPrice: string
  createdAt: Date
  productCode: string
  productName: string
}

type OrderRow = {
  orderDate: string
  itemsTotal: string
  itemsCost: string
  shippingCost: string
  packingCost: string
  advertisingCost: string
  totalCost: string | null
  profit: string | null
  status: (typeof orders.$inferSelect)["status"]
}

export type MonthPoint = { month: string; value: number }
export type TypeSlice = { type: string; count: number }
export type ProductRef = { id: string; label: string }

export type DashboardData = {
  totalSkus: number
  readyToShipSkus: number
  totalProducts: number
  activeProducts: number
  draftProducts: number
  archivedProducts: number
  totalStockUnits: number
  soldOutVariantCount: number
  totalOrders: number
  totalRevenue: number
  totalProfit: number
  advertisingCost: number
  shippingCost: number
  packagingCost: number
  netProfit: number
  ordersThisMonth: number
  revenueThisMonth: number
  profitThisMonth: number
  /** Sum of `originalPrice * quantity` across non-archived products' variants. */
  inventoryValueAtCost: number
  revenue: number
  profit: number
  avgOrderProfit: number
  monthlyCost: MonthPoint[]
  monthlyProfit: MonthPoint[]
  monthlyOrders: MonthPoint[]
  typeDistribution: TypeSlice[]
  alerts: {
    noPhoto: ProductRef[]
    noPrice: ProductRef[]
    noVariants: ProductRef[]
    allSoldOut: ProductRef[]
  }
}

/** Last N month keys ending with the current month, oldest first. */
function lastMonths(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(monthKey(d))
  }
  return out
}

export async function getDashboardData(): Promise<DashboardData> {
  const [productRows, imageCountRows, variantRows, orderRows] = await Promise.all([
    db
      .select({
        id: products.id,
        status: products.status,
        productType: products.productType,
        sellPrice: products.sellPrice,
        originalPrice: products.originalPrice,
        createdAt: products.createdAt,
        productCode: products.productCode,
        productName: products.productName,
      })
      .from(products),
    db
      .select({ productId: productImages.productId, value: count(productImages.id) })
      .from(productImages)
      .groupBy(productImages.productId),
    db
      .select({
        productId: productVariants.productId,
        quantity: productVariants.quantity,
      })
      .from(productVariants),
    db
      .select({
        orderDate: orders.orderDate,
        itemsTotal: orders.itemsTotal,
        itemsCost: orders.itemsCost,
        shippingCost: orders.shippingCost,
        packingCost: orders.packingCost,
        advertisingCost: orders.advertisingCost,
        totalCost: orders.totalCost,
        profit: orders.profit,
        status: orders.status,
      })
      .from(orders)
      .where(notInArray(orders.status, ["cancelled", "refund"])),
  ])

  const productsList: ProductRow[] = productRows
  // Already filtered to exclude cancelled/full-refund orders in SQL above.
  const countedOrders: OrderRow[] = orderRows

  const imageCountByProduct = new Map(imageCountRows.map((r) => [r.productId, r.value]))
  const variantsByProduct = new Map<string, { quantity: number }[]>()
  for (const v of variantRows) {
    const bucket = variantsByProduct.get(v.productId)
    if (bucket) bucket.push({ quantity: v.quantity })
    else variantsByProduct.set(v.productId, [{ quantity: v.quantity }])
  }

  const activeProducts = productsList.filter((p) => p.status === "active")
  const draftProducts = productsList.filter((p) => p.status === "draft")
  const archivedProducts = productsList.filter((p) => p.status === "archived")
  const nonArchivedProducts = productsList.filter((p) => p.status !== "archived")

  const allVariants = [...variantsByProduct.values()].flat()
  const totalStockUnits = allVariants.reduce((sum, v) => sum + v.quantity, 0)
  const soldOutVariantCount = allVariants.filter((v) => v.quantity <= 0).length
  const readyToShipSkus = allVariants.filter((v) => v.quantity > 0).length

  const inventoryValueAtCost = nonArchivedProducts.reduce((sum, p) => {
    const variants = variantsByProduct.get(p.id) ?? []
    const productUnits = variants.reduce((s, v) => s + v.quantity, 0)
    return sum + Number(p.originalPrice) * productUnits
  }, 0)

  const revenue = countedOrders.reduce((s, o) => s + Number(o.itemsTotal || 0), 0)
  const grossProfit = countedOrders.reduce(
    (s, o) => s + Number(o.itemsTotal || 0) - Number(o.itemsCost || 0),
    0
  )
  const netProfit = countedOrders.reduce((s, o) => s + Number(o.profit || 0), 0)
  const advertisingCost = countedOrders.reduce((s, o) => s + Number(o.advertisingCost || 0), 0)
  const shippingCost = countedOrders.reduce((s, o) => s + Number(o.shippingCost || 0), 0)
  const packagingCost = countedOrders.reduce((s, o) => s + Number(o.packingCost || 0), 0)
  const avgOrderProfit = countedOrders.length ? netProfit / countedOrders.length : 0

  const thisMonth = monthKey(new Date())
  const monthOrders = countedOrders.filter((o) => monthKey(o.orderDate) === thisMonth)
  const ordersThisMonth = monthOrders.length
  const revenueThisMonth = monthOrders.reduce((s, o) => s + Number(o.itemsTotal || 0), 0)
  const profitThisMonth = monthOrders.reduce((s, o) => s + Number(o.profit || 0), 0)

  const months = lastMonths(MONTHS_OF_HISTORY)
  const costByMonth = new Map(months.map((m) => [m, 0]))
  const profitByMonth = new Map(months.map((m) => [m, 0]))
  const ordersByMonth = new Map(months.map((m) => [m, 0]))
  for (const o of countedOrders) {
    const m = monthKey(o.orderDate)
    if (!costByMonth.has(m)) continue
    costByMonth.set(m, (costByMonth.get(m) ?? 0) + Number(o.totalCost || 0))
    profitByMonth.set(m, (profitByMonth.get(m) ?? 0) + Number(o.profit || 0))
    ordersByMonth.set(m, (ordersByMonth.get(m) ?? 0) + 1)
  }

  const label = (m: string) => m.slice(5) // "MM"
  const monthlyCost = months.map((m) => ({ month: label(m), value: costByMonth.get(m) ?? 0 }))
  const monthlyProfit = months.map((m) => ({ month: label(m), value: profitByMonth.get(m) ?? 0 }))
  const monthlyOrders = months.map((m) => ({ month: label(m), value: ordersByMonth.get(m) ?? 0 }))

  const typeMap = new Map<string, number>()
  for (const p of activeProducts) {
    const t = p.productType?.trim() || "-"
    typeMap.set(t, (typeMap.get(t) ?? 0) + 1)
  }
  const typeDistribution = [...typeMap.entries()]
    .map(([type, value]) => ({ type, count: value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const ref = (p: ProductRow): ProductRef => ({
    id: p.id,
    label: `${p.productName} · ${p.productCode}`,
  })
  const alerts = {
    noPhoto: activeProducts
      .filter((p) => (imageCountByProduct.get(p.id) ?? 0) === 0)
      .map(ref),
    noPrice: activeProducts.filter((p) => Number(p.sellPrice) <= 0).map(ref),
    noVariants: activeProducts
      .filter((p) => (variantsByProduct.get(p.id)?.length ?? 0) === 0)
      .map(ref),
    allSoldOut: activeProducts
      .filter((p) => {
        const variants = variantsByProduct.get(p.id) ?? []
        return variants.length > 0 && variants.every((v) => v.quantity <= 0)
      })
      .map(ref),
  }

  return {
    totalSkus: allVariants.length,
    readyToShipSkus,
    totalProducts: productsList.length,
    activeProducts: activeProducts.length,
    draftProducts: draftProducts.length,
    archivedProducts: archivedProducts.length,
    totalStockUnits,
    soldOutVariantCount,
    totalOrders: countedOrders.length,
    totalRevenue: revenue,
    totalProfit: grossProfit,
    advertisingCost,
    shippingCost,
    packagingCost,
    netProfit,
    ordersThisMonth,
    revenueThisMonth,
    profitThisMonth,
    inventoryValueAtCost,
    revenue,
    profit: netProfit,
    avgOrderProfit,
    monthlyCost,
    monthlyProfit,
    monthlyOrders,
    typeDistribution,
    alerts,
  }
}
