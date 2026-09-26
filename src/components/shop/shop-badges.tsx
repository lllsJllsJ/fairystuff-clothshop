import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import type { ProductKind } from "@/lib/product-taxonomy"

/**
 * Storefront flags, all on DESIGN.md §4's "Alert Badge" shape (4px radius,
 * bold 12px label). Colour carries meaning, not decoration:
 *   - New in       Warning Yellow (time-sensitive promotion)
 *   - Set/Full set Brand Fuchsia (what you're buying)
 *   - Kids         Sky Blue tint (who it's for)
 *   - Unavailable  Foreground/white (informational)
 */

const BADGE = "inline-flex items-center px-2 py-1 text-small font-bold"
const BADGE_RADIUS = { borderRadius: "var(--radius-badge-sm)" }

export function UnavailableBadge({ className }: { className?: string }) {
  const t = useTranslations()
  return (
    <span className={cn(BADGE, "bg-foreground text-background", className)} style={BADGE_RADIUS}>
      {t("shop.unavailable")}
    </span>
  )
}

/** "New in" flag — DESIGN.md's Warning Yellow alert badge, unmodified. */
export function NewBadge({ className }: { className?: string }) {
  const t = useTranslations()
  return (
    <span className={cn(BADGE, "bg-warning text-warning-foreground", className)} style={BADGE_RADIUS}>
      {t("shop.newBadge")}
    </span>
  )
}

/** SET / FULL SET — nothing for a single item. */
export function KindBadge({ kind, className }: { kind: ProductKind; className?: string }) {
  const t = useTranslations()
  if (kind === "single") return null
  return (
    <span
      className={cn(BADGE, "bg-primary tracking-wide text-primary-foreground uppercase", className)}
      style={BADGE_RADIUS}
    >
      {kind === "set" ? t("shop.kindSet") : t("shop.kindFullset")}
    </span>
  )
}

export function KidsBadge({ className }: { className?: string }) {
  const t = useTranslations()
  return (
    <span
      className={cn(BADGE, "bg-[#e3f0fe] text-[#1d5fa8] dark:bg-[#10263f] dark:text-[#9cc8fb]", className)}
      style={BADGE_RADIUS}
    >
      {t("shop.kidsBadge")}
    </span>
  )
}
