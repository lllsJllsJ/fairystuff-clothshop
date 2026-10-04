import "server-only"

import { and, asc, count, desc, eq, gte, lte, max, ne, notInArray, sql, sum } from "drizzle-orm"

import { db } from "@/db"
import {
  orderItems,
  orderStatus,
  orders,
  productStatus,
  products,
  productVariants,
} from "@/db/schema"
import type { ProductAudience } from "@/lib/product-taxonomy"

/**
 * Port of carstockpro's `services/reports.ts`. `ReportSaleRow` ->
 * `ReportOrderRow`; adds an inventory report over products + variants and
 * a profit-by-product report.
 *
 * IMPORTANT (plan Risk 4): `profitByProduct` groups on `orderItems.productCode`
 * — the value SNAPSHOTTED on the order at sale time — never on
 * `orderItems.productId`. `productId` is `on delete set null`, so a
 * deleted product's history would otherwise silently vanish from this
 * report the moment the product row is removed. Grouping on the snapshot
 * means historical profit survives the product being deleted, renamed, or
 * re-typed later — which is the whole point of snapshotting in the first
 * place.
 *
 * Same cancelled/full-refund exclusion as `queries/dashboard.ts`: neither
 * should appear as fulfilled revenue/profit.
 */

export type OrderStatusValue = (typeof orderStatus.enumValues)[number]
export type ProductStatusValue = (typeof productStatus.enumValues)[number]

export type ReportOrderRow = {
  id: string
  orderNo: number
  orderDate: string
  customerName: string
  itemsTotal: number
  itemsCost: number
  /** Catalogue cost of the same lines — itemsCost minus this is how far the
   * actual supplier prices drifted from the master. */
  itemsMasterCost: number
  shippingCost: number
  /** Inbound preorder legs (CN->CN, CN->TH, TH->TH). */
  preorderShippingCost: number
  packingCost: number
  advertisingCost: number
  totalCost: number
  profit: number
  status: OrderStatusValue
}

export type ReportInventoryRow = {
  id: string
  productCode: string
  productName: string
  productType: string | null
  status: ProductStatusValue
  sellPrice: number
  originalPrice: number
  audience: ProductAudience
  kind: "single" | "set" | "fullset"
  /** Preorder shop: orderable colour x size combinations, not units. */
  availableVariants: number
  totalVariants: number
}

export type ReportProfitByProductRow = {
  productCode: string
  productName: string
  totalQuantity: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  /** Σ (regularPrice − sellPrice) × qty over lines sold at a discount. */
  totalDiscount: number
}

export type ReportsData = {
  orders: ReportOrderRow[]
  inventory: ReportInventoryRow[]
  profitByProduct: ReportProfitByProductRow[]
}

export type ReportsParams = {
  /** Inclusive ISO `yyyy-mm-dd` bounds on `orders.orderDate`. Applies to
   * `orders` and `profitByProduct`; `inventory` is a point-in-time
   * snapshot and ignores the date range. */
  dateFrom?: string
  dateTo?: string
}

export async function getReportsData(params: ReportsParams = {}): Promise<ReportsData> {
  const { dateFrom, dateTo } = params

  const dateConditions = [notInArray(orders.status, ["cancelled", "refund"])]
  if (dateFrom) dateConditions.push(gte(orders.orderDate, dateFrom))
  if (dateTo) dateConditions.push(lte(orders.orderDate, dateTo))
  const orderWhere = and(...dateConditions)!

  const [orderRows, inventoryRows, variantSums, profitRows] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        orderDate: orders.orderDate,
        customerName: orders.customerName,
        itemsTotal: orders.itemsTotal,
        itemsCost: orders.itemsCost,
        itemsMasterCost: orders.itemsMasterCost,
        shippingCost: orders.shippingCost,
        preorderShippingCost: orders.preorderShippingCost,
        packingCost: orders.packingCost,
        advertisingCost: orders.advertisingCost,
        totalCost: orders.totalCost,
        profit: orders.profit,
        status: orders.status,
      })
      .from(orders)
      .where(orderWhere)
      .orderBy(desc(orders.orderDate)),
    db
      .select({
        id: products.id,
        productCode: products.productCode,
        productName: products.productName,
        productType: products.productType,
        audience: products.audience,
        kind: products.kind,
        status: products.status,
        sellPrice: products.sellPrice,
        originalPrice: products.originalPrice,
      })
      .from(products)
      .where(ne(products.status, "archived")),
    db
      .select({
        productId: productVariants.productId,
        totalVariants: count(productVariants.id),
        availableVariants: sql<number>`count(*) filter (where ${productVariants.isAvailable})`,
      })
      .from(productVariants)
      .groupBy(productVariants.productId),
    db
      .select({
        productCode: orderItems.productCode,
        productName: max(orderItems.productName),
        totalQuantity: sum(orderItems.quantity),
        totalRevenue: sum(orderItems.lineTotal),
        totalCost: sum(orderItems.lineCost),
        totalDiscount: sql<string>`coalesce(sum((${orderItems.regularPrice} - ${orderItems.sellPrice}) * ${orderItems.quantity}) filter (where ${orderItems.regularPrice} is not null), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(orderWhere)
      .groupBy(orderItems.productCode)
      .orderBy(asc(orderItems.productCode)),
  ])

  const reportOrders: ReportOrderRow[] = orderRows.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    orderDate: o.orderDate,
    customerName: o.customerName,
    itemsTotal: Number(o.itemsTotal),
    itemsCost: Number(o.itemsCost),
    itemsMasterCost: Number(o.itemsMasterCost),
    shippingCost: Number(o.shippingCost),
    preorderShippingCost: Number(o.preorderShippingCost),
    packingCost: Number(o.packingCost),
    advertisingCost: Number(o.advertisingCost),
    totalCost: Number(o.totalCost ?? 0),
    profit: Number(o.profit ?? 0),
    status: o.status,
  }))

  const variantsByProduct = new Map(variantSums.map((v) => [v.productId, v]))

  const inventory: ReportInventoryRow[] = inventoryRows.map((p) => {
    const variants = variantsByProduct.get(p.id)
    return {
      id: p.id,
      productCode: p.productCode,
      productName: p.productName,
      productType: p.productType,
      status: p.status,
      sellPrice: Number(p.sellPrice),
      originalPrice: Number(p.originalPrice),
      audience: p.audience,
      kind: p.kind,
      availableVariants: Number(variants?.availableVariants ?? 0),
      totalVariants: Number(variants?.totalVariants ?? 0),
    }
  })

  const profitByProduct: ReportProfitByProductRow[] = profitRows.map((r) => ({
    productCode: r.productCode,
    productName: r.productName ?? r.productCode,
    totalQuantity: Number(r.totalQuantity ?? 0),
    totalRevenue: Number(r.totalRevenue ?? 0),
    totalCost: Number(r.totalCost ?? 0),
    totalProfit: Number(r.totalRevenue ?? 0) - Number(r.totalCost ?? 0),
    totalDiscount: Number(r.totalDiscount ?? 0),
  }))

  return { orders: reportOrders, inventory, profitByProduct }
}
