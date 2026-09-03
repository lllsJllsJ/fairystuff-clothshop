import { NextResponse, type NextRequest } from "next/server"

import {
  getOrders,
  type OrderListRow,
  type OrderSort,
  type OrderStatusValue,
} from "@/db/queries/orders"

// Re-exported so client components can keep importing the row type from the
// route they fetch, rather than reaching into the server-only query module.
export type { OrderListRow }
import { getCurrentUser } from "@/lib/auth-helpers"
import { isOwner } from "@/lib/roles"

/**
 * Owner-gated JSON list for the `/admin/orders` browser (mirrors
 * `api/admin/products/route.ts`'s try/catch + 401/403/500 shape).
 *
 * The auth check below is required independently of `src/proxy.ts`, which
 * already rejects unauthenticated `/api/admin/*` with a 401 (plan Risk 1:
 * with no RLS, a forgotten check here has no backstop).
 *
 * Search and item counts are resolved in SQL by `getOrders()`. An earlier
 * version filtered in memory over a 2000-row fetch, which silently
 * truncated results past the cap and degraded with order volume; that
 * workaround is gone.
 */

export type OrderListApiResult = {
  rows: OrderListRow[]
  count: number
  page: number
  pageSize: number
}

const MAX_PAGE_SIZE = 100

/** Clamp a user-supplied integer, falling back when absent or malformed. */
function intParam(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw ?? fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(Math.trunc(n), min), max)
}

const SORT_VALUES: ReadonlySet<string> = new Set<OrderSort>([
  "newest",
  "oldest",
  "orderno_high",
  "orderno_low",
  "total_high",
  "total_low",
])

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    if (!isOwner(user.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const result = await getOrders({
      status: (sp.get("status") as OrderStatusValue | "all") ?? "all",
      search: sp.get("search") ?? "",
      dateFrom: sp.get("dateFrom") || undefined,
      dateTo: sp.get("dateTo") || undefined,
      // Unknown values fall back to the default rather than reaching the
      // query layer — SORT_MAP lookup would too, but failing here keeps a
      // typo in a hand-built URL from looking like it worked.
      sort: SORT_VALUES.has(sp.get("sort") ?? "")
        ? (sp.get("sort") as OrderSort)
        : "newest",
      page: intParam(sp.get("page"), 1, 1, Number.MAX_SAFE_INTEGER),
      pageSize: intParam(sp.get("pageSize"), 20, 1, MAX_PAGE_SIZE),
    })

    return NextResponse.json(result satisfies OrderListApiResult)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
}
