import { NextResponse, type NextRequest } from "next/server"

import { getProducts, type ProductSort, type ProductStatusValue } from "@/db/queries/products"
import { getCurrentUser } from "@/lib/auth-helpers"
import { isOwner } from "@/lib/roles"

/**
 * Owner-gated JSON, full columns — INCLUDING `margin`, `originalPrice`,
 * `buyingSource`, `sourceLink`. Port of carstockpro's `api/cars/route.ts`
 * try/catch + 401/500 shape, with its `canViewFinancials` zeroing block
 * deleted: this shop has one admin role (`owner`), so whoever reaches this
 * route sees everything (plan §12's file-mapping table).
 *
 * NOTE on the 401: `src/proxy.ts` already redirects an unauthenticated
 * request to this path (it matches `/api/admin/:path*`) to `/login` before
 * it ever reaches this handler, so in normal operation an anonymous
 * `fetch()` never sees this 401 — it sees the proxy's redirect. The check
 * below is still required (plan Risk 1: every action/route re-checks
 * ownership independently, never assuming an earlier layer already did),
 * and it is the only thing standing between an anonymous caller and this
 * data if the proxy's matcher is ever narrowed or this route is ever moved
 * outside `/api/admin/*`.
 */
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

    const result = await getProducts({
      search: sp.get("search") ?? "",
      status: (sp.get("status") as ProductStatusValue | "all") ?? "all",
      type: sp.get("type") || undefined,
      sort: (sp.get("sort") as ProductSort) ?? "newest",
      page: Number(sp.get("page") ?? "1"),
      pageSize: Number(sp.get("pageSize") ?? "20"),
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
}
