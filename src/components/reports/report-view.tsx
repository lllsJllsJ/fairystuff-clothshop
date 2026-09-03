"use client"

import { useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { FileSpreadsheet, Printer } from "lucide-react"

import { Link, usePathname, useRouter } from "@/i18n/navigation"
import { formatBaht, formatDateTime, formatNumber } from "@/lib/format"
import { exportToExcel, printReport } from "@/lib/export"
import type { ReportsData, OrderStatusValue } from "@/db/queries/reports"
import { Button } from "@/components/ui/button"
import { SimpleSelect } from "@/components/ui/simple-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type ReportTab = "monthly" | "annual" | "profitByProduct" | "inventory"

const YEARS_BACK = 4

function statusLabelKey(status: OrderStatusValue): string {
  const suffix = status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
  return `order.status${suffix}`
}

/**
 * Tabbed monthly / annual / profit-by-product / inventory report. Every
 * number here comes straight from `getReportsData()` (Phase 6, plan §11 —
 * no query is written in this component). Tab and year/month selection are
 * URL state (like `OrderList`): changing them navigates, and
 * `admin/reports/page.tsx` (the Server Component) re-fetches with the new
 * date range. Excel export and print operate on whichever tab is
 * currently on screen.
 */
export function ReportView({
  data,
  tab,
  year,
  month,
}: {
  data: ReportsData
  tab: ReportTab
  year: number
  month: number
}) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function navigate(next: { tab?: ReportTab; year?: number; month?: number }) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", next.tab ?? tab)
    params.set("year", String(next.year ?? year))
    params.set("month", String(next.month ?? month))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: YEARS_BACK + 1 }, (_, i) => currentYear - i)
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1).padStart(2, "0"),
  }))

  const tabOptions: { value: ReportTab; label: string }[] = [
    { value: "monthly", label: t("reports.monthly") },
    { value: "annual", label: t("reports.annual") },
    { value: "profitByProduct", label: t("reports.profitByProduct") },
    { value: "inventory", label: t("reports.inventory") },
  ]

  const summary = useMemo(() => {
    if (tab === "inventory") {
      return {
        count: data.inventory.length,
        revenue: null as number | null,
        cost: data.inventory.reduce((s, r) => s + r.stockValueAtCost, 0),
        profit: null as number | null,
      }
    }
    if (tab === "profitByProduct") {
      return {
        count: data.profitByProduct.reduce((s, r) => s + r.totalQuantity, 0),
        revenue: data.profitByProduct.reduce((s, r) => s + r.totalRevenue, 0),
        cost: data.profitByProduct.reduce((s, r) => s + r.totalCost, 0),
        profit: data.profitByProduct.reduce((s, r) => s + r.totalProfit, 0),
      }
    }
    return {
      count: data.orders.length,
      revenue: data.orders.reduce((s, r) => s + r.itemsTotal, 0),
      cost: data.orders.reduce((s, r) => s + r.totalCost, 0),
      profit: data.orders.reduce((s, r) => s + r.profit, 0),
    }
  }, [tab, data])

  function filenameFor(reportTab: ReportTab) {
    if (reportTab === "monthly") return `report-monthly-${year}-${String(month).padStart(2, "0")}`
    if (reportTab === "annual" || reportTab === "profitByProduct") return `report-${reportTab}-${year}`
    return `report-inventory-${formatDateTime(new Date()).replace(/[^0-9]/g, "")}`
  }

  function handleExcel() {
    const filename = filenameFor(tab)
    if (tab === "inventory") {
      exportToExcel(
        filename,
        t("reports.inventory"),
        data.inventory.map((r) => ({
          [t("product.code")]: r.productCode,
          [t("product.name")]: r.productName,
          [t("product.type")]: r.productType ?? "",
          [t("product.status")]: t(`product.status${r.status.charAt(0).toUpperCase()}${r.status.slice(1)}`),
          [t("product.sellPrice")]: r.sellPrice,
          [t("product.originalPrice")]: r.originalPrice,
          [t("reports.totalStock")]: r.totalStock,
          [t("reports.stockValue")]: r.stockValueAtCost,
        }))
      )
      return
    }
    if (tab === "profitByProduct") {
      exportToExcel(
        filename,
        t("reports.profitByProduct"),
        data.profitByProduct.map((r) => ({
          [t("product.code")]: r.productCode,
          [t("product.name")]: r.productName,
          [t("variant.quantity")]: r.totalQuantity,
          [t("reports.totalRevenue")]: r.totalRevenue,
          [t("reports.totalCost")]: r.totalCost,
          [t("reports.totalProfit")]: r.totalProfit,
        }))
      )
      return
    }
    exportToExcel(
      filename,
      tab === "monthly" ? t("reports.monthly") : t("reports.annual"),
      data.orders.map((r) => ({
        [t("order.orderNo")]: r.orderNo,
        [t("order.orderDate")]: r.orderDate,
        [t("order.customerName")]: r.customerName,
        [t("order.status")]: t(statusLabelKey(r.status)),
        [t("order.itemsTotal")]: r.itemsTotal,
        [t("order.totalCost")]: r.totalCost,
        [t("order.profit")]: r.profit,
      }))
    )
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h3 font-bold text-foreground">{t("reports.title")}</h1>
          <p className="text-body text-muted-foreground">{t("reports.subtitle")}</p>
        </div>
      </div>

      <div className="no-print flex flex-wrap items-end gap-2">
        <div className="min-w-40">
          <SimpleSelect
            value={tab}
            onValueChange={(v) => navigate({ tab: v as ReportTab })}
            options={tabOptions}
          />
        </div>
        {tab !== "inventory" && (
          <div className="w-28">
            <SimpleSelect
              value={String(year)}
              onValueChange={(v) => navigate({ year: Number(v) })}
              options={years.map((y) => ({ value: String(y), label: String(y) }))}
            />
          </div>
        )}
        {tab === "monthly" && (
          <div className="w-24">
            <SimpleSelect
              value={String(month)}
              onValueChange={(v) => navigate({ month: Number(v) })}
              options={months}
            />
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={handleExcel}>
            <FileSpreadsheet />
            {t("reports.exportExcel")}
          </Button>
          <Button variant="outline" onClick={printReport}>
            <Printer />
            {t("reports.print")}
          </Button>
        </div>
      </div>

      <div className="print-container space-y-4">
        <div className="hidden print:block">
          <h1 className="text-lg font-bold">{t("app.name")}</h1>
          <p className="text-sm">
            {t("reports.title")} · {tabOptions.find((o) => o.value === tab)?.label}
            {tab !== "inventory" ? ` · ${year}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("order.printedOn")}: {formatDateTime(new Date())}
          </p>
        </div>

        {tab === "inventory" && (
          <p className="no-print text-small text-muted-foreground">
            {t("reports.inventorySnapshotNote")}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryTile
            label={tab === "inventory" ? t("product.list") : tab === "profitByProduct" ? t("variant.quantity") : t("reports.ordersCount")}
            value={formatNumber(summary.count)}
          />
          {summary.revenue !== null && (
            <SummaryTile label={t("reports.totalRevenue")} value={formatBaht(summary.revenue)} />
          )}
          <SummaryTile
            label={tab === "inventory" ? t("reports.stockValue") : t("reports.totalCost")}
            value={formatBaht(summary.cost)}
          />
          {summary.profit !== null && (
            <SummaryTile
              label={t("reports.totalProfit")}
              value={formatBaht(summary.profit)}
              positive={summary.profit >= 0}
            />
          )}
        </div>

        <div className="overflow-x-auto border border-border bg-card">
          {tab === "inventory" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("product.code")}</TableHead>
                  <TableHead>{t("product.name")}</TableHead>
                  <TableHead>{t("product.type")}</TableHead>
                  <TableHead className="text-right">{t("reports.totalStock")}</TableHead>
                  <TableHead className="text-right">{t("reports.stockValue")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.inventory.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/admin/products/${r.id}/edit`} className="text-link hover:underline">
                        {r.productCode}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-56 truncate">{r.productName}</TableCell>
                    <TableCell>{r.productType ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.totalStock)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatBaht(r.stockValueAtCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : tab === "profitByProduct" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("product.code")}</TableHead>
                  <TableHead>{t("product.name")}</TableHead>
                  <TableHead className="text-right">{t("variant.quantity")}</TableHead>
                  <TableHead className="text-right">{t("reports.totalRevenue")}</TableHead>
                  <TableHead className="text-right">{t("reports.totalCost")}</TableHead>
                  <TableHead className="text-right">{t("reports.totalProfit")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.profitByProduct.map((r) => (
                  <TableRow key={r.productCode}>
                    <TableCell>{r.productCode}</TableCell>
                    <TableCell className="max-w-56 truncate">{r.productName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.totalQuantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(r.totalRevenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(r.totalCost)}</TableCell>
                    <TableCell
                      className={
                        r.totalProfit >= 0
                          ? "text-right font-medium tabular-nums text-foreground"
                          : "text-right font-medium tabular-nums text-destructive"
                      }
                    >
                      {formatBaht(r.totalProfit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("order.orderNo")}</TableHead>
                  <TableHead>{t("order.orderDate")}</TableHead>
                  <TableHead>{t("order.customerName")}</TableHead>
                  <TableHead>{t("order.status")}</TableHead>
                  <TableHead className="text-right">{t("order.itemsTotal")}</TableHead>
                  <TableHead className="text-right">{t("order.totalCost")}</TableHead>
                  <TableHead className="text-right">{t("order.profit")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.orders.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/admin/orders/${r.id}`} className="text-link hover:underline">
                        #{r.orderNo}
                      </Link>
                    </TableCell>
                    <TableCell>{r.orderDate}</TableCell>
                    <TableCell className="max-w-40 truncate">{r.customerName}</TableCell>
                    <TableCell>{t(statusLabelKey(r.status))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(r.itemsTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(r.totalCost)}</TableCell>
                    <TableCell
                      className={
                        r.profit >= 0
                          ? "text-right font-medium tabular-nums text-foreground"
                          : "text-right font-medium tabular-nums text-destructive"
                      }
                    >
                      {formatBaht(r.profit)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {((tab === "inventory" && data.inventory.length === 0) ||
            (tab === "profitByProduct" && data.profitByProduct.length === 0) ||
            (tab !== "inventory" && tab !== "profitByProduct" && data.orders.length === 0)) && (
            <p className="p-6 text-center text-small text-muted-foreground">
              {t("reports.noRowsForRange")}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryTile({
  label,
  value,
  positive,
}: {
  label: string
  value: string
  positive?: boolean
}) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-small text-muted-foreground">{label}</p>
      <p
        className={
          positive === undefined
            ? "mt-1 text-h4 font-bold text-foreground"
            : positive
              ? "mt-1 text-h4 font-bold text-foreground"
              : "mt-1 text-h4 font-bold text-destructive"
        }
      >
        {value}
      </p>
    </div>
  )
}
