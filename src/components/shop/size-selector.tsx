"use client"

import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import type { ProductAudience } from "@/lib/product-taxonomy"
import { RadioChipGroup } from "@/components/shop/radio-chip-group"

export type SizeOption = { size: string; available: boolean }

/**
 * Size chips for the colour currently selected on the detail page. A size
 * the owner switched off stays in the list, struck through and
 * `aria-disabled` (DESIGN.md's colour/size interaction rule) — the shopper
 * sees it exists but can't be ordered right now, rather than wondering
 * whether it was ever made. Kids' products are sized by height, so the
 * label and hint change with the audience; an "Adults & Kids" product mixes
 * letter sizes and heights, so it gets a hint that says so.
 */
export function SizeSelector({
  options,
  value,
  onChange,
  audience,
}: {
  options: SizeOption[]
  value: string | null
  onChange: (size: string) => void
  audience: ProductAudience
}) {
  const t = useTranslations()

  if (options.length === 0) return null
  const isKids = audience === "kids"

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-subtitle font-bold text-foreground">
          {isKids ? t("shop.heightLabel") : t("shop.sizeLabel")}
          {value ? <span className="font-normal text-muted-foreground"> · {value}</span> : null}
        </p>
        {isKids && <p className="text-small text-muted-foreground">{t("shop.heightHint")}</p>}
        {audience === "both" && <p className="text-small text-muted-foreground">{t("shop.bothSizeHint")}</p>}
      </div>
      <RadioChipGroup
        ariaLabel={isKids ? t("shop.selectHeight") : t("shop.selectSize")}
        options={options.map((option) => ({
          value: option.size,
          label: option.size,
          disabled: !option.available,
        }))}
        value={value}
        onChange={onChange}
        className="flex flex-wrap gap-2"
        renderOption={(option, selected) => (
          <span
            className={cn(
              "flex h-11 min-w-11 items-center justify-center border px-3 text-body transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-[var(--border-lighter)] bg-background text-foreground hover:border-primary",
              option.disabled &&
                "cursor-not-allowed border-dashed bg-[var(--surface-subtle,#fafafa)] text-muted-foreground line-through decoration-1 hover:border-[var(--border-lighter)]"
            )}
          >
            {option.label}
            {option.disabled && <span className="sr-only"> — {t("shop.sizeUnavailable")}</span>}
          </span>
        )}
      />
    </div>
  )
}
