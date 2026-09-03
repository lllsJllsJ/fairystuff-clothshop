import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { getOrderById } from "@/db/queries/orders"
import { getProductTypes } from "@/db/queries/product-types"
import { OrderForm } from "@/components/orders/order-form"
import { OrderReceipt } from "@/components/orders/order-receipt"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { PrintOrderButton } from "@/components/orders/print-order-button"

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
  const { id } = await params
  const t = await getTranslations()

  const [order, types] = await Promise.all([getOrderById(id), getProductTypes()])
  if (!order) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-h3 font-bold text-foreground">
            {t("order.detail")} #{order.orderNo}
          </h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <PrintOrderButton />
      </div>

      <OrderReceipt order={order} />

      <div className="print:hidden">
        <OrderForm order={order} types={types} />
      </div>
    </div>
  )
}
