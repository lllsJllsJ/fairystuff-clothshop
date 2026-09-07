"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  FileSpreadsheet,
  LayoutGrid,
  Plus,
  Search,
  Shirt,
  Table2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Link, usePathname, useRouter } from "@/i18n/navigation"
import type { ProductListResult, ProductSort, ProductStatusValue } from "@/db/queries/products"
import type { ProductType } from "@/db/queries/product-types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { SimpleSelect } from "@/components/ui/simple-select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProductAdminCard } from "@/components/products/product-admin-card"
import { ProductTableView } from "@/components/products/product-table-view"
import {
  ALL_COLUMNS,
  COLUMN_LABEL_KEY,
  loadVisibleColumns,
  saveVisibleColumns,
  TOGGLEABLE,
  type ProductColumnKey,
} from "@/components/products/columns"

type ProductView = "card" | "table"

const CARD_PAGE_SIZE = 12
const TABLE_PAGE_SIZE = 25

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

/**
 * The single `/admin/products` screen. Structural port of carstockpro's
 * `car-browser.tsx`: URL-synced view + filters, debounced search, TanStack
 * Query against the owner-gated JSON API with `keepPreviousData`, a
 * card <-> table toggle, and a localStorage-backed column-visibility
 * dialog. Deliberately drops carstockpro's `showFinancials` gating and PNG
 * export button (plan §12) — every owner sees every column here, and
 * there is no admin-table screenshot workflow in this app.
 */
