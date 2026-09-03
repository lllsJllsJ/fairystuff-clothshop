"use client"

import { useTranslations } from "next-intl"
import { X } from "lucide-react"

import type { PublicProductType } from "@/db/queries/storefront"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { SimpleSelect } from "@/components/ui/simple-select"

/**
 * Mirrors the admin's "Add standard sizes" quick-fill (variant-matrix-editor,
 * Phase 3). `PublicProductSummary` doesn't carry a sizes facet — the public
 * data contract in `db/queries/storefront.ts` intentionally has no
 * "distinct sizes" query — so the size filter offers this fixed set rather
 * than one derived from the database. `GET /api/products` still matches
 * on the exact variant size, so this only limits which values the filter UI
 * offers, not what the API can filter on.
 */
export const STANDARD_SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "2XL", "Free Size"]

export type ShopFilterValues = {
  type: string
  color: string
  size: string
  inStockOnly: boolean
  minPrice: string
  maxPrice: string
}

export function ShopFilters({
  types,
  colorOptions,
  values,
  onChange,
  onClear,
  hasActiveFilters,
}: {
  types: PublicProductType[]
  colorOptions: string[]
  values: ShopFilterValues
  onChange: <K extends keyof ShopFilterValues>(key: K, value: ShopFilterValues[K]) => void
  onClear: () => void
  hasActiveFilters: boolean
}) {
  const t = useTranslations()

  const typeOptions = [
    { value: "", label: t("common.all") },
    ...types.map((type) => ({ value: type.name, label: `${type.name} (${type.count})` })),
  ]
  const colorSelectOptions = [
    { value: "", label: t("common.all") },
    ...colorOptions.map((color) => ({ value: color, label: color })),
  ]
  const sizeSelectOptions = [
    { value: "", label: t("common.all") },
    ...STANDARD_SIZE_OPTIONS.map((size) => ({ value: size, label: size })),
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-subtitle font-bold text-foreground">{t("common.filter")}</h2>
        {hasActiveFilters && (
          <Button variant="secondary" size="sm" onClick={onClear} className="gap-1">
            <X className="size-3.5" />
            {t("shop.clearFilters")}
          </Button>
        )}
      </div>

      <FilterField label={t("shop.productType")}>
        <SimpleSelect
          value={values.type}
          onValueChange={(v) => onChange("type", v)}
          options={typeOptions}
          className="h-11"
        />
      </FilterField>

      <FilterField label={t("shop.colorLabel")}>
        <SimpleSelect
          value={values.color}
          onValueChange={(v) => onChange("color", v)}
          options={colorSelectOptions}
          className="h-11"
        />
      </FilterField>

      <FilterField label={t("shop.sizeLabel")}>
        <SimpleSelect
          value={values.size}
          onValueChange={(v) => onChange("size", v)}
          options={sizeSelectOptions}
          className="h-11"
        />
      </FilterField>

      <FilterField label={t("shop.priceRange")}>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={t("shop.minPrice")}
            value={values.minPrice}
            onChange={(e) => onChange("minPrice", e.target.value)}
            className="h-11"
            aria-label={t("shop.minPrice")}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={t("shop.maxPrice")}
            value={values.maxPrice}
            onChange={(e) => onChange("maxPrice", e.target.value)}
            className="h-11"
            aria-label={t("shop.maxPrice")}
          />
        </div>
      </FilterField>

      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="text-body text-foreground">{t("shop.inStockOnly")}</span>
        <Switch
          checked={values.inStockOnly}
          onCheckedChange={(checked) => onChange("inStockOnly", checked)}
        />
      </label>
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-small font-bold text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
