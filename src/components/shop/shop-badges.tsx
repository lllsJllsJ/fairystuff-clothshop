import { useTranslations } from "next-intl"
import { Flame } from "lucide-react"

import { percentOff } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import type { ProductAudience, ProductKind } from "@/lib/product-taxonomy"

/**
 * Storefront flags, all on DESIGN.md §4's "Alert Badge" shape (4px radius,
 * bold 12px label). Colour carries meaning, not decoration:
 *   - Sale -20%    Sale Red, filled (a discount is running — the loudest flag)
 *   - New in       Warning Yellow (time-sensitive promotion)
 *   - Popular      Brand Fuchsia outline on the card surface (the owner's
 *                  pick) — outlined so it can't be mistaken for the filled
 *                  Set/Full set flag it often sits next to
 *   - Set/Full set Brand Fuchsia (what you're buying)
 *   - Kids / Adults & Kids   Sky Blue tint (who it's for)
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

/** "-20%" flag — nothing when the product isn't discounted. */
export function SaleBadge({
  price,
  regularPrice,
  className,
}: {
  price: number | string
  regularPrice: number | string
  className?: string
}) {
  const t = useTranslations()
  const off = percentOff(price, regularPrice)
  if (off == null) return null
  return (
    <span className={cn(BADGE, "bg-sale text-sale-foreground", className)} style={BADGE_RADIUS}>
      {t("shop.saleBadge", { percent: off })}
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

/** The owner's hand-picked "Popular" flag (Settings -> Storefront). */
export function PopularBadge({ className }: { className?: string }) {
  const t = useTranslations()
  return (
    <span
      className={cn(BADGE, "gap-1 border border-primary bg-card text-primary", className)}
      style={BADGE_RADIUS}
    >
      <Flame className="size-3.5" aria-hidden />
      {t("shop.popularBadge")}
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

/** "Kids" or "Adults & Kids" — nothing for an adults-only product (the
 * default the storefront assumes). */
export function AudienceBadge({
  audience,
  className,
}: {
  audience: ProductAudience
  className?: string
}) {
  const t = useTranslations()
  if (audience === "adult") return null
  return (
    <span
      className={cn(BADGE, "bg-[#e3f0fe] text-[#1d5fa8] dark:bg-[#10263f] dark:text-[#9cc8fb]", className)}
      style={BADGE_RADIUS}
    >
      {audience === "kids" ? t("shop.kidsBadge") : t("shop.bothBadge")}
    </span>
  )
}
