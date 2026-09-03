"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "lucide-react"

import { usePathname, useRouter } from "@/i18n/navigation"
import type {
  PublicProductListResult,
  PublicProductType,
  PublicSort,
} from "@/db/queries/storefront"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SimpleSelect } from "@/components/ui/simple-select"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ProductGrid } from "@/components/shop/product-grid"
import { ShopFilters, type ShopFilterValues } from "@/components/shop/shop-filters"

const PAGE_SIZE = 24

const DEFAULT_FILTERS: ShopFilterValues = {
  type: "",
  color: "",
  size: "",
  inStockOnly: false,
  minPrice: "",
  maxPrice: "",
}

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

function setParam(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value)
  else params.delete(key)
}

/**
 * The `/shop` catalogue. Structural port of `product-browser.tsx` (itself a
 * port of carstockpro's `car-browser.tsx`): debounced search, URL-synced
 * filters/sort/page, TanStack Query with `keepPreviousData` so paging never
 * blanks the grid — aimed at the public `GET /api/products` instead of the
 * owner-gated admin endpoint.
 *
 * `initialResult` is the same page-1, no-filters fetch the server component
 * already made for SEO; it seeds `useQuery`'s `initialData` on the very
 * first render, so the HTML the crawler sees and the HTML React hydrates
 * into are identical — no refetch, no flash, no layout shift.
 */
