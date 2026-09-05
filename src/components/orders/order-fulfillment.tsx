"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import type { OrderStatusValue } from "@/db/queries/orders"
import type { OrderItemStatusDefinition } from "@/db/queries/settings"
import { setOrderItemStatus, setOrderStatus } from "@/app/[locale]/admin/orders/actions"
import { useRouter } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { SimpleSelect } from "@/components/ui/simple-select"

type FulfillmentItem = {
  id: string
  productCode: string
  productName: string
  color: string | null
  size: string | null
  statusCode: string
  refundReason: string | null
}

export function OrderFulfillment({
  orderId,
  orderStatus,
  items,
  statuses,
  locale,
}: {
  orderId: string
  orderStatus: OrderStatusValue
  items: FulfillmentItem[]
  statuses: OrderItemStatusDefinition[]
  locale: string
}) {
  const t = useTranslations("order")
  const router = useRouter()
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
    router.refresh()
  }

  async function moveToPackaging() {
    setWorking("order")
    const result = await setOrderStatus(orderId, "packaging")
    setWorking(null)
    if (!result.ok) {
      toast.error(result.error === "items_pending" ? t("itemsPending") : t("fulfillmentFailed"))
      return
    }
    toast.success(t("statusUpdated"))
    router.refresh()
  }

  return (
    <section className="border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">{t("fulfillment")}</h2>
          <p className="text-small text-muted-foreground">{t("fulfillmentHint")}</p>
        </div>
        {allResolved && !["packaging", "shipping", "complete", "cancelled", "refund"].includes(orderStatus) && (
          <Button onClick={moveToPackaging} disabled={working !== null}>{t("moveToPackaging")}</Button>
        )}
      </div>

      {allResolved && (
        <p className="mt-3 border border-[var(--pastel-green)] bg-[color-mix(in_srgb,var(--pastel-green)_15%,transparent)] p-3 text-small font-medium">
          {t("allItemsResolved")}
        </p>
      )}

      <div className="mt-4 divide-y divide-border">
        {items.map((item) => {
          const options = statuses.filter((status) => status.isActive || status.code === item.statusCode)
          return (
            <div key={item.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_240px] sm:items-center">
              <div>
                <p className="font-medium">{item.productName}</p>
                <p className="text-small text-muted-foreground">
                  {item.productCode}{[item.color, item.size].filter(Boolean).length ? ` · ${[item.color, item.size].filter(Boolean).join(" / ")}` : ""}
                </p>
                {item.refundReason && <p className="mt-1 text-small text-destructive">{t("refundReason")}: {item.refundReason}</p>}
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
            </div>
          )
        })}
      </div>
    </section>
  )
}
