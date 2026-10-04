"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Loader2, Save } from "lucide-react"

import { saveShopSale } from "@/app/[locale]/admin/settings/workflow-actions"
import { MAX_SALE_LABEL_LENGTH } from "@/lib/validations/sale"
import { applyPercent, fromBangkokInput, MAX_DISCOUNT_PERCENT, MIN_DISCOUNT_PERCENT, toBangkokInput } from "@/lib/pricing"
import { formatBaht } from "@/lib/format"
import { clsx } from "clsx"
import { DiscountStatus } from "@/components/discount/discount-status"
import { DiscountWindowFields } from "@/components/discount/discount-window-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

const QUICK_PERCENTS = [10, 15, 20, 30, 50]
const PREVIEW_PRICE = 1000

/**
 * Settings -> Discount: the shop-wide % sale. Applies to every product
 * unless the product has its own running discount (product wins — see
 * src/lib/pricing.ts). Saved by `saveShopSale`.
 */
export function SaleSettings({
  initial,
}: {
  initial: {
    enabled: boolean
    percent: string | null
    startsAt: string | null
    endsAt: string | null
    labelTh: string
    labelEn: string
  }
}) {
  const t = useTranslations("discount")
  const router = useRouter()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [percent, setPercent] = useState(initial.percent ? String(Number(initial.percent)) : "")
  const [startsAt, setStartsAt] = useState(toBangkokInput(initial.startsAt))
  const [endsAt, setEndsAt] = useState(toBangkokInput(initial.endsAt))
  const [labelTh, setLabelTh] = useState(initial.labelTh)
  const [labelEn, setLabelEn] = useState(initial.labelEn)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const percentValue = Number(percent)
  const percentValid = percent !== "" && percentValue >= MIN_DISCOUNT_PERCENT && percentValue <= MAX_DISCOUNT_PERCENT

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const result = await saveShopSale({ enabled, percent, startsAt, endsAt, labelTh, labelEn })
      if (!result.ok) {
        const message = t.has(`error_${result.error}`) ? t(`error_${result.error}`) : t("saveFailed")
        setError(message)
        toast.error(message)
        return
      }
      toast.success(t("saved"))
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-subtitle font-bold">{t("shopSaleTitle")}</h2>
          <p className="mt-1 max-w-prose text-small text-muted-foreground">{t("shopSaleHint")}</p>
        </div>
        <DiscountStatus
          enabled={enabled && percentValid}
          startsAt={fromBangkokInput(startsAt)}
          endsAt={fromBangkokInput(endsAt)}
        />
      </div>

      <div className="mt-5 space-y-5">
        <label className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-body font-bold">{t("shopSaleEnabled")}</span>
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="shop-sale-percent">{t("percentOff")}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-32">
              <Input
                id="shop-sale-percent"
                type="number"
                inputMode="decimal"
                min={MIN_DISCOUNT_PERCENT}
                max={MAX_DISCOUNT_PERCENT}
                step="1"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="pr-8"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">%</span>
            </div>
            {QUICK_PERCENTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPercent(String(value))}
                // clsx, not cn(): tailwind-merge would drop text-small
                // against the colour classes (custom size utilities).
                className={clsx(
                  "min-h-9 border px-3 text-small font-bold transition-colors",
                  percentValue === value
                    ? "border-sale bg-sale text-sale-foreground"
                    : "border-input text-foreground hover:border-sale hover:text-sale"
                )}
                style={{ borderRadius: "var(--radius-full)" }}
              >
                {value}%
              </button>
            ))}
          </div>
          <p className="text-small text-muted-foreground">
            {percentValid
              ? t("previewExample", {
                  regular: formatBaht(PREVIEW_PRICE),
                  sale: formatBaht(applyPercent(PREVIEW_PRICE, percentValue)),
                })
              : t("percentRangeHint", { min: MIN_DISCOUNT_PERCENT, max: MAX_DISCOUNT_PERCENT })}
          </p>
        </div>

        <div className="space-y-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { id: "sale-label-th", label: t("labelTh"), value: labelTh, onChange: setLabelTh, placeholder: "SALE" },
              { id: "sale-label-en", label: t("labelEn"), value: labelEn, onChange: setLabelEn, placeholder: "SALE" },
            ].map((field) => (
              <div key={field.id} className="space-y-1.5">
                <Label htmlFor={field.id}>{field.label}</Label>
                <Input
                  id={field.id}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.placeholder}
                  maxLength={MAX_SALE_LABEL_LENGTH}
                />
              </div>
            ))}
          </div>
          <p className="text-small text-muted-foreground">{t("labelHint")}</p>
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            {[
              { lang: "TH", label: labelTh, key: "labelPreviewTh" as const },
              { lang: "EN", label: labelEn, key: "labelPreviewEn" as const },
            ].map((preview) => (
              <p key={preview.lang} className="flex items-center gap-2 text-small">
                <span className="font-bold text-muted-foreground">{preview.lang}</span>
                <span className="bg-sale px-2 py-0.5 font-bold text-sale-foreground">
                  {t(preview.key, {
                    label: preview.label.trim() || "SALE",
                    percent: percentValid ? percentValue : 20,
                  })}
                </span>
              </p>
            ))}
          </div>
        </div>

        <DiscountWindowFields
          idPrefix="shop-sale"
          startsAt={startsAt}
          endsAt={endsAt}
          onStartsAtChange={setStartsAt}
          onEndsAtChange={setEndsAt}
          error={error}
        />

        <p className="border-l-2 border-sale bg-sale-soft px-3 py-2 text-small text-foreground">{t("precedenceNote")}</p>
      </div>

      <Button className="mt-5" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="animate-spin" /> : <Save />}
        {t("save")}
      </Button>
    </section>
  )
}
