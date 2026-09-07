"use client"

import { useTranslations } from "next-intl"

import { formatBaht } from "@/lib/format"
import type { OrderItemValues } from "@/lib/validations/order"

/**
 * Client-side PREVIEW of the totals the database will compute — same idea
 * as `product-form.tsx`'s margin preview (`sellPrice - originalPrice`
 * recomputed live from `watch()`). Nothing here is persisted: `itemsTotal`/
 * `itemsCost` are trigger-maintained by `recalc_order()` and `totalCost`/
 * `profit` are `GENERATED ALWAYS` columns (drizzle/0001_init_extras.sql) —
 * the real values only exist once the row round-trips through Postgres.
 * The formulas below are written to match those definitions exactly:
 *
 *   itemsTotal = Σ(sellPrice * quantity)
 *   itemsCost  = Σ(productCost * quantity)
 *   totalCost  = itemsCost + shippingCost + packingCost
 *                + advertisingCost
 *   profit     = itemsTotal - totalCost
 *   amountDue  = itemsTotal + shippingCost + packingCost   (display-only —
 *                no DB column backs this; it's what the customer pays)
 */
export function OrderSummary({
  items,
  shippingCost,
  packingCost,
  advertisingCost,
}: {
  items: OrderItemValues[]
  shippingCost: number
  packingCost: number
  advertisingCost: number
}) {
  const t = useTranslations()

  const itemsTotal = items.reduce(
    (sum, item) => sum + Number(item.sellPrice || 0) * Number(item.quantity || 0),
    0
  )
  const itemsCost = items.reduce(
    (sum, item) => sum + Number(item.productCost || 0) * Number(item.quantity || 0),
    0
  )
  const shipping = Number(shippingCost || 0)
  const packing = Number(packingCost || 0)
  const advertising = Number(advertisingCost || 0)
  const totalCost = itemsCost + shipping + packing + advertising
  const profit = itemsTotal - totalCost
  const amountDue = itemsTotal + shipping + packing

  return (
    <section className="space-y-3 border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-body font-bold text-foreground">{t("order.summaryTitle")}</p>
        <p className="text-small text-muted-foreground">{t("order.previewNote")}</p>
      </div>

      <dl className="space-y-1.5 text-body">
        <Row label={t("order.itemsTotal")} value={formatBaht(itemsTotal)} />
        <Row label={t("order.itemsCost")} value={formatBaht(itemsCost)} />
        <Row label={t("order.shippingCost")} value={formatBaht(shipping)} />
        <Row label={t("order.packingCost")} value={formatBaht(packing)} />
        <Row label={t("order.advertisingCost")} value={formatBaht(advertising)} />
        <Row label={t("order.totalCost")} value={formatBaht(totalCost)} />
        <Row label={t("order.amountDue")} value={formatBaht(amountDue)} />
      </dl>

      <div className="flex items-center justify-between bg-accent px-4 py-3 text-accent-foreground">
        <span className="text-body font-medium">{t("order.profit")}</span>
        <span className="text-h4 font-bold">{formatBaht(profit)}</span>
      </div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  )
}
