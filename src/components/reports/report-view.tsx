"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { FileSpreadsheet, Printer, SlidersHorizontal } from "lucide-react"

import { Link, usePathname, useRouter } from "@/i18n/navigation"
import { formatBaht, formatDateTime, formatNumber } from "@/lib/format"
import { exportToExcel, printReport } from "@/lib/export"
import type { ReportsData, OrderStatusValue } from "@/db/queries/reports"
import type { OrderStatusLabel } from "@/db/queries/settings"
import { DEFAULT_ADMIN_STATUS_LABELS } from "@/lib/order-status"
import { Button } from "@/components/ui/button"
import { SimpleSelect } from "@/components/ui/simple-select"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
  statusLabels,
  locale,
}: {
  data: ReportsData
  tab: ReportTab
  year: number
  month: number
  statusLabels: OrderStatusLabel[]
  locale: string
}) {
  const t = useTranslations()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function statusLabel(status: OrderStatusValue) {
    const row = statusLabels.find((item) => item.status === status)
    return locale === "en"
      ? (row?.labelEn ?? DEFAULT_ADMIN_STATUS_LABELS[status].en)
      : (row?.labelTh ?? DEFAULT_ADMIN_STATUS_LABELS[status].th)
  }

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
        advertising: null as number | null,
      }
    }
    if (tab === "profitByProduct") {
      return {
        count: data.profitByProduct.reduce((s, r) => s + r.totalQuantity, 0),
        revenue: data.profitByProduct.reduce((s, r) => s + r.totalRevenue, 0),
        cost: data.profitByProduct.reduce((s, r) => s + r.totalCost, 0),
        profit: data.profitByProduct.reduce((s, r) => s + r.totalProfit, 0),
        advertising: null as number | null,
      }
    }
    return {
      count: data.orders.length,
      revenue: data.orders.reduce((s, r) => s + r.itemsTotal, 0),
      cost: data.orders.reduce((s, r) => s + r.totalCost, 0),
      profit: data.orders.reduce((s, r) => s + r.profit, 0),
      advertising: data.orders.reduce((s, r) => s + r.advertisingCost, 0),
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
        [t("order.status")]: statusLabel(r.status),
        [t("order.itemsTotal")]: r.itemsTotal,
        [t("order.advertisingCost")]: r.advertisingCost,
        [t("order.totalCost")]: r.totalCost,
        [t("order.profit")]: r.profit,
      }))
    )
  }

  return (
    <div className="space-y-4">
      {/* Export/print live up here with the heading (right-aligned) rather
          than trailing the filter row, so the filter row holds only the
          controls that change what you are looking at. */}
      <div className="no-print flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-h3 font-bold text-foreground">{t("reports.title")}</h1>
          <p className="text-body text-muted-foreground">{t("reports.subtitle")}</p>
        </div>
        <div className="flex shrink-0 justify-end gap-2">
          <Button variant="outline" onClick={handleExcel} aria-label={t("reports.exportExcel")}>
            <FileSpreadsheet />
            <span className="hidden sm:inline">{t("reports.exportExcel")}</span>
          </Button>
          <Button variant="outline" onClick={printReport} aria-label={t("reports.print")}>
            <Printer />
            <span className="hidden sm:inline">{t("reports.print")}</span>
          </Button>
        </div>
      </div>

      {/* The report picker is the one control that must stay reachable, so
          it keeps the full row on mobile; year/month move into the filter
          sheet below `sm`. */}
      <div className="no-print flex items-center gap-2">
        <div className="min-w-0 flex-1 sm:min-w-40 sm:flex-none">
          <SimpleSelect
            value={tab}
            onValueChange={(v) => navigate({ tab: v as ReportTab })}
            options={tabOptions}
            className="h-11"
          />
        </div>

        {/* Inline period selects from `sm` up */}
        {tab !== "inventory" && (
          <div className="hidden w-28 sm:block">
            <SimpleSelect
              value={String(year)}
              onValueChange={(v) => navigate({ year: Number(v) })}
              options={years.map((y) => ({ value: String(y), label: String(y) }))}
              className="h-11"
            />
          </div>
        )}
        {tab === "monthly" && (
          <div className="hidden w-24 sm:block">
            <SimpleSelect
              value={String(month)}
              onValueChange={(v) => navigate({ month: Number(v) })}
              options={months}
              className="h-11"
            />
          </div>
        )}

        {tab !== "inventory" && (
          <Button
            variant="outline"
            className="h-11 shrink-0 sm:hidden"
            onClick={() => setFiltersOpen(true)}
            aria-label={t("common.filter")}
          >
            <SlidersHorizontal />
          </Button>
        )}
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto sm:hidden">
          <SheetHeader>
            <SheetTitle>{t("common.filter")}</SheetTitle>
          </SheetHeader>
          <div className="grid gap-3 px-4 pb-4">
            {tab !== "inventory" && (
              <div className="space-y-1.5">
                <span className="block text-small font-bold text-muted-foreground">
                  {t("reports.year")}
                </span>
                <SimpleSelect
                  value={String(year)}
                  onValueChange={(v) => navigate({ year: Number(v) })}
                  options={years.map((y) => ({ value: String(y), label: String(y) }))}
                  className="h-11"
                />
              </div>
            )}
            {tab === "monthly" && (
              <div className="space-y-1.5">
                <span className="block text-small font-bold text-muted-foreground">
                  {t("reports.month")}
                </span>
                <SimpleSelect
                  value={String(month)}
                  onValueChange={(v) => navigate({ month: Number(v) })}
                  options={months}
                  className="h-11"
                />
              </div>
            )}
          </div>
          <div className="border-t border-border p-4">
            <SheetClose render={<Button className="w-full" />}>{t("shop.applyFilters")}</SheetClose>
          </div>
        </SheetContent>
      </Sheet>

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

        {/* Two tiles per row at every width. */}
        <div className="grid grid-cols-2 gap-3">
          <SummaryTile
            label={tab === "inventory" ? t("product.list") : tab === "profitByProduct" ? t("variant.quantity") : t("reports.ordersCount")}
            value={formatNumber(summary.count)}
          />
          {summary.advertising !== null && (
            <SummaryTile
              label={t("reports.totalAdvertisingCost")}
              value={formatBaht(summary.advertising)}
            />
          )}
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
                  {/* Short, report-only column labels (`reports.col*`).
                      The `order.*` keys stay long-form — they also label
                      the order list and the Excel export, where the extra
                      words carry their weight; this eight-column table is
                      the one place they cost real width. */}
                  <TableHead>{t("reports.colNo")}</TableHead>
                  <TableHead>{t("order.orderDate")}</TableHead>
                  <TableHead>{t("order.customerName")}</TableHead>
                  <TableHead>{t("reports.colStatus")}</TableHead>
                  <TableHead className="text-right">{t("order.itemsTotal")}</TableHead>
                  <TableHead className="text-right">{t("reports.colAdvertising")}</TableHead>
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
                    <TableCell>{statusLabel(r.status)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(r.itemsTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatBaht(r.advertisingCost)}</TableCell>
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
    <div className="border border-border bg-card p-3 sm:p-4">
      {/* Labels are full phrases ("Total advertising cost"); at three
          columns on a 320px screen they need to wrap rather than force the
          grid wider than the viewport. */}
      <p className="text-small leading-tight break-words text-muted-foreground">{label}</p>
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
