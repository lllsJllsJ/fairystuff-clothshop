import { getTranslations, setRequestLocale } from "next-intl/server"
import { Boxes, DollarSign, PackageX, Receipt, Shirt, TrendingUp, Warehouse } from "lucide-react"

import { getDashboardData } from "@/db/queries/dashboard"
import { formatBaht, formatNumber } from "@/lib/format"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { DashboardCharts } from "@/components/dashboard/charts"
import { AlertsPanel } from "@/components/dashboard/alerts-panel"

/**
 * Real dashboard, driven entirely by `getDashboardData()` (Phase 6 —
 * replaces the Phase 2 placeholder). Admin routes are already `ƒ`
 * dynamic — `requireOwner()` in `admin/layout.tsx` forces that — so this
 * never runs at build/prerender time and doesn't need the try/catch
 * fallback the public storefront pages use for a missing database.
 */
export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations()
  const data = await getDashboardData()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h3 font-bold text-foreground">{t("dashboard.title")}</h1>
        <p className="text-body text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("dashboard.activeProducts")}
          value={formatNumber(data.activeProducts)}
          icon={Shirt}
          tone="primary"
        />
        <KpiCard
          label={t("dashboard.stockUnits")}
          value={formatNumber(data.totalStockUnits)}
          icon={Boxes}
        />
        <KpiCard
          label={t("dashboard.soldOutSkus")}
          value={formatNumber(data.soldOutVariantCount)}
          icon={PackageX}
          tone={data.soldOutVariantCount > 0 ? "warning" : "default"}
        />
        <KpiCard
          label={t("dashboard.ordersThisMonth")}
          value={formatNumber(data.ordersThisMonth)}
          icon={Receipt}
        />
        <KpiCard
          label={t("dashboard.revenueThisMonth")}
          value={formatBaht(data.revenueThisMonth)}
          icon={DollarSign}
          tone="primary"
        />
        <KpiCard
          label={t("dashboard.profitThisMonth")}
          value={formatBaht(data.profitThisMonth)}
          icon={TrendingUp}
          tone={data.profitThisMonth >= 0 ? "default" : "destructive"}
        />
        <KpiCard
          label={t("dashboard.inventoryValue")}
          value={formatBaht(data.inventoryValueAtCost)}
          icon={Warehouse}
        />
      </div>

      <DashboardCharts data={data} />

      <AlertsPanel alerts={data.alerts} />
    </div>
  )
}
