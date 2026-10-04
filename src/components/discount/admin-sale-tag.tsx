import { useTranslations } from "next-intl"

import { formatBaht } from "@/lib/format"
import { percentOff } from "@/lib/pricing"
import { clsx } from "clsx"

// clsx, not cn(): tailwind-merge reads the custom text-body/text-h4 size
// utilities as colours and would drop text-sale (or the size) — keep both.
const cx = clsx

/** Admin hint that a discount is running now: "Sale ฿632 · -20%". Nothing
 * when the effective price equals the regular price. */
export function AdminSaleTag({
  regularPrice,
  effectivePrice,
  className,
}: {
  regularPrice: number | string
  effectivePrice: number | string | null | undefined
  className?: string
}) {
  const t = useTranslations("discount")
  if (effectivePrice == null) return null
  const off = percentOff(effectivePrice, regularPrice)
  if (off == null) return null
  return (
    <span
      className={cx("inline-flex items-center gap-1 bg-sale-soft px-1.5 py-0.5 text-small font-bold whitespace-nowrap text-sale", className)}
      style={{ borderRadius: "var(--radius-badge-sm)" }}
    >
      {t("saleTag", { price: formatBaht(Number(effectivePrice)), percent: off })}
    </span>
  )
}
