import { setRequestLocale } from "next-intl/server"

import { getReportsData, type ReportsParams } from "@/db/queries/reports"
import { ReportView, type ReportTab } from "@/components/reports/report-view"

const REPORT_TABS: ReportTab[] = ["monthly", "annual", "profitByProduct", "inventory"]

function isReportTab(value: string | undefined): value is ReportTab {
  return !!value && (REPORT_TABS as string[]).includes(value)
}

/** Zero-padded "YYYY-MM-DD" for the first/last day of a given year+month. */
function monthRange(year: number, month: number): { dateFrom: string; dateTo: string } {
  const mm = String(month).padStart(2, "0")
  const lastDay = new Date(year, month, 0).getDate()
  return {
    dateFrom: `${year}-${mm}-01`,
    dateTo: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  }
}

/**
 * `getReportsData(params)` (Phase 6, already written — this page never
 * duplicates its SQL) is the single query behind every tab. The date range
 * passed to it is derived from the `tab`/`year`/`month` search params, so
 * switching tabs or the year/month selectors re-runs this Server Component
 * with a narrower or wider range — the "URL as state" pattern already used
 * by `OrderList` (plan's web/patterns rule). `inventory` ignores the range
 * entirely (see reports.ts's doc comment — it's a point-in-time snapshot),
 * so passing one along for that tab is harmless.
 */
export default async function AdminReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ tab?: string; year?: string; month?: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const sp = await searchParams

  const now = new Date()
  const tab: ReportTab = isReportTab(sp.tab) ? sp.tab : "monthly"
  const year = Number(sp.year) || now.getFullYear()
  const month = Number(sp.month) || now.getMonth() + 1

  const range: ReportsParams =
    tab === "monthly"
      ? monthRange(year, month)
      : tab === "inventory"
        ? {}
        : { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` }

  const data = await getReportsData(range)

  return <ReportView data={data} tab={tab} year={year} month={month} />
}
