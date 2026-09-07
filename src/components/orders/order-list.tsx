"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  FileSpreadsheet,
  Loader2,
  Plus,
  Receipt,
  Search,
  Trash2,
  SlidersHorizontal,
} from "lucide-react"

import { Link, usePathname, useRouter } from "@/i18n/navigation"
import { formatBaht, formatDate } from "@/lib/format"
import { exportToExcel } from "@/lib/export"
import type { OrderSort, OrderStatusValue } from "@/db/queries/orders"
import type { OrderStatusLabel } from "@/db/queries/settings"
import { DEFAULT_ADMIN_STATUS_LABELS } from "@/lib/order-status"
import { orderStatusValues } from "@/lib/validations/order"
import type { OrderListApiResult, OrderListRow } from "@/app/api/admin/orders/route"
import { deleteOrder, setOrderStatus } from "@/app/[locale]/admin/orders/actions"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SimpleSelect } from "@/components/ui/simple-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

const PAGE_SIZE = 20

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

/**
 * The single `/admin/orders` screen: date-range + status filters, search by
 * customer name or order number, sort, pagination, Excel export, and an
 * inline quick-status changer per row. Structural port of
 * `product-browser.tsx` (URL-synced filters, debounced search, TanStack
 * Query with `keepPreviousData`) without the card/table view toggle —
 * orders are tabular by nature, so there's only one view here.
 *
 * Talks to `GET /api/admin/orders` (this phase's own route, not
 * `queries/orders.ts` directly) because that route is where the
 * search-term and item-count gaps in `getOrders()` are worked around — see
 * that file's header comment.
 */
