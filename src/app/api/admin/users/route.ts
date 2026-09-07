import { NextResponse, type NextRequest } from "next/server"

import {
  listUsers,
  type AdminUserRow,
  type UserSort,
} from "@/db/queries/users"

// Re-exported so client components can import the row type from the route
// they fetch, rather than reaching into the server-only query module.
export type { AdminUserRow }
import { getCurrentUser } from "@/lib/auth-helpers"
import type { UserRole } from "@/lib/roles"
import { isOwner } from "@/lib/roles"

/**
 * Owner-gated JSON list for the `/admin/users` browser (mirrors
 * `api/admin/orders/route.ts`'s try/catch + 401/403/500 shape).
 *
 * The auth check below is required independently of `src/proxy.ts`, which
 * already rejects unauthenticated `/api/admin/*` with a 401 — with no RLS a
 * forgotten check here has no backstop, and this route reads the accounts
 * table. It returns only `ADMIN_USER_COLUMNS` (see queries/users.ts): the
 * password hash is never selected, so it cannot be serialized here even by
 * accident.
 */

export type UserListApiResult = {
  rows: AdminUserRow[]
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

const SORT_VALUES: ReadonlySet<string> = new Set<UserSort>([
  "newest",
  "oldest",
  "name_az",
  "name_za",
])

const ROLE_VALUES: ReadonlySet<string> = new Set<UserRole>(["owner", "staff"])

const VERIFIED_VALUES = new Set(["all", "verified", "unverified"])

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

    const roleParam = sp.get("role") ?? "all"
    const verifiedParam = sp.get("verified") ?? "all"

    const result = await listUsers({
      // Unknown values fall back to the default rather than reaching the
      // query layer, so a typo in a hand-built URL never looks like it worked.
      role: ROLE_VALUES.has(roleParam) ? (roleParam as UserRole) : "all",
      search: sp.get("search") ?? "",
      verified: VERIFIED_VALUES.has(verifiedParam)
        ? (verifiedParam as "all" | "verified" | "unverified")
        : "all",
      sort: SORT_VALUES.has(sp.get("sort") ?? "")
        ? (sp.get("sort") as UserSort)
        : "newest",
      page: intParam(sp.get("page"), 1, 1, Number.MAX_SAFE_INTEGER),
      pageSize: intParam(sp.get("pageSize"), 20, 1, MAX_PAGE_SIZE),
    })

    return NextResponse.json(result satisfies UserListApiResult)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
}
