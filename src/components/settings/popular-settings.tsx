"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useQuery } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, ChevronDown, ChevronUp, Loader2, Plus, Save, Search, Shirt, X } from "lucide-react"

import type { PopularProductEntry, ProductListResult } from "@/db/queries/products"
import { MAX_POPULAR_PRODUCTS } from "@/lib/product-taxonomy"
import { savePopularProducts } from "@/app/[locale]/admin/settings/workflow-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProductStatusBadge } from "@/components/products/product-admin-card"

const SEARCH_PAGE_SIZE = 8

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

function Thumbnail({ url }: { url: string | null }) {
  return (
    <div className="relative aspect-[4/5] w-12 shrink-0 overflow-hidden border border-border bg-muted">
      {url ? (
        <Image src={url} alt="" fill sizes="48px" className="object-cover" />
      ) : (
        <Shirt className="absolute inset-0 m-auto size-5 text-muted-foreground opacity-40" aria-hidden />
      )}
    </div>
  )
}

/**
 * The hand-picked "Popular" list: the home page's first product section,
 * the tile badge, and the `/shop` "Most popular" sort all read it. Same
 * edit-locally-then-Save shape as HeroSettings — the list order on screen
 * is the storefront order, and nothing is written until Save.
 *
 * The add-search reuses `GET /api/admin/products` (owner-gated), like the
 * order form's product picker; only active products are offered, since a
 * draft or archived pick would never show.
 */
export function PopularSettings({ initial }: { initial: PopularProductEntry[] }) {
  const t = useTranslations("settings")
  const [picks, setPicks] = useState<PopularProductEntry[]>(initial)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const debouncedQuery = useDebounced(query)

  const remaining = MAX_POPULAR_PRODUCTS - picks.length
  const pickedIds = new Set(picks.map((pick) => pick.id))

  const search = useQuery<ProductListResult>({
    queryKey: ["popular-product-picker", debouncedQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debouncedQuery,
        status: "active",
        sort: "newest",
        page: "1",
        pageSize: String(SEARCH_PAGE_SIZE),
      })
      const res = await fetch(`/api/admin/products?${params}`)
      if (!res.ok) throw new Error("failed")
      return res.json() as Promise<ProductListResult>
    },
    enabled: searchOpen,
    placeholderData: (prev) => prev,
  })

  function add(product: ProductListResult["rows"][number]) {
    setPicks((current) =>
      current.length >= MAX_POPULAR_PRODUCTS || current.some((pick) => pick.id === product.id)
        ? current
        : [
            ...current,
            {
              id: product.id,
              productCode: product.productCode,
              productName: product.productName,
              status: product.status,
              coverImageUrl: product.images[0]?.url ?? null,
            },
          ]
    )
  }

  function move(index: number, delta: -1 | 1) {
    setPicks((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function remove(id: string) {
    setPicks((current) => current.filter((pick) => pick.id !== id))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const result = await savePopularProducts(picks.map((pick) => pick.id))
      if (!result.ok) toast.error(t("saveFailed"))
      else toast.success(t("saved"))
    } finally {
      setSaving(false)
    }
  }

  const results = search.data?.rows ?? []

  return (
    <section className="border border-border bg-card p-5">
      <h2 className="text-subtitle font-bold">{t("popularProducts")}</h2>
      <p className="mt-1 text-small text-muted-foreground">
        {t("popularProductsHint", { max: MAX_POPULAR_PRODUCTS })}
      </p>

      {picks.length === 0 ? (
        <p className="mt-4 border border-dashed border-border px-3 py-6 text-center text-small text-muted-foreground">
          {t("popularEmpty")}
        </p>
      ) : (
        <ol className="mt-4 divide-y divide-border border border-border">
          {picks.map((pick, index) => (
            <li key={pick.id} className="flex items-center gap-3 p-2">
              <span className="w-5 shrink-0 text-center text-small font-bold tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <Thumbnail url={pick.coverImageUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium">{pick.productName}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground">
                  <span className="tabular-nums">{pick.productCode}</span>
                  {pick.status !== "active" && (
                    <>
                      <ProductStatusBadge status={pick.status} />
                      <span>{t("popularHiddenNote")}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={t("movePopularEarlier", { name: pick.productName })}
                >
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => move(index, 1)}
                  disabled={index === picks.length - 1}
                  aria-label={t("movePopularLater", { name: pick.productName })}
                >
                  <ChevronDown />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => remove(pick.id)}
                  aria-label={t("removePopular", { name: pick.productName })}
                >
                  <X />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4">
        <div className="relative">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            placeholder={t("popularSearchPlaceholder")}
            aria-label={t("popularSearchPlaceholder")}
            className="pl-9"
          />
        </div>
        <p className="mt-1 text-small text-muted-foreground">{t("popularLeft", { remaining })}</p>

        {searchOpen && (
          <ul className="mt-2 divide-y divide-border border border-border">
            {search.isLoading ? (
              <li className="flex justify-center p-4">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </li>
            ) : results.length === 0 ? (
              <li className="p-4 text-center text-small text-muted-foreground">
                {t("popularNoMatches")}
              </li>
            ) : (
              results.map((product) => {
                const picked = pickedIds.has(product.id)
                return (
                  <li key={product.id} className="flex items-center gap-3 p-2">
                    <Thumbnail url={product.images[0]?.url ?? null} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body">{product.productName}</p>
                      <p className="text-small tabular-nums text-muted-foreground">
                        {product.productCode}
                      </p>
                    </div>
                    {picked ? (
                      <span className="flex shrink-0 items-center gap-1 px-2 text-small text-muted-foreground">
                        <Check className="size-4" aria-hidden />
                        {t("popularAdded")}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        onClick={() => add(product)}
                        disabled={remaining <= 0}
                        aria-label={t("popularAdd", { name: product.productName })}
                      >
                        <Plus />
                      </Button>
                    )}
                  </li>
                )
              })
            )}
          </ul>
        )}
      </div>

      <Button className="mt-4" onClick={handleSave} disabled={saving}>
        <Save />
        {t("save")}
      </Button>
    </section>
  )
}