export function OrderList({ statusLabels, locale }: { statusLabels: OrderStatusLabel[]; locale: string }) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const statusLabel = (status: OrderStatusValue) => {
    const row = statusLabels.find((item) => item.status === status)
    return locale === "en" ? (row?.labelEn ?? DEFAULT_ADMIN_STATUS_LABELS[status].en) : (row?.labelTh ?? DEFAULT_ADMIN_STATUS_LABELS[status].th)
  }

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<OrderStatusValue | "all">(
    () => (searchParams.get("status") as OrderStatusValue | "all") || "all"
  )
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("dateFrom") ?? "")
  const [dateTo, setDateTo] = useState(() => searchParams.get("dateTo") ?? "")
  const [sort, setSort] = useState<OrderSort>("newest")

  /**
   * Header click: first click on a column takes its descending order,
   * clicking the same column again flips to ascending. Sorting always
   * returns to page 1 — staying on page 5 of a different ordering shows
   * rows the owner never asked for.
   */
  function applySort(next: OrderSort) {
    setSort(next)
    setPage(1)
  }
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const debouncedSearch = useDebounced(search)

  function syncUrl(next: { status?: OrderStatusValue | "all"; dateFrom?: string; dateTo?: string }) {
    const params = new URLSearchParams(searchParams.toString())
    if (next.status !== undefined) {
      if (next.status === "all") params.delete("status")
      else params.set("status", next.status)
    }
    if (next.dateFrom !== undefined) {
      if (!next.dateFrom) params.delete("dateFrom")
      else params.set("dateFrom", next.dateFrom)
    }
    if (next.dateTo !== undefined) {
      if (!next.dateTo) params.delete("dateTo")
      else params.set("dateTo", next.dateTo)
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function changeStatus(next: OrderStatusValue | "all") {
    setStatus(next)
    setPage(1)
    syncUrl({ status: next })
  }

  function changeDateFrom(next: string) {
    setDateFrom(next)
    setPage(1)
    syncUrl({ dateFrom: next })
  }

  function changeDateTo(next: string) {
    setDateTo(next)
    setPage(1)
    syncUrl({ dateTo: next })
  }

  const query = useQuery<OrderListApiResult>({
    queryKey: ["admin-orders", debouncedSearch, status, dateFrom, dateTo, sort, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debouncedSearch,
        status,
        sort,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)
      const res = await fetch(`/api/admin/orders?${params}`)
      if (!res.ok) throw new Error("failed")
      return res.json() as Promise<OrderListApiResult>
    },
    placeholderData: keepPreviousData,
  })

  const rows = query.data?.rows ?? []
  const total = query.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function handleStatusChange(row: OrderListRow, next: OrderStatusValue) {
    let refundReason: string | undefined
    if (next === "refund") {
      refundReason = window.prompt(t("order.refundReasonPrompt"))?.trim() || undefined
      if (!refundReason) return
    }
    const result = await setOrderStatus(row.id, next, refundReason)
    if (!result.ok) {
      toast.error(result.error === "items_pending" ? t("order.itemsPending") : result.error === "reason_required" ? t("order.refundReasonRequired") : t("errors.generic"))
      return
    }
    toast.success(t("order.statusUpdated"))
    query.refetch()
  }

  async function handleDelete(row: OrderListRow) {
    if (!confirm(t("order.deleteConfirm"))) return
    const result = await deleteOrder(row.id)
    if (!result.ok) {
      toast.error(t("errors.generic"))
      return
    }
    toast.success(t("order.deleted"))
    query.refetch()
  }

  // Exports exactly the rows currently loaded on screen (the current page,
  // after filters/search) — not every order matching the filters. Good
  // enough for a "export what I'm looking at" workflow; a "export all
  // filtered results" button would need its own unbounded fetch.
  function handleExport() {
    exportToExcel(
      "orders",
      t("order.list"),
      rows.map((row) => ({
        [t("order.orderNo")]: row.orderNo,
        [t("order.orderDate")]: row.orderDate,
        [t("order.customerName")]: row.customerName,
        [t("order.itemCount")]: row.itemCount,
        [t("order.itemsTotal")]: Number(row.itemsTotal),
        [t("order.profit")]: Number(row.profit ?? 0),
        [t("order.status")]: statusLabel(row.status),
      }))
    )
  }

  const hasActiveFilters =
    dateFrom !== "" || dateTo !== "" || status !== "all" || sort !== "newest"

  return (
    <div className="space-y-4">
      {/* No `flex-wrap` and no `w-full` on the button group: both are what
          previously pushed the actions onto their own line below the
          heading on a phone. `min-w-0` + `truncate` lets the heading give
          up width instead, so the actions stay on the heading's row,
          right-aligned, at every width. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-h3 font-bold text-foreground">{t("order.list")}</h1>
          <p className="text-body text-muted-foreground">{t("order.subtitle")}</p>
        </div>
        {/* Matches the product list toolbar: labels collapse to icons
            below `sm`. */}
        <div className="flex shrink-0 justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={rows.length === 0}
            aria-label={t("reports.exportExcel")}
          >
            <FileSpreadsheet />
            <span className="hidden sm:inline">{t("reports.exportExcel")}</span>
          </Button>
          <Button
            render={<Link href="/admin/orders/new" />}
            nativeButton={false}
            aria-label={t("order.newOrder")}
          >
            <Plus />
            <span className="hidden sm:inline">{t("order.newOrder")}</span>
          </Button>
        </div>
      </div>

      {/* Search always visible; the four secondary filters are far too wide
          for a 320px row, so below `md` they move into a bottom sheet behind
          one button (the same pattern the storefront's ShopBrowser uses).
          Above `md` they stay inline as before. */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={t("order.searchPlaceholder")}
            className="h-11 pl-9"
            type="search"
          />
        </div>
        <Button
          variant="outline"
          className="h-11 shrink-0 md:hidden"
          onClick={() => setFiltersOpen(true)}
          aria-label={t("common.filter")}
        >
          <SlidersHorizontal />
          {hasActiveFilters && (
            <span className="ml-1 inline-flex size-2 shrink-0 bg-primary" aria-hidden />
          )}
        </Button>

        <div className="hidden items-center gap-2 md:flex">
          <OrderFilterFields
            dateFrom={dateFrom}
            dateTo={dateTo}
            status={status}
            sort={sort}
            statusLabel={statusLabel}
            onDateFrom={changeDateFrom}
            onDateTo={changeDateTo}
            onStatus={changeStatus}
            onSort={(v) => { setSort(v); setPage(1) }}
            t={t}
          />
        </div>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto md:hidden">
          <SheetHeader>
            <SheetTitle>{t("common.filter")}</SheetTitle>
          </SheetHeader>
          <div className="grid gap-3 px-4 pb-4">
            <OrderFilterFields
              stacked
              dateFrom={dateFrom}
              dateTo={dateTo}
              status={status}
              sort={sort}
              statusLabel={statusLabel}
              onDateFrom={changeDateFrom}
              onDateTo={changeDateTo}
              onStatus={changeStatus}
              onSort={(v) => { setSort(v); setPage(1) }}
              t={t}
            />
          </div>
          <div className="border-t border-border p-4">
            <SheetClose render={<Button className="w-full" />}>{t("shop.applyFilters")}</SheetClose>
          </div>
        </SheetContent>
      </Sheet>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Receipt className="size-10 opacity-40" />
          <p>{t("order.empty")}</p>
        </div>
      ) : (
        <>
        {/* Mobile: a card per order. The table's eight columns cannot be
            read on a phone even inside a horizontal scroller, so below `md`
            each order becomes a card whose first line is the customer name
            with the order number right-aligned (matching the product card).

            The whole card opens the order. Rather than an onClick on the
            list item (invisible to keyboards and screen readers), a single
            absolutely-positioned link is stretched over the card: it stays
            a real, focusable, middle-clickable anchor, and the status
            select and delete button opt back out via `relative z-10`. */}
        <ul className="space-y-2 md:hidden">
          {rows.map((row) => (
            <li
              key={row.id}
              className="relative border border-border bg-card p-3 transition-colors hover:bg-muted/40 focus-within:ring-3 focus-within:ring-ring/50"
            >
              <Link
                href={`/admin/orders/${row.id}`}
                aria-label={`${t("order.viewOrder")} #${row.orderNo}`}
                className="absolute inset-0 z-0 focus:outline-none"
              />
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-body font-bold text-foreground">
                  {row.customerName}
                </span>
                <span className="shrink-0 text-small text-muted-foreground tabular-nums">
                  #{row.orderNo}
                </span>
              </div>
              <p className="mt-0.5 text-small text-muted-foreground">
                {formatDate(row.orderDate)} · {row.itemCount} {t("order.itemCount")}
              </p>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-body font-bold text-foreground tabular-nums">
                  {formatBaht(Number(row.itemsTotal))}
                </span>
                <span className="text-small text-muted-foreground tabular-nums">
                  {t("order.profit")}: {formatBaht(Number(row.profit ?? 0))}
                </span>
              </div>
              {/* Sits above the stretched overlay link so the select and the
                  delete button stay clickable inside a card that is
                  otherwise entirely a link to the order. */}
              <div className="relative z-10 mt-3 flex items-center gap-2">
                <SimpleSelect
                  value={row.status}
                  onValueChange={(v) => handleStatusChange(row, v as OrderStatusValue)}
                  options={orderStatusValues.map((st) => ({ value: st, label: statusLabel(st) }))}
                  className="h-11 min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(row)}
                  aria-label={t("common.delete")}
                  className="h-11 shrink-0 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="hidden border border-border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label={t("order.orderNo")}
                  descending="orderno_high"
                  ascending="orderno_low"
                  sort={sort}
                  onSort={applySort}
                />
                <SortableHead
                  label={t("order.orderDate")}
                  descending="newest"
                  ascending="oldest"
                  sort={sort}
                  onSort={applySort}
                />
                <TableHead>{t("order.customerName")}</TableHead>
                <TableHead className="text-right">{t("order.itemCount")}</TableHead>
                <TableHead className="text-right">{t("order.itemsTotal")}</TableHead>
                <TableHead className="text-right">{t("order.profit")}</TableHead>
                <TableHead>{t("order.status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/admin/orders/${row.id}`}
                      className="font-medium text-link hover:underline"
                    >
                      #{row.orderNo}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(row.orderDate)}</TableCell>
                  <TableCell className="max-w-40 truncate">{row.customerName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.itemCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBaht(Number(row.itemsTotal))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBaht(Number(row.profit ?? 0))}
                  </TableCell>
                  <TableCell>
                    <SimpleSelect
                      value={row.status}
                      onValueChange={(v) => handleStatusChange(row, v as OrderStatusValue)}
                      options={orderStatusValues.map((s) => ({
                        value: s,
                        label: statusLabel(s),
                      }))}
                      className="h-8 min-w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(row)}
                      aria-label={t("common.delete")}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      {query.isFetching && !query.isLoading && (
        <div className="flex justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft />
          </Button>
          <span className="text-body text-muted-foreground">
            {t("common.page")} {page} {t("common.of")} {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * A column header that sorts. Kept in this file rather than `ui/table`
 * because the sort vocabulary (`OrderSort`) is the order list's own — a
 * generic sortable header would have to invent a column abstraction that
 * only one table uses.
 *
 * `aria-sort` is what actually tells a screen reader the table is sorted
 * and which way; the chevron is the sighted equivalent.
 */
function SortableHead({
  label,
  ascending,
  descending,
  sort,
  onSort,
}: {
  label: string
  /** Sort value for A->Z / oldest / lowest. */
  ascending: OrderSort
  /** Sort value for Z->A / newest / highest — the first click's result. */
  descending: OrderSort
  sort: OrderSort
  onSort: (next: OrderSort) => void
}) {
  const isAscending = sort === ascending
  const isActive = isAscending || sort === descending

  return (
    <TableHead
      aria-sort={
        isActive ? (isAscending ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(isActive && !isAscending ? ascending : descending)}
        className="group -mx-1 flex items-center gap-1 rounded px-1 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {label}
        {isActive ? (
          isAscending ? (
            <ChevronUp className="size-3.5" aria-hidden />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden />
          )
        ) : (
          <ChevronsUpDown
            className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60"
            aria-hidden
          />
        )}
      </button>
    </TableHead>
  )
}


/**
 * The four secondary order filters, rendered either inline (desktop) or
 * stacked inside the mobile filter sheet. One definition so the two
 * layouts can never drift apart.
 */
function OrderFilterFields({
  stacked = false,
  dateFrom,
  dateTo,
  status,
  sort,
  statusLabel,
  onDateFrom,
  onDateTo,
  onStatus,
  onSort,
  t,
}: {
  stacked?: boolean
  dateFrom: string
  dateTo: string
  status: OrderStatusValue | "all"
  sort: OrderSort
  statusLabel: (s: OrderStatusValue) => string
  onDateFrom: (v: string) => void
  onDateTo: (v: string) => void
  onStatus: (v: OrderStatusValue | "all") => void
  onSort: (v: OrderSort) => void
  t: (key: string) => string
}) {
  const field = stacked ? "h-11 w-full" : "h-11 w-36 shrink-0"
  const select = stacked ? "h-11 w-full" : "h-11 w-32 shrink-0"
  return (
    <>
      <Labelled stacked={stacked} label={t("order.dateFrom")}>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFrom(e.target.value)}
          className={field}
          aria-label={t("order.dateFrom")}
        />
      </Labelled>
      <Labelled stacked={stacked} label={t("order.dateTo")}>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => onDateTo(e.target.value)}
          className={field}
          aria-label={t("order.dateTo")}
        />
      </Labelled>
      <Labelled stacked={stacked} label={t("order.status")}>
        <SimpleSelect
          value={status}
          onValueChange={(v) => onStatus(v as OrderStatusValue | "all")}
          options={[
            { value: "all", label: t("common.all") },
            ...orderStatusValues.map((s) => ({ value: s, label: statusLabel(s) })),
          ]}
          className={select}
        />
      </Labelled>
      <Labelled stacked={stacked} label={t("common.sort")}>
        <SimpleSelect
          value={sort}
          onValueChange={(v) => onSort(v as OrderSort)}
          options={[
            { value: "newest", label: t("order.sortNewest") },
            { value: "oldest", label: t("order.sortOldest") },
            { value: "orderno_high", label: t("order.sortOrderNoHigh") },
            { value: "orderno_low", label: t("order.sortOrderNoLow") },
            { value: "total_high", label: t("order.sortTotalHigh") },
            { value: "total_low", label: t("order.sortTotalLow") },
          ]}
          className={select}
        />
      </Labelled>
    </>
  )
}

/** Labels only appear in the stacked sheet; inline they would break the row. */
function Labelled({
  stacked,
  label,
  children,
}: {
  stacked: boolean
  label: string
  children: React.ReactNode
}) {
  if (!stacked) return <>{children}</>
  return (
    <div className="space-y-1.5">
      <span className="block text-small font-bold text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
