import { NextResponse, type NextRequest } from "next/server"

import {
  getPublicProducts,
  type PublicProductListParams,
  type PublicSort,
} from "@/db/queries/storefront"

const MAX_PAGE_SIZE = 48
const DEFAULT_PAGE_SIZE = 24
const MAX_PAGE = 10_000
const MAX_SEARCH_LENGTH = 100
const MAX_PRICE = 10_000_000
const SORT_VALUES: readonly PublicSort[] = ["newest", "price_asc", "price_desc"]

/**
 * Public JSON for `ShopBrowser` client-side filtering. Reads ONLY
 * `db/queries/storefront.ts` — never `queries/products.ts` — so the
 * response can never carry `originalPrice`/`buyingSource`/`sourceLink`/
 * `margin`/exact `quantity` (see that file's header comment). No auth: any
 * client on the internet can call this, so every param is validated and
 * clamped below rather than passed through — an unbounded `pageSize` or a
 * malformed `page` must not reach the query layer.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams

  try {
    const params: PublicProductListParams = {
      search: clampString(sp.get("search"), MAX_SEARCH_LENGTH),
      character: clampString(sp.get("character"), MAX_SEARCH_LENGTH),
      color: clampString(sp.get("color"), MAX_SEARCH_LENGTH),
      size: clampString(sp.get("size"), MAX_SEARCH_LENGTH),
      minPrice: clampPrice(sp.get("minPrice")),
      maxPrice: clampPrice(sp.get("maxPrice")),
      sort: parseSort(sp.get("sort")),
      page: clampInt(sp.get("page"), 1, MAX_PAGE, 1),
      pageSize: clampInt(sp.get("pageSize"), 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE),
    }

    const result = await getPublicProducts(params)
    return NextResponse.json(result)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
}

function clampString(value: string | null, maxLength: number): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

function clampPrice(value: string | null): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.min(n, MAX_PRICE)
}

function parseSort(value: string | null): PublicSort {
  return SORT_VALUES.includes(value as PublicSort) ? (value as PublicSort) : "newest"
}

function clampInt(value: string | null, min: number, max: number, fallback: number): number {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
