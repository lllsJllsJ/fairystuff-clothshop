import { useTranslations } from "next-intl"

import { formatBaht } from "@/lib/format"
import { percentOff } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import { clsx } from "clsx"

// clsx, not cn(): tailwind-merge reads the custom text-body/text-h4 size
// utilities as colours and would drop text-sale (or the size) — keep both.
const cx = clsx

/**
 * Selling price, with a "was / now" treatment when `regularPrice` is higher:
 * the sale price in the sale red, the regular price struck through, and a
 * "-20%" chip. `regularPrice` is the PRE-DISCOUNT SELLING price (public).
 * This file (like every other file under src/components/shop) must never
 * receive `originalPrice` — that is the private cost, not a price to
 * compare against.
 */
export function Price({
  value,
  regularPrice,
  className,
  size = "default",
  showBadge = true,
}: {
  value: number | string
  regularPrice?: number | string | null
  className?: string
  size?: "default" | "lg"
  showBadge?: boolean
}) {
  const t = useTranslations("shop")
  const off = percentOff(value, regularPrice)
  const large = size === "lg"

  if (off == null) {
    return (
      <span className={cn("font-bold text-primary", large ? "text-h3" : "text-body", className)}>
        {formatBaht(Number(value))}
      </span>
    )
  }

  return (
    <span className={cx("inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span className={cx("font-bold text-sale", large ? "text-h2" : "text-body sm:text-h4")}>
        <span className="sr-only">{t("salePrice")} </span>
        {formatBaht(Number(value))}
      </span>
      <s className={cx("text-muted-foreground", large ? "text-body" : "text-small")}>
        <span className="sr-only">{t("regularPrice")} </span>
        {formatBaht(Number(regularPrice))}
      </s>
      {showBadge && (
        <span
          className={cx(
            "self-center bg-sale-soft px-1.5 py-0.5 font-bold text-sale",
            large ? "text-body" : "text-small"
          )}
          style={{ borderRadius: "var(--radius-badge-sm)" }}
        >
          -{off}%
        </span>
      )}
    </span>
  )
}