export function ShopBrowser({
  initialResult,
  types,
  colorOptions,
}: {
  initialResult: PublicProductListResult
  types: PublicProductType[]
  colorOptions: string[]
}) {
  const t = useTranslations()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "")
  const [filters, setFilters] = useState<ShopFilterValues>(() => ({
    type: searchParams.get("type") ?? "",
    color: searchParams.get("color") ?? "",
    size: searchParams.get("size") ?? "",
    inStockOnly: searchParams.get("inStock") === "true",
    minPrice: searchParams.get("minPrice") ?? "",
    maxPrice: searchParams.get("maxPrice") ?? "",
  }))
  const [sort, setSort] = useState<PublicSort>(
    () => (searchParams.get("sort") as PublicSort) || "newest"
  )
  const [page, setPage] = useState(() => Number(searchParams.get("page") ?? "1") || 1)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const debouncedSearch = useDebounced(search)

  /** Reflect filters/sort/page/search in the URL without adding history entries. */
  function syncUrl(next: {
    q?: string
    filters?: ShopFilterValues
    sort?: PublicSort
    page?: number
  }) {
    const params = new URLSearchParams(searchParams.toString())
    const q = next.q ?? search
    const f = next.filters ?? filters
    const s = next.sort ?? sort
    const p = next.page ?? page

    setParam(params, "q", q)
    setParam(params, "type", f.type)
    setParam(params, "color", f.color)
    setParam(params, "size", f.size)
    setParam(params, "inStock", f.inStockOnly ? "true" : "")
    setParam(params, "minPrice", f.minPrice)
    setParam(params, "maxPrice", f.maxPrice)
    setParam(params, "sort", s === "newest" ? "" : s)
    setParam(params, "page", p > 1 ? String(p) : "")

    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  // The search box syncs on the debounced value (matching when the fetch
  // itself fires) rather than on every keystroke, so typing doesn't spam
  // the history/navigation layer with a `router.replace` per character.
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setPage(1)
    syncUrl({ q: debouncedSearch, page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  function updateFilter<K extends keyof ShopFilterValues>(key: K, value: ShopFilterValues[K]) {
    const next = { ...filters, [key]: value }
    setFilters(next)
    setPage(1)
    syncUrl({ filters: next, page: 1 })
  }

  function clearFilters() {
    setFilters(DEFAULT_FILTERS)
    setSearch("")
    setPage(1)
    syncUrl({ filters: DEFAULT_FILTERS, q: "", page: 1 })
  }

  function changeSort(next: PublicSort) {
    setSort(next)
    setPage(1)
    syncUrl({ sort: next, page: 1 })
  }

  function changePage(next: number) {
    setPage(next)
    syncUrl({ page: next })
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const isDefaultQuery =
    debouncedSearch === "" &&
    page === 1 &&
    sort === "newest" &&
    filters.type === "" &&
    filters.color === "" &&
    filters.size === "" &&
    !filters.inStockOnly &&
    filters.minPrice === "" &&
    filters.maxPrice === ""

  const query = useQuery<PublicProductListResult>({
    queryKey: ["public-products", debouncedSearch, filters, sort, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      setParam(params, "search", debouncedSearch)
      setParam(params, "type", filters.type)
      setParam(params, "color", filters.color)
      setParam(params, "size", filters.size)
      setParam(params, "inStock", filters.inStockOnly ? "true" : "")
      setParam(params, "minPrice", filters.minPrice)
      setParam(params, "maxPrice", filters.maxPrice)
      params.set("sort", sort)
      params.set("page", String(page))
      params.set("pageSize", String(PAGE_SIZE))

      const res = await fetch(`/api/products?${params.toString()}`)
      if (!res.ok) throw new Error("failed")
      return res.json() as Promise<PublicProductListResult>
    },
    initialData: isDefaultQuery ? initialResult : undefined,
    placeholderData: keepPreviousData,
  })

  const sortOptions = useMemo(
    () => [
      { value: "newest", label: t("shop.sortNewest") },
      { value: "price_asc", label: t("shop.sortPriceAsc") },
      { value: "price_desc", label: t("shop.sortPriceDesc") },
    ],
    [t]
  )

  const hasActiveFilters =
    filters.type !== "" ||
    filters.color !== "" ||
    filters.size !== "" ||
    filters.inStockOnly ||
    filters.minPrice !== "" ||
    filters.maxPrice !== ""

  const total = query.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rows = query.data?.rows ?? []

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-h2 font-bold text-foreground">{t("shop.allProducts")}</h1>
        <p className="text-body text-muted-foreground">
          {t("shop.resultsCount", { count: total })}
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("shop.searchPlaceholder")}
            className="h-11 pl-9"
            type="search"
            aria-label={t("common.search")}
          />
        </div>
        <div className="flex gap-2">
          <SimpleSelect
            value={sort}
            onValueChange={(v) => changeSort(v as PublicSort)}
            options={sortOptions}
            className="h-11 min-w-40"
          />
          <Button
            variant="outline"
            className="h-11 shrink-0 lg:hidden"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal />
            {t("common.filter")}
            {hasActiveFilters && (
              <span
                className="ml-1 inline-flex size-2 shrink-0 bg-primary"
                style={{ borderRadius: "var(--radius-full)" }}
                aria-hidden
              />
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <ShopFilters
              types={types}
              colorOptions={colorOptions}
              values={filters}
              onChange={updateFilter}
              onClear={clearFilters}
              hasActiveFilters={hasActiveFilters}
            />
          </div>
        </aside>

        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{t("common.filter")}</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-4">
              <ShopFilters
                types={types}
                colorOptions={colorOptions}
                values={filters}
                onChange={updateFilter}
                onClear={clearFilters}
                hasActiveFilters={hasActiveFilters}
              />
            </div>
            <div className="border-t border-border p-4">
              <SheetClose render={<Button className="w-full" />}>
                {t("shop.applyFilters")}
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>

        <div>
          {query.isLoading ? (
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/5]" />
              ))}
            </div>
          ) : (
            <ProductGrid products={rows} />
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => changePage(Math.max(1, page - 1))}
                disabled={page <= 1}
                aria-label={t("common.previous")}
              >
                <ChevronLeft />
              </Button>
              <span className="text-body text-muted-foreground">
                {t("common.page")} {page} {t("common.of")} {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => changePage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                aria-label={t("common.next")}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
