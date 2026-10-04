"use client"

import { useTranslations } from "next-intl"
import { X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Start / end inputs for a discount window, as `datetime-local` text read
 * in Bangkok time (src/lib/pricing.ts#fromBangkokInput). Blank = open-ended.
 */
export function DiscountWindowFields({
  idPrefix,
  startsAt,
  endsAt,
  onStartsAtChange,
  onEndsAtChange,
  error,
}: {
  idPrefix: string
  startsAt: string
  endsAt: string
  onStartsAtChange: (value: string) => void
  onEndsAtChange: (value: string) => void
  error?: string | null
}) {
  const t = useTranslations("discount")
  const fields = [
    { key: "start", label: t("startsAt"), hint: t("startsAtHint"), value: startsAt, onChange: onStartsAtChange },
    { key: "end", label: t("endsAt"), hint: t("endsAtHint"), value: endsAt, onChange: onEndsAtChange },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-${field.key}`}>{field.label}</Label>
          <div className="flex gap-1.5">
            <Input
              id={`${idPrefix}-${field.key}`}
              type="datetime-local"
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              aria-invalid={field.key === "end" && !!error}
            />
            {field.value && (
              <button
                type="button"
                onClick={() => field.onChange("")}
                className="flex size-9 shrink-0 items-center justify-center border border-input text-muted-foreground hover:text-foreground"
                aria-label={t("clearDate")}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <p className="text-small text-muted-foreground">{field.hint}</p>
        </div>
      ))}
      {error && <p className="text-small text-destructive sm:col-span-2">{error}</p>}
    </div>
  )
}