export function ProductBrowser({ types }: { types: ProductType[] }) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [view, setView] = useState<ProductView>(() =>
    searchParams.get("view") === "table" ? "table" : "card"
  )
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<ProductStatusValue | "all">(
    () => (searchParams.get("status") as ProductStatusValue | "all") || "all"
  )
  const [type, setType] = useState<string>(() => searchParams.get("type") ?? "")
  const [sort, setSort] = useState<ProductSort>("newest")
  const [page, setPage] = useState(1)

  // Column visibility (table view). Start with everything, then load the
  // per-browser choice on the client to avoid a hydration mismatch.
  const [visibleColumns, setVisibleColumns] = useState<Set<ProductColumnKey>>(
    () => new Set(ALL_COLUMNS)
  )
  const [columnsOpen, setColumnsOpen] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => {
      setVisibleColumns(loadVisibleColumns())
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  function toggleColumn(col: ProductColumnKey) {
    setVisibleColumns((prev) => {
      const next = new Set(prev)
      if (next.has(col)) next.delete(col)
      else next.add(col)
      saveVisibleColumns(next)
      return next
    })
  }

  const debouncedSearch = useDebounced(search)
  const pageSize = view === "table" ? TABLE_PAGE_SIZE : CARD_PAGE_SIZE

  /** Reflect view + status + type in the URL without adding history entries. */
  function syncUrl(next: {
    view?: ProductView
    status?: ProductStatusValue | "all"
    type?: string
  }) {
    const params = new URLSearchParams(searchParams.toString())
    if (next.view !== undefined) {
      if (next.view === "table") params.set("view", "table")
      else params.delete("view")
    }
    if (next.status !== undefined) {
      if (next.status === "all") params.delete("status")
      else params.set("status", next.status)
    }
    if (next.type !== undefined) {
      if (!next.type) params.delete("type")
      else params.set("type", next.type)
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function changeView(next: ProductView) {
    setView(next)
    setPage(1)
    syncUrl({ view: next })
  }

  function changeStatus(next: ProductStatusValue | "all") {
    setStatus(next)
    setPage(1)
    syncUrl({ status: next })
  }

  function changeType(next: string) {
    setType(next)
    setPage(1)
    syncUrl({ type: next })
  }

  const query = useQuery<ProductListResult>({
    queryKey: ["admin-products", view, debouncedSearch, status, type, sort, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debouncedSearch,
        status,
        sort,
        page: String(page),
        pageSize: String(pageSize),
      })
      if (type) params.set("type", type)
      const res = await fetch(`/api/admin/products?${params}`)
      if (!res.ok) throw new Error("failed")
      return res.json() as Promise<ProductListResult>
    },
    placeholderData: keepPreviousData,
  })

  const statusOptions = useMemo(
    () => [
      { value: "all", label: t("common.all") },
      { value: "draft", label: t("product.statusDraft") },
      { value: "active", label: t("product.statusActive") },
      { value: "archived", label: t("product.statusArchived") },
    ],
    [t]
  )

  const typeFilterOptions = useMemo(
    () => [{ value: "", label: t("common.all") }, ...types.map((pt) => ({ value: pt.name, label: pt.name }))],
    [t, types]
  )

  const typeOptions = useMemo(() => types.map((pt) => pt.name), [types])

  const sortOptions = useMemo(
    () => [
      { value: "newest", label: t("product.sortNewest") },
      { value: "oldest", label: t("product.sortOldest") },
      { value: "price_high", label: t("product.sortPriceHigh") },
      { value: "price_low", label: t("product.sortPriceLow") },
      { value: "name_asc", label: t("product.sortNameAsc") },
    ],
    [t]
  )

  const total = query.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rows = query.data?.rows ?? []

  return (
    <div className="space-y-4">
      {/* No `flex-wrap` and no `w-full`: both previously pushed the actions
          onto their own line below the heading on a phone. `min-w-0` +
          `truncate` lets the heading give up width instead, so the actions
          stay on the heading's row, right-aligned, at every width. The
          card/table toggle no longer lives here — it sits under the filter
          row (see below) so this row holds only the two page actions. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-h3 font-bold text-foreground">{t("product.list")}</h1>
          <p className="text-body text-muted-foreground">{t("product.subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button
            variant="outline"
            render={<Link href="/admin/products/import" />}
            nativeButton={false}
            aria-label={t("product.import")}
          >
            <FileSpreadsheet />
            <span className="hidden sm:inline">{t("product.import")}</span>
          </Button>
          <Button
            render={<Link href="/admin/products/new" />}
            nativeButton={false}
            aria-label={t("product.newProduct")}
          >
            <Plus />
            <span className="hidden sm:inline">{t("product.newProduct")}</span>
          </Button>
        </div>
      </div>

      {/* Compact filter row (h-10, narrower selects): four full-height
          controls plus a search field did not fit a phone without the row
          becoming a horizontal scroller the owner had to discover. */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <div className="relative min-w-40 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={t("product.searchPlaceholder")}
            className="h-10 pl-9"
            type="search"
          />
        </div>
        <SimpleSelect
          value={status}
          onValueChange={(v) => changeStatus(v as ProductStatusValue | "all")}
          options={statusOptions}
          className="h-10 w-24 shrink-0"
        />
        <SimpleSelect
          value={type}
          onValueChange={changeType}
          options={typeFilterOptions}
          className="h-10 w-24 shrink-0"
        />
        {/* Sort and Columns are BOTH table-view-only. The card grid has no
            column headers to sort from and is browsed visually, so these
            two controls follow the view they belong to rather than
            permanently crowding the filter row. `sort` state itself is
            preserved across a view switch — only the control is hidden. */}
        {view === "table" && (
          <>
            <SimpleSelect
              value={sort}
              onValueChange={(v) => {
                setSort(v as ProductSort)
                setPage(1)
              }}
              options={sortOptions}
              className="h-10 w-32 shrink-0"
            />
            <Button variant="outline" className="h-10 shrink-0" onClick={() => setColumnsOpen(true)}>
              <Columns3 />
              <span className="hidden sm:inline">{t("product.columns")}</span>
            </Button>
          </>
        )}
      </div>

      {/* Card/table toggle, right-aligned directly under the filter row. */}
      <div className="flex justify-end">
        <div className="flex shrink-0 items-center border border-border bg-muted p-1">
          <ViewToggleButton
            active={view === "card"}
            onClick={() => changeView("card")}
            label={t("product.viewCards")}
            icon={LayoutGrid}
          />
          <ViewToggleButton
            active={view === "table"}
            onClick={() => changeView("table")}
            label={t("product.viewTable")}
            icon={Table2}
          />
        </div>
      </div>

      <Dialog open={columnsOpen} onOpenChange={setColumnsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("product.columns")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {TOGGLEABLE.map((col) => (
              <label
                key={col}
                className="flex cursor-pointer items-center justify-between gap-3 px-2 py-2 hover:bg-muted"
              >
                <span className="text-body">{t(COLUMN_LABEL_KEY[col])}</span>
                <Switch checked={visibleColumns.has(col)} onCheckedChange={() => toggleColumn(col)} />
              </label>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {query.isLoading ? (
        view === "table" ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/5]" />
            ))}
          </div>
        )
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <Shirt className="size-10 opacity-40" />
          <p>{t("product.empty")}</p>
        </div>
      ) : view === "table" ? (
        <ProductTableView
          rows={rows}
          typeOptions={typeOptions}
          onSaved={() => query.refetch()}
          visible={visibleColumns}
          startIndex={(page - 1) * pageSize}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {rows.map((product) => (
            <ProductAdminCard key={product.id} product={product} />
          ))}
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

function ViewToggleButton({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-11 items-center gap-1.5 px-3 text-body font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
