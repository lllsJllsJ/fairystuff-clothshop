import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

/**
 * DESIGN.md §4's "Alert Badge" shape (4px radius, bold 12px label) reused
 * for the sold-out flag on a product tile — foreground/white instead of the
 * warning yellow, since "sold out" is informational, not a promotion.
 */
export function SoldOutBadge({ className }: { className?: string }) {
  const t = useTranslations()
  return (
    <span
      className={cn(
        "inline-flex items-center bg-foreground px-2 py-1 text-small font-bold text-background",
        className
      )}
      style={{ borderRadius: "var(--radius-badge-sm)" }}
    >
      {t("shop.soldOut")}
    </span>
  )
}

/** "New in" flag — DESIGN.md's Warning Yellow alert badge, unmodified. */
export function NewBadge({ className }: { className?: string }) {
  const t = useTranslations()
  return (
    <span
      className={cn(
        "inline-flex items-center bg-warning px-2 py-1 text-small font-bold text-warning-foreground",
        className
      )}
      style={{ borderRadius: "var(--radius-badge-sm)" }}
    >
      {t("shop.newBadge")}
    </span>
  )
}
