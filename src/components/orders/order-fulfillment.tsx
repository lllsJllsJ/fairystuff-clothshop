"use client"

import { useState } from "react"
import Image from "next/image"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { ArrowUpRight, CircleDollarSign, ImageOff } from "lucide-react"

import type { OrderItemSourcing, OrderStatusValue, PreorderShipmentRow } from "@/db/queries/orders"
import type { OrderItemStatusDefinition } from "@/db/queries/settings"
import { setOrderItemStatus, setOrderStatus } from "@/app/[locale]/admin/orders/actions"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { SimpleSelect } from "@/components/ui/simple-select"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { ItemPreorderShipments, ShippingCostTotals } from "@/components/orders/preorder-shipments"

type FulfillmentItem = {
  id: string
  productCode: string
  productName: string
  color: string | null
  size: string | null
  statusCode: string
  refundReason: string | null
}

/** Only http(s) links are rendered — sourceLink is free text from the
 * editor/import, and a `javascript:` value must never become an href. */
function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export function OrderFulfillment({
  orderId,
  orderStatus,
  orderStatusLabel,
  items,
  sourcing = {},
  statuses,
  shipments,
  customerShippingCost,
  locale,
}: {
  orderId: string
  orderStatus: OrderStatusValue
  orderStatusLabel: string
  items: FulfillmentItem[]
  /** Admin-only photo + supplier link per line, keyed by item id. */
  sourcing?: Record<string, OrderItemSourcing>
  statuses: OrderItemStatusDefinition[]
  shipments: PreorderShipmentRow[]
  customerShippingCost: number
  locale: string
}) {
  const t = useTranslations("order")
  const router = useRouter()
  const queryClient = useQueryClient()
  const [working, setWorking] = useState<string | null>(null)
  const statusMap = new Map(statuses.map((status) => [status.code, status]))
  const allResolved = items.length > 0 && items.every((item) => {
    const definition = statusMap.get(item.statusCode)
    return !!definition && (definition.isReceived || definition.isRefunded)
  })

  async function changeItem(item: FulfillmentItem, statusCode: string) {
    const definition = statusMap.get(statusCode)
    let reason: string | undefined
    if (definition?.isRefunded) {
      reason = window.prompt(t("refundReasonPrompt"))?.trim() || undefined
      if (!reason) return
    }
    setWorking(item.id)
    const result = await setOrderItemStatus(orderId, item.id, statusCode, reason)
    setWorking(null)
    if (!result.ok) {
      toast.error(result.error === "reason_required" ? t("refundReasonRequired") : t("fulfillmentFailed"))
      return
    }
    toast.success(t("statusUpdated"))
    // Same client-cache staleness as the order form: the list at
    // /admin/orders reads TanStack Query, which router.refresh() does not
    // touch. See the long note in order-form.tsx#onSubmit.
    await queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
    router.refresh()
  }

  // A line's shipments block appears once it's being bought from a supplier
  // (a status flagged is_preorder: 1688, Taobao, …) — and stays if parcels
  // were already logged, so switching the line back never hides data.
  const shipmentsFor = (itemId: string) => shipments.filter((row) => row.orderItemId === itemId)
  const showShipmentsFor = (item: FulfillmentItem) =>
    shipmentsFor(item.id).length > 0 || !!statusMap.get(item.statusCode)?.isPreorder
  const preorderShippingCost = shipments.reduce((sum, row) => sum + Number(row.cost), 0)

  async function moveTo(status: "packaging" | "accepted") {
    setWorking("order")
    const result = await setOrderStatus(orderId, status)
    setWorking(null)
    if (!result.ok) {
      toast.error(result.error === "items_pending" ? t("itemsPending") : t("fulfillmentFailed"))
      return
    }
    toast.success(t("statusUpdated"))
    // Same client-cache staleness as the order form: the list at
    // /admin/orders reads TanStack Query, which router.refresh() does not
    // touch. See the long note in order-form.tsx#onSubmit.
    await queryClient.invalidateQueries({ queryKey: ["admin-orders"] })
    router.refresh()
  }

  return (
    <section className="border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 font-bold">
            {t("fulfillment")}
            <span className="text-small font-normal">
              <OrderStatusBadge status={orderStatus} label={orderStatusLabel} />
            </span>
          </h2>
          <p className="text-small text-muted-foreground">{t("fulfillmentHint")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {orderStatus === "new" && (
            <Button variant="outline" onClick={() => moveTo("accepted")} disabled={working !== null}>
              <CircleDollarSign />
              {t("markAsPaid")}
            </Button>
          )}
          {allResolved && !["packaging", "shipping", "complete", "cancelled", "refund"].includes(orderStatus) && (
            <Button onClick={() => moveTo("packaging")} disabled={working !== null}>{t("moveToPackaging")}</Button>
          )}
        </div>
      </div>

      {allResolved && (
        <p className="mt-3 border border-[var(--pastel-green)] bg-[color-mix(in_srgb,var(--pastel-green)_15%,transparent)] p-3 text-small font-medium">
          {t("allItemsResolved")}
        </p>
      )}

      <div className="mt-4 divide-y divide-border">
        {items.map((item) => {
          const options = statuses.filter((status) => status.isActive || status.code === item.statusCode)
          const source = sourcing[item.id]
          const sourceHref = safeHttpUrl(source?.sourceLink)
          return (
            <div key={item.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_240px] sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative size-16 shrink-0 overflow-hidden border border-border bg-muted">
                  {source?.imageUrl ? (
                    <Image src={source.imageUrl} alt={item.productName} fill sizes="64px" className="object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground" aria-label={t("noPhoto")}>
                      <ImageOff className="size-5" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                <p className="font-medium">{item.productName}</p>
                <p className="text-small text-muted-foreground">
                  {item.productCode}{[item.color, item.size].filter(Boolean).length ? ` · ${[item.color, item.size].filter(Boolean).join(" / ")}` : ""}
                </p>
                {item.refundReason && <p className="mt-1 text-small text-destructive">{t("refundReason")}: {item.refundReason}</p>}
                </div>
                {sourceHref ? (
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    render={<a href={sourceHref} target="_blank" rel="noopener noreferrer" />}
                    nativeButton={false}
                    aria-label={source?.buyingSource ? t("openSourceAt", { source: source.buyingSource }) : t("openSource")}
                    title={source?.buyingSource ? t("openSourceAt", { source: source.buyingSource }) : t("openSource")}
                  >
                    <ArrowUpRight />
                  </Button>
                ) : (
                  <span className="shrink-0 text-small text-muted-foreground">{t("noSourceLink")}</span>
                )}
              </div>
              <SimpleSelect
                value={item.statusCode}
                disabled={working === item.id}
                onValueChange={(value) => changeItem(item, value)}
                options={options.map((status) => ({
                  value: status.code,
                  label: locale === "en" ? status.labelEn : status.labelTh,
                }))}
              />
              {showShipmentsFor(item) && (
                <div className="sm:col-span-2">
                  <ItemPreorderShipments
                    orderId={orderId}
                    orderItemId={item.id}
                    shipments={shipmentsFor(item.id)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {(shipments.length > 0 || items.some(showShipmentsFor)) && (
        <ShippingCostTotals
          preorderShippingCost={preorderShippingCost}
          customerShippingCost={customerShippingCost}
        />
      )}
    </section>
  )
}
