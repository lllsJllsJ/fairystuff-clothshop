"use client"

import { useTranslations } from "next-intl"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts"

import { formatBahtCompact, formatNumber } from "@/lib/format"
import type { DashboardData } from "@/db/queries/dashboard"

/**
 * Port of carstockpro's `dashboard/charts.tsx`. Restyled to consume this
 * repo's `--chart-*` tokens (fuchsia/sky-blue/bright-blue/mint/brown, see
 * globals.css) instead of carstockpro's own palette, and reshaped for
 * `DashboardData`'s actual fields (plan §12): `monthlyRevenue` +
 * `monthlyProfit` are separate arrays sharing the same month keys, zipped
 * here into one combo chart; `typeDistribution` replaces brand
 * distribution; a bonus `stockBuckets` chart (sold_out/low/medium/high
 * units-held buckets — dashboard.ts's stand-in for carstockpro's
 * days-held aging, since clothing variants have no purchase date to age
 * against) rounds out the row without any extra query.
 */

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-card p-4">
      <h3 className="mb-3 text-body font-bold text-foreground">{title}</h3>
      <div className="h-64 w-full">{children}</div>
    </div>
  )
}

const axisProps = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: 0,
    fontSize: 12,
    color: "var(--popover-foreground)",
  },
} as const

const STOCK_BUCKET_LABEL_KEYS = {
  sold_out: "dashboard.stockSoldOut",
  low: "dashboard.stockLow",
  medium: "dashboard.stockMedium",
  high: "dashboard.stockHigh",
} as const
const STOCK_BUCKET_ORDER = ["sold_out", "low", "medium", "high"] as const

export function DashboardCharts({ data }: { data: DashboardData }) {
  const t = useTranslations()

  const monthlyPerformance = data.monthlyRevenue.map((point, i) => ({
    month: point.month,
    revenue: point.value,
    profit: data.monthlyProfit[i]?.value ?? 0,
  }))

  const stockBuckets = STOCK_BUCKET_ORDER.map((key) => {
    const bucket = data.stockBuckets.find((b) => b.bucket === key)
    return {
      bucket: t(STOCK_BUCKET_LABEL_KEYS[key]),
      count: bucket?.count ?? 0,
    }
  })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title={t("dashboard.monthlyPerformance")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyPerformance}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...axisProps} width={48} tickFormatter={(v) => formatBahtCompact(v)} />
            <Tooltip {...tooltipStyle} formatter={(value) => formatBahtCompact(Number(value))} />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) =>
                value === "revenue" ? t("dashboard.revenueLegend") : t("dashboard.profitLegend")
              }
            />
            <Bar dataKey="revenue" fill="var(--chart-1)" />
            <Bar dataKey="profit" fill="var(--chart-2)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t("dashboard.typeDistribution")}>
        {data.typeDistribution.length === 0 ? (
          <div className="flex h-full items-center justify-center text-small text-muted-foreground">
            {t("common.noData")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.typeDistribution}
                dataKey="count"
                nameKey="type"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={50}
                paddingAngle={2}
                label={(props: { name?: string }) => props.name ?? ""}
              >
                {data.typeDistribution.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title={t("dashboard.stockLevels")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stockBuckets}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="bucket" {...axisProps} />
            <YAxis {...axisProps} width={36} allowDecimals={false} tickFormatter={(v) => formatNumber(v)} />
            <Tooltip {...tooltipStyle} formatter={(value) => formatNumber(Number(value))} />
            <Bar dataKey="count" fill="var(--chart-3)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
