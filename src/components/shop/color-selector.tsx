"use client"

import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { RadioChipGroup } from "@/components/shop/radio-chip-group"

/**
 * Colour names are owner-entered free text (Thai or English — see
 * `product_variants.color` in schema.ts), so swatches render as labelled
 * chips rather than CSS colour dots: a value like "แดง" isn't a resolvable
 * CSS colour, and a dot that silently fails to paint is worse than a chip
 * that always reads correctly. A colour with zero stock across every size
 * renders desaturated (DESIGN.md's colour/size interaction rule) but stays
 * selectable — the shopper can still browse its photos.
 */
export function ColorSelector({
  colors,
  stockByColor,
  value,
  onChange,
}: {
  colors: string[]
  /** true if ANY size for that colour is in stock. */
  stockByColor: Record<string, boolean>
  value: string | null
  onChange: (color: string) => void
}) {
  const t = useTranslations()

  if (colors.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-subtitle font-bold text-foreground">
        {t("shop.colorLabel")}
        {value ? <span className="font-normal text-muted-foreground"> · {value}</span> : null}
      </p>
      <RadioChipGroup
        ariaLabel={t("shop.selectColor")}
        options={colors.map((color) => ({ value: color, label: color }))}
        value={value}
        onChange={onChange}
        className="flex flex-wrap gap-2"
        renderOption={(option, selected) => {
          const inStock = stockByColor[option.value] ?? true
          return (
            <span
              className={cn(
                "flex h-11 min-w-11 items-center justify-center border px-3 text-body transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-[var(--border-lighter)] bg-background text-foreground hover:border-primary",
                !inStock && !selected && "text-muted-foreground opacity-50"
              )}
            >
              {option.label}
              {!inStock && <span className="sr-only"> — {t("shop.outOfStockAll")}</span>}
            </span>
          )
        }}
      />
    </div>
  )
}
