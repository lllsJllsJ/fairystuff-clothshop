"use client"

import { useLocale, useTranslations } from "next-intl"
import { X } from "lucide-react"

import type { PublicCharacterFacet } from "@/db/queries/storefront"
import { ADULT_SIZES, KIDS_SIZES } from "@/lib/sizes"
import type { AudienceFilter } from "@/components/shop/audience-bar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SimpleSelect } from "@/components/ui/simple-select"

/**
 * The size filter offers the PRESET sizes for the chosen audience (adult
 * letters, kids heights — src/lib/sizes.ts), both lists when "All" is
 * selected. Custom free-text sizes still show on each product page; they
 * just aren't offered here, since the public data contract has no
 * "distinct sizes" facet. `GET /api/products` matches the exact size of an
 * AVAILABLE variant.
 */
export function sizeOptionsFor(audience: AudienceFilter): readonly string[] {
  if (audience === "adult") return ADULT_SIZES
  if (audience === "kids") return KIDS_SIZES
  return [...ADULT_SIZES, ...KIDS_SIZES]
}

export type ShopFilterValues = {
  audience: AudienceFilter
  /** "sets" = set or full set only. */
  kind: "" | "sets"
  character: string
  color: string
  size: string
  minPrice: string
  maxPrice: string
  /** "1" = only discounted products (`?sale=1`). */
  sale: "" | "1"
}

export function ShopFilters({
  characters,
  colorOptions,
  values,
  onChange,
  onClear,
  hasActiveFilters,
}: {
  characters: PublicCharacterFacet[]
  colorOptions: string[]
  values: ShopFilterValues
  onChange: <K extends keyof ShopFilterValues>(key: K, value: ShopFilterValues[K]) => void
  onClear: () => void
  hasActiveFilters: boolean
}) {
  const t = useTranslations()
  const locale = useLocale()

  const characterOptions = [
    { value: "", label: t("common.all") },
    ...characters.map((character) => ({
      value: character.slug,
      label: `${locale === "en" ? (character.nameEn ?? character.name) : character.name} (${character.count})`,
    })),
  ]
  const colorSelectOptions = [
    { value: "", label: t("common.all") },
    ...colorOptions.map((color) => ({ value: color, label: color })),
  ]
  const sizeSelectOptions = [
    { value: "", label: t("common.all") },
    ...sizeOptionsFor(values.audience).map((size) => ({ value: size, label: size })),
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

      <FilterField label={t("shop.character")}>
        <SimpleSelect
          value={values.character}
          onValueChange={(v) => onChange("character", v)}
          options={characterOptions}
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

      <FilterField label={values.audience === "kids" ? t("shop.heightLabel") : t("shop.sizeLabel")}>
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
