"use client"

import { useTranslations } from "next-intl"

import { windowStatus, type SaleStatus } from "@/lib/pricing"
import { clsx } from "clsx"

// clsx, not cn(): tailwind-merge reads the custom text-body/text-h4 size
// utilities as colours and would drop text-sale (or the size) — keep both.
const cx = clsx

const TONE: Record<SaleStatus, string> = {
  running: "bg-sale text-sale-foreground",
  scheduled: "bg-warning text-warning-foreground",
  ended: "bg-muted text-muted-foreground border border-border",
  off: "bg-muted text-muted-foreground border border-border",
}

/** Running / Scheduled / Ended / Off pill for a discount window (admin). */
export function DiscountStatus({
  enabled,
  startsAt,
  endsAt,
  className,
}: {
  enabled: boolean
  startsAt: Date | string | null
  endsAt: Date | string | null
  className?: string
}) {
  const t = useTranslations("discount")
  const status = windowStatus(enabled, startsAt, endsAt)
  return (
    <span
      className={cx("inline-flex items-center px-2 py-0.5 text-small font-bold", TONE[status], className)}
      style={{ borderRadius: "var(--radius-badge-sm)" }}
    >
      {t(`status_${status}`)}
    </span>
  )
}
