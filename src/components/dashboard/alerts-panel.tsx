"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import {
  CheckCircle2,
  ChevronRight,
  ImageOff,
  PackageX,
  Tags,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Link } from "@/i18n/navigation"
import type { DashboardData } from "@/db/queries/dashboard"

type AlertTone = "danger" | "warning" | "muted"

type AlertGroup = {
  key: keyof DashboardData["alerts"]
  icon: LucideIcon
  tone: AlertTone
}

const PREVIEW_COUNT = 3

const GROUPS: AlertGroup[] = [
  { key: "noPhoto", icon: ImageOff, tone: "warning" },
  { key: "noPrice", icon: Wallet, tone: "danger" },
  { key: "noVariants", icon: Tags, tone: "warning" },
  { key: "allSoldOut", icon: PackageX, tone: "muted" },
]

const LABEL_KEYS: Record<AlertGroup["key"], string> = {
  noPhoto: "dashboard.alertNoPhoto",
  noPrice: "dashboard.alertNoPrice",
  noVariants: "dashboard.alertNoVariants",
  allSoldOut: "dashboard.alertAllSoldOut",
}

/**
 * The dashboard.ts alert set as clickable summary cards — the analogue of
 * carstockpro's `tasks-panel.tsx`, restyled to DESIGN.md (flat surfaces,
 * hairline borders, no rounded chips). Every alert links straight to that
 * product's edit page so the panel is actionable, not decorative.
 */
export function AlertsPanel({ alerts }: { alerts: DashboardData["alerts"] }) {
  const t = useTranslations()

  const active = GROUPS.filter((g) => alerts[g.key].length > 0)

  return (
    <div className="space-y-3">
      <h2 className="text-h4 font-bold text-foreground">{t("dashboard.alertsTitle")}</h2>

      {active.length === 0 ? (
        <div className="flex items-center gap-2 border border-border bg-card p-4 text-body text-muted-foreground">
          <CheckCircle2 className="size-5 text-primary" />
          {t("dashboard.alertsAllClear")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {active.map((group) => (
            <AlertCard key={group.key} group={group} items={alerts[group.key]} />
          ))}
        </div>
      )}
    </div>
  )
}

function AlertCard({
  group,
  items,
}: {
  group: AlertGroup
  items: DashboardData["alerts"][AlertGroup["key"]]
}) {
  const t = useTranslations()
  const [expanded, setExpanded] = useState(false)

  const toneBorder =
    group.tone === "danger"
      ? "border-destructive/40"
      : group.tone === "warning"
        ? "border-warning/60"
        : "border-border"
  const toneChip =
    group.tone === "danger"
      ? "bg-destructive/10 text-destructive"
      : group.tone === "warning"
        ? "bg-warning/20 text-warning-foreground"
        : "bg-muted text-muted-foreground"

  const shown = expanded ? items : items.slice(0, PREVIEW_COUNT)

  return (
    <div className={cn("flex flex-col border bg-card p-4", toneBorder)}>
      <div className="flex items-center gap-2">
        <span className={cn("flex size-9 items-center justify-center", toneChip)}>
          <group.icon className="size-5" />
        </span>
        <span className="text-small font-medium text-foreground">{t(LABEL_KEYS[group.key])}</span>
        <span className="ml-auto text-h4 font-bold tabular-nums text-foreground">{items.length}</span>
      </div>

      <ul className="mt-3 space-y-1">
        {shown.map((product) => (
          <li key={product.id}>
            <Link
              href={`/admin/products/${product.id}/edit`}
              className="flex items-center justify-between gap-2 px-2 py-1.5 text-small hover:bg-muted"
            >
              <span className="truncate">{product.label}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      {items.length > PREVIEW_COUNT && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 self-start text-small font-medium text-link hover:underline"
        >
          {t("common.viewAll")} ({items.length})
        </button>
      )}
    </div>
  )
}
