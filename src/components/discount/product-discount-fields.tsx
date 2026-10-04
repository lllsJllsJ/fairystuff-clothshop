"use client"

import { useTranslations } from "next-intl"
import { ArrowRight, AlertTriangle } from "lucide-react"

import { effectivePrice, fromBangkokInput, MAX_DISCOUNT_PERCENT, MIN_DISCOUNT_PERCENT, percentOff } from "@/lib/pricing"
import { formatBaht } from "@/lib/format"
import { DiscountStatus } from "@/components/discount/discount-status"
import { DiscountWindowFields } from "@/components/discount/discount-window-fields"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Switch } from "@/components/ui/switch"

export type ProductDiscountValues = {
  discountEnabled: boolean
  discountType: "percent" | "price"
  discountValue: string
  discountStartsAt: string
  discountEndsAt: string
}

/**
 * Product editor's "Discount" section: on/off, % off or a fixed sale price,
 * and an optional Bangkok-time window. While it runs it WINS over the
 * shop-wide sale (src/lib/pricing.ts). The preview uses the same TS rule as
 * the pricing tests, ignoring the shop sale (this product's own price only).
 */
export function ProductDiscountFields({
  values,
  sellPrice,
  onChange,
  valueError,
  windowError,
}: {
  values: ProductDiscountValues
  sellPrice: number
  onChange: <K extends keyof ProductDiscountValues>(key: K, value: ProductDiscountValues[K]) => void
  valueError?: string | null
  windowError?: string | null
}) {
  const t = useTranslations("discount")
  const startsAt = fromBangkokInput(values.discountStartsAt)
  const endsAt = fromBangkokInput(values.discountEndsAt)
  const hasValue = values.discountValue !== "" && Number.isFinite(Number(values.discountValue))

  // Preview as if the window were open now, so the owner sees the deal
  // even for a scheduled discount.
  const preview = hasValue
    ? effectivePrice(
        sellPrice,
        {
          discountEnabled: true,
          discountType: values.discountType,
          discountValue: values.discountValue,
          discountStartsAt: null,
          discountEndsAt: null,
        },
        null
      )
    : null
  const off = preview ? percentOff(preview.price, preview.regularPrice) : null
  const noEffect = values.discountType === "price" && hasValue && Number(values.discountValue) >= sellPrice && sellPrice > 0

  return (
    <section className="space-y-4 border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-subtitle font-bold">{t("productTitle")}</h2>
          <p className="text-small text-muted-foreground">{t("productHint")}</p>
        </div>
        <DiscountStatus enabled={values.discountEnabled && hasValue} startsAt={startsAt} endsAt={endsAt} />
      </div>

      <label className="flex items-center gap-3">
        <Switch
          checked={values.discountEnabled}
          onCheckedChange={(checked) => onChange("discountEnabled", checked)}
        />
        <span className="text-body font-bold">{t("productEnabled")}</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("type")}</Label>
          <SegmentedControl
            name="discountType"
            label={t("type")}
            value={values.discountType}
            onValueChange={(value) => onChange("discountType", value)}
            options={[
              { value: "percent", label: t("typePercent") },
              { value: "price", label: t("typePrice") },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-discount-value">
            {values.discountType === "percent" ? t("percentOff") : t("salePriceLabel")}
          </Label>
          <div className="relative">
            <Input
              id="product-discount-value"
              type="number"
              inputMode="decimal"
              step={values.discountType === "percent" ? "1" : "0.01"}
              min={values.discountType === "percent" ? MIN_DISCOUNT_PERCENT : 0}
              max={values.discountType === "percent" ? MAX_DISCOUNT_PERCENT : undefined}
              value={values.discountValue}
              onChange={(e) => onChange("discountValue", e.target.value)}
              aria-invalid={!!valueError}
              className="pr-8"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
              {values.discountType === "percent" ? "%" : "฿"}
            </span>
          </div>
          {valueError && <p className="text-small text-destructive">{valueError}</p>}
        </div>
      </div>

      {preview && off != null && (
        <div className="flex flex-wrap items-center gap-3 bg-sale-soft px-4 py-3">
          <s className="text-body text-muted-foreground">{formatBaht(preview.regularPrice)}</s>
          <ArrowRight className="size-4 text-sale" aria-hidden />
          <span className="text-h4 font-bold text-sale">{formatBaht(preview.price)}</span>
          <span className="bg-sale px-2 py-0.5 text-small font-bold text-sale-foreground" style={{ borderRadius: "var(--radius-badge-sm)" }}>
            -{off}%
          </span>
        </div>
      )}
      {noEffect && (
        <p className="flex items-center gap-2 text-small text-warning-foreground">
          <AlertTriangle className="size-4 text-warning" aria-hidden />
          {t("salePriceNotLower")}
        </p>
      )}

      <DiscountWindowFields
        idPrefix="product-discount"
        startsAt={values.discountStartsAt}
        endsAt={values.discountEndsAt}
        onStartsAtChange={(v) => onChange("discountStartsAt", v)}
        onEndsAtChange={(v) => onChange("discountEndsAt", v)}
        error={windowError}
      />
    </section>
  )
}
