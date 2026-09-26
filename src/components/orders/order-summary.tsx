"use client"

import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { formatBaht } from "@/lib/format"
import { costVariance, formatVariance } from "@/lib/cost-variance"
import type { OrderItemValues } from "@/lib/validations/order"

/**
 * Client-side PREVIEW of the totals the database will compute. Nothing
 * here is persisted: `itemsTotal`/`itemsCost`/`itemsMasterCost` are
 * trigger-maintained by `recalc_order()`, `preorderShippingCost` by
 * `recalc_preorder_shipping()`, and `totalCost`/`profit` are GENERATED
 * columns (drizzle/0005_preorder_extras.sql). The formulas match those
 * definitions exactly:
 *
 *   itemsTotal       = Σ(sellPrice × quantity)
 *   itemsCost        = Σ(productCost × quantity)      ← ACTUAL cost
 *   itemsMasterCost  = Σ(masterCost × quantity)       ← catalogue cost
 *   totalShipping    = shippingCost + preorderShippingCost
 *   totalCost        = itemsCost + totalShipping + packingCost + advertisingCost
 *   profit           = itemsTotal − totalCost
 *   amountDue        = itemsTotal + shippingCost + packingCost   (display-only)
 *
 * `preorderShippingCost` comes from the SAVED order (its legs are edited in
 * the fulfillment panel, not this form).
 */
export function OrderSummary({
  items,
  shippingCost,
  packingCost,
  advertisingCost,
  preorderShippingCost = 0,
}: {
  items: OrderItemValues[]
  shippingCost: number
  packingCost: number
  advertisingCost: number
  preorderShippingCost?: number
}) {
  const t = useTranslations()

  const sum = (pick: (item: OrderItemValues) => unknown) =>
    items.reduce((total, item) => total + Number(pick(item) || 0) * Number(item.quantity || 0), 0)

  const itemsTotal = sum((item) => item.sellPrice)
  const itemsCost = sum((item) => item.productCost)
  const itemsMasterCost = sum((item) => item.masterCost ?? item.productCost)
  const variance = costVariance(itemsCost, itemsMasterCost)

  const shipping = Number(shippingCost || 0)
  const preorderShipping = Number(preorderShippingCost || 0)
  const totalShipping = shipping + preorderShipping
  const packing = Number(packingCost || 0)
  const advertising = Number(advertisingCost || 0)
  const totalCost = itemsCost + totalShipping + packing + advertising
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
        <div>
          <Row label={t("order.itemsCostActual")} value={formatBaht(itemsCost)} />
          <p className="flex justify-end gap-2 text-small text-muted-foreground">
            <span>
              {t("order.masterCostLabel")} {formatBaht(itemsMasterCost)}
            </span>
            {variance.tone !== "same" && (
              <span
                className={cn(
                  "font-medium tabular-nums",
                  variance.tone === "over" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
                )}
              >
                {formatVariance(variance, formatBaht)}
              </span>
            )}
          </p>
        </div>

        <div className="space-y-1 border-y border-border py-1.5">
          <Row label={t("order.shippingToCustomer")} value={formatBaht(shipping)} muted />
          <Row label={t("order.preorderShippingCost")} value={formatBaht(preorderShipping)} muted />
          <Row label={t("order.totalShippingCost")} value={formatBaht(totalShipping)} strong />
        </div>

        <Row label={t("order.packingCost")} value={formatBaht(packing)} />
        <Row label={t("order.advertisingCost")} value={formatBaht(advertising)} />
        <Row label={t("order.totalCost")} value={formatBaht(totalCost)} strong />
        <Row label={t("order.amountDue")} value={formatBaht(amountDue)} />
      </dl>

      <div className="flex items-center justify-between bg-accent px-4 py-3 text-accent-foreground">
        <span className="text-body font-medium">{t("order.profit")}</span>
        <span className="text-h4 font-bold">{formatBaht(profit)}</span>
      </div>
    </section>
  )
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string
  value: string
  muted?: boolean
  strong?: boolean
}) {
  return (
    <div className={cn("flex items-center justify-between", muted && "pl-3 text-small")}>
      <dt className={cn("text-muted-foreground", strong && "font-bold text-foreground")}>{label}</dt>
      <dd className={cn("tabular-nums text-foreground", strong ? "font-bold" : "font-medium")}>{value}</dd>
    </div>
  )
}
