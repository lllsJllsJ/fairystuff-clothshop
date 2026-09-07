import { getTranslations, setRequestLocale } from "next-intl/server"
import {
  BadgeDollarSign,
  Boxes,
  DollarSign,
  Megaphone,
  PackageCheck,
  PackageX,
  Receipt,
  Ship,
  TrendingUp,
  WalletCards,
} from "lucide-react"

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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          label={t("dashboard.totalSkus")}
          value={formatNumber(data.totalSkus)}
          icon={Boxes}
          tone="primary"
        />
        <KpiCard
          label={t("dashboard.readyToShipSkus")}
          value={formatNumber(data.readyToShipSkus)}
          icon={PackageCheck}
        />
        <KpiCard
          label={t("dashboard.soldOutSkus")}
          value={formatNumber(data.soldOutVariantCount)}
          icon={PackageX}
          tone={data.soldOutVariantCount > 0 ? "warning" : "default"}
        />
        <KpiCard
          label={t("dashboard.totalOrders")}
          value={formatNumber(data.totalOrders)}
          icon={Receipt}
        />
        <KpiCard
          label={t("dashboard.totalRevenue")}
          value={formatBaht(data.totalRevenue)}
          icon={DollarSign}
          tone="primary"
        />
        <KpiCard
          label={t("dashboard.totalProfit")}
          value={formatBaht(data.totalProfit)}
          icon={TrendingUp}
          tone={data.totalProfit >= 0 ? "default" : "destructive"}
        />
        <KpiCard
          label={t("dashboard.advertisingCost")}
          value={formatBaht(data.advertisingCost)}
          icon={Megaphone}
        />
        <KpiCard
          label={t("dashboard.shippingCost")}
          value={formatBaht(data.shippingCost)}
          icon={Ship}
        />
        <KpiCard
          label={t("dashboard.packagingCost")}
          value={formatBaht(data.packagingCost)}
          icon={WalletCards}
        />
        <KpiCard
          label={t("dashboard.netProfit")}
          value={formatBaht(data.netProfit)}
          icon={BadgeDollarSign}
          tone={data.netProfit >= 0 ? "primary" : "destructive"}
        />
      </div>

      <DashboardCharts data={data} />

      <AlertsPanel alerts={data.alerts} />
    </div>
  )
}
