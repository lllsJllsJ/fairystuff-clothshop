"use client"

import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { AUDIENCE_LABEL_KEY, type ProductAudience, type ProductKind } from "@/lib/product-taxonomy"

/** Admin-side labels for a product's audience / kind / availability. */

export function KindBadge({ kind, className }: { kind: ProductKind; className?: string }) {
  const t = useTranslations("product")
  if (kind === "single") return null
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-warning px-2 py-0.5 text-small font-bold text-warning-foreground uppercase",
        className
      )}
    >
      {kind === "set" ? t("kindSet") : t("kindFullset")}
    </span>
  )
}

export function AudienceBadge({
  audience,
  className,
}: {
  audience: ProductAudience
  className?: string
}) {
  const t = useTranslations("product")
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-small font-medium",
        audience === "kids"
          ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
          : audience === "both"
            ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
            : "bg-muted text-muted-foreground",
        className
      )}
    >
      {t(AUDIENCE_LABEL_KEY[audience])}
    </span>
  )
}

/** "5/6 available", or a red "None available" when every variant is off. */
export function AvailabilitySummary({
  variants,
  className,
}: {
  variants: { isAvailable: boolean }[]
  className?: string
}) {
  const t = useTranslations("product")
  if (variants.length === 0) {
    return <span className={cn("text-small text-muted-foreground", className)}>—</span>
  }
  const available = variants.filter((v) => v.isAvailable).length
  return (
    <span
      className={cn(
        "text-small tabular-nums",
        available === 0 ? "font-bold text-destructive" : "text-muted-foreground",
        className
      )}
    >
      {available === 0
        ? t("noneAvailable")
        : t("availableOf", { available, total: variants.length })}
    </span>
  )
}
