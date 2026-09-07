import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { getOrderById } from "@/db/queries/orders"
import { getProductTypes } from "@/db/queries/product-types"
import { OrderForm } from "@/components/orders/order-form"
import { OrderReceipt } from "@/components/orders/order-receipt"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { PrintOrderButton } from "@/components/orders/print-order-button"
import { OrderFulfillment } from "@/components/orders/order-fulfillment"
import { BackLink } from "@/components/layout/back-link"
import { getOrderItemStatuses, getOrderStatusLabels } from "@/db/queries/settings"
import { DEFAULT_ADMIN_STATUS_LABELS } from "@/lib/order-status"

/**
 * Detail + edit + print, all on one route (task spec). `OrderForm` in edit
 * mode (pre-filled from `order`) IS the detail/edit view — there's no
 * separate read-only display, matching how `admin/products/[id]/edit`
 * doesn't have a standalone products detail page either. Printing is
 * layered on top with Tailwind's `print:` variant: `OrderReceipt` is
 * `hidden print:block` (a clean, non-interactive receipt), the edit form
 * below is wrapped `print:hidden` — so printing the page shows the receipt
 * only, never the form's inputs/buttons.
 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { id, locale } = await params
  const t = await getTranslations()

  const [order, types, itemStatuses, statusLabels] = await Promise.all([
    getOrderById(id),
    getProductTypes(),
    getOrderItemStatuses(),
    getOrderStatusLabels(),
  ])
  if (!order) notFound()
  const customStatus = statusLabels.find((item) => item.status === order.status)
  const statusLabel =
    locale === "en"
      ? (customStatus?.labelEn ?? DEFAULT_ADMIN_STATUS_LABELS[order.status].en)
      : (customStatus?.labelTh ?? DEFAULT_ADMIN_STATUS_LABELS[order.status].th)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-3 print:hidden">
        <BackLink fallbackHref="/admin/orders" />
        {/* Status badge sits directly beside the order number — it's the
            first thing the owner looks for, so it reads as part of the
            heading rather than as a separate line. The pair wraps together
            on a narrow screen; Print stays right-aligned on the same row. */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="truncate text-h3 font-bold text-foreground">
              {t("order.detail")} #{order.orderNo}
            </h1>
            <OrderStatusBadge status={order.status} label={statusLabel} />
          </div>
          <div className="flex shrink-0 justify-end">
            <PrintOrderButton />
          </div>
        </div>
        <p className="text-small text-muted-foreground">
          {t("order.preorderCode")}: <span className="font-mono font-medium text-foreground">{order.preorderCode}</span>
        </p>
      </div>

      <OrderReceipt order={order} statusLabel={statusLabel} />

      <div className="print:hidden">
        <OrderFulfillment
          orderId={order.id}
          orderStatus={order.status}
          items={order.items}
          statuses={itemStatuses}
          locale={locale}
        />
      </div>

      <div className="print:hidden">
        <OrderForm order={order} types={types} statusLabels={statusLabels} locale={locale} />
      </div>
    </div>
  )
}
