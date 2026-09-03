"use client"

import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { RadioChipGroup } from "@/components/shop/radio-chip-group"

/**
 * Size chips for the colour currently selected on the detail page. A
 * sold-out size is passed in with `inStock: false` and rendered
 * `aria-disabled` rather than removed from the list (DESIGN.md's
 * colour/size interaction rule) — see RadioChipGroup for the mechanics.
 */
export function SizeSelector({
  sizes,
  value,
  onChange,
}: {
  sizes: { size: string; inStock: boolean }[]
  value: string | null
  onChange: (size: string) => void
}) {
  const t = useTranslations()

  if (sizes.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-subtitle font-bold text-foreground">{t("shop.sizeLabel")}</p>
      <RadioChipGroup
        ariaLabel={t("shop.selectSize")}
        options={sizes.map((s) => ({ value: s.size, label: s.size, disabled: !s.inStock }))}
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
                "text-muted-foreground opacity-50 line-through hover:border-[var(--border-lighter)]"
            )}
          >
            {option.label}
            {option.disabled && <span className="sr-only"> — {t("shop.soldOut")}</span>}
          </span>
        )}
      />
    </div>
  )
}
