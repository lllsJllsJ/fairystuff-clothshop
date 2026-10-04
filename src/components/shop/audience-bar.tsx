"use client"

import { useTranslations } from "next-intl"
import { Layers, Tag } from "lucide-react"

import { cn } from "@/lib/utils"

export type AudienceFilter = "" | "adult" | "kids"

/**
 * The storefront's primary split: All / Adults / Kids as big tabs, plus a
 * "Sets & full sets" toggle and a "Sale" toggle (discounted items only). Lives above the grid rather than in the
 * sidebar because who a product is for is the first question a parent
 * shopping for a child asks — it shouldn't hide behind a Filters button on
 * a phone.
 */
export function AudienceBar({
  audience,
  onAudienceChange,
  setsOnly,
  onSetsOnlyChange,
  saleOnly,
  onSaleOnlyChange,
}: {
  audience: AudienceFilter
  onAudienceChange: (value: AudienceFilter) => void
  setsOnly: boolean
  onSetsOnlyChange: (value: boolean) => void
  saleOnly: boolean
  onSaleOnlyChange: (value: boolean) => void
}) {
  const t = useTranslations("shop")
  const tabs: { value: AudienceFilter; label: string }[] = [
    { value: "", label: t("audienceAll") },
    { value: "adult", label: t("audienceAdult") },
    { value: "kids", label: t("audienceKids") },
  ]

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div
        role="tablist"
        aria-label={t("audienceLabel")}
        className="inline-flex rounded-full border border-[var(--border-lighter)] bg-card p-1"
      >
        {tabs.map((tab) => {
          const active = tab.value === audience
          return (
            <button
              key={tab.value || "all"}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onAudienceChange(tab.value)}
              className={cn(
                "min-h-10 rounded-full px-4 text-body transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-5",
                active
                  ? "bg-primary font-bold text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        aria-pressed={setsOnly}
        onClick={() => onSetsOnlyChange(!setsOnly)}
        className={cn(
          "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-body transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          setsOnly
            ? "border-primary bg-primary/10 font-bold text-primary"
            : "border-[var(--border-lighter)] bg-card text-foreground hover:border-primary"
        )}
      >
        <Layers className="size-4" aria-hidden />
        {t("setsOnly")}
      </button>

      <button
        type="button"
        aria-pressed={saleOnly}
        onClick={() => onSaleOnlyChange(!saleOnly)}
        className={cn(
          "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-body transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sale",
          saleOnly
            ? "border-sale bg-sale font-bold text-sale-foreground"
            : "border-[var(--border-lighter)] bg-card text-sale hover:border-sale"
        )}
      >
        <Tag className="size-4" aria-hidden />
        {t("saleOnly")}
      </button>
    </div>
  )
}
