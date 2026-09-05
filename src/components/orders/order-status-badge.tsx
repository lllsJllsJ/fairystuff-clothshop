import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import type { OrderStatusValue } from "@/db/queries/orders"

/**
 * DESIGN.md §4 "Category Badge (Colored)" treatment — solid background,
 * white text, 16px pill radius (`--radius-pill`), 12px/700 label — applied
 * per order status rather than the generic `Badge` component's variant
 * styling (see `ProductStatusBadge` in product-admin-card.tsx, which uses
 * the plain default/secondary/outline variants instead; orders get the
 * richer treatment because six statuses need to stay visually distinct at
 * a glance in the list view).
 *
 * Every background below is an EXISTING token from globals.css — none of
 * this file introduces a new color. Six statuses, six already-registered
 * `--color-*` tokens: --secondary (blue), --chart-3 (sky), --warning
 * (yellow), --primary (fuchsia), --chart-5 (brown, distinct from the
 * saturated hues) for the terminal "completed" state was considered but
 * --pastel-green reads far more like "done" than brown does, so
 * `completed` uses `--pastel-green` via `bg-[var(--pastel-green)]` — the
 * one token here not wired to a Tailwind utility class (it's a Sanrio
 * accent color declared as a bare CSS custom property, not one of the
 * `@theme inline` `--color-*` entries), reached the same way DESIGN.md
 * itself names it (`#AABBAA`, one of the three literal Category Badge
 * colors). `cancelled` uses `--destructive` (red) — the one color a status
 * badge palette can't do without.
 */

const STATUS_STYLES: Record<OrderStatusValue, string> = {
  new: "bg-secondary text-secondary-foreground",
  accepted: "bg-chart-3 text-white",
  preorder: "bg-chart-5 text-white",
  packaging: "bg-warning text-warning-foreground",
  shipping: "bg-primary text-primary-foreground",
  complete: "bg-[var(--pastel-green)] text-white",
  cancelled: "bg-destructive text-destructive-foreground",
  refund: "bg-muted text-muted-foreground",
}

const STATUS_LABEL_KEY: Record<OrderStatusValue, string> = {
  new: "order.statusNew",
  accepted: "order.statusAccepted",
  preorder: "order.statusPreorder",
  packaging: "order.statusPackaging",
  shipping: "order.statusShipping",
  complete: "order.statusComplete",
  cancelled: "order.statusCancelled",
  refund: "order.statusRefund",
}

export function OrderStatusBadge({ status, label }: { status: OrderStatusValue; label?: string }) {
  const t = useTranslations()
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center whitespace-nowrap px-3 py-1.5 text-small font-bold",
        "rounded-[var(--radius-pill)]",
        STATUS_STYLES[status]
      )}
    >
      {label ?? t(STATUS_LABEL_KEY[status])}
    </span>
  )
}
