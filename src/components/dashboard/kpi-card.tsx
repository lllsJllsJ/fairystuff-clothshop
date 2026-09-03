import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Port of carstockpro's `dashboard/kpi-card.tsx`, restyled to DESIGN.md:
 * flat white surface, 1px hairline border (0px radius resolves from the
 * token system in globals.css — no rounded-* override needed here), and
 * the existing `--chart-*` / feedback tokens for the icon chip instead of
 * carstockpro's `success` token (not part of this palette).
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
}: {
  label: string
  value: string
  icon: LucideIcon
  tone?: "default" | "primary" | "warning" | "destructive"
  hint?: string
}) {
  const toneClasses = {
    default: "bg-muted text-foreground",
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/10 text-destructive",
  }[tone]

  return (
    <div className="flex flex-col gap-2 border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-small font-medium text-muted-foreground">{label}</span>
        <span className={cn("flex size-8 items-center justify-center", toneClasses)}>
          <Icon className="size-4" />
        </span>
      </div>
      <span className="text-h3 font-bold tracking-tight text-foreground">{value}</span>
      {hint && <span className="text-small text-muted-foreground">{hint}</span>}
    </div>
  )
}
