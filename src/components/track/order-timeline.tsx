import { formatDate, formatDateTime } from "@/lib/format"
import type { CustomerOrderStage } from "@/lib/order-status"

/**
 * A deliberately honest, at-most-2-row timeline. There is no
 * `order_status_history` table (a bigger feature, out of scope here) — the
 * only real timestamps this app has are `orders.orderDate` (when the order
 * was placed) and `orders.updatedAt` (last time ANY field on the order
 * changed, via the `set_updated_at()` trigger — not a per-status log). This
 * never fabricates "preparing: [date], shipping: [date]" rows the data
 * can't actually support.
 */
export function OrderTimeline({
  orderDate,
  updatedAt,
  stage,
  receivedLabel,
  currentLabel,
  locale,
}: {
  orderDate: string
  updatedAt: Date
  stage: CustomerOrderStage
  receivedLabel: string
  currentLabel: string
  locale: string
}) {
  const dateLocale = locale === "en" ? "en-US" : "th-TH"
  // Only show a second row once the order has actually moved past
  // "received" — otherwise both rows would claim to represent the same
  // moment when nothing has progressed yet.
  const showCurrent = stage !== "received"

  return (
    <ol className="space-y-3">
      <li className="flex items-baseline justify-between gap-4">
        <span className="text-body font-medium text-foreground">{receivedLabel}</span>
        <span className="text-small text-muted-foreground">{formatDate(orderDate, dateLocale)}</span>
      </li>
      {showCurrent && (
        <li className="flex items-baseline justify-between gap-4">
          <span className="text-body font-medium text-foreground">{currentLabel}</span>
          <span className="text-small text-muted-foreground">{formatDateTime(updatedAt, dateLocale)}</span>
        </li>
      )}
    </ol>
  )
}
