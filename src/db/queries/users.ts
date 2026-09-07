import "server-only"

import type { Column } from "drizzle-orm"
import { and, asc, count, desc, eq, ilike, ne, or, sql } from "drizzle-orm"

import { db } from "@/db"
import { users } from "@/db/schema"
import type { UserRole } from "@/lib/roles"

// ---------------------------------------------------------------------------
// Admin user list — /admin/users
// ---------------------------------------------------------------------------

/**
 * The ONLY columns any user read may select.
 *
 * `users` carries `passwordHash`, and this codebase has no RLS backstop —
 * a `db.select().from(users)` whose row is handed to a client component
 * serializes EVERY selected field into the RSC payload, bcrypt hash
 * included, whether or not the JSX renders it. Same structural defense as
 * `PUBLIC_PRODUCT_COLUMNS` in queries/storefront.ts: derive every list
 * select from this object so the hash is never selected out of the database
 * on a path that reaches a browser in the first place.
 *
 * Never spread `users.*` here, and never widen this with `passwordHash`.
 */
const ADMIN_USER_COLUMNS = {
  id: users.id,
  email: users.email,
  fullname: users.fullname,
  phone: users.phone,
  role: users.role,
  emailVerifiedAt: users.emailVerifiedAt,
  createdAt: users.createdAt,
} as const

export type AdminUserRow = {
  id: string
  /** Optional — accounts here are owner/staff only; email is still not
   * required at creation. */
  email: string | null
  fullname: string | null
  phone: string | null
  role: UserRole
  emailVerifiedAt: Date | null
  createdAt: Date
}

export type UserSort =
  | "newest"
  | "oldest"
  | "name_az"
  | "name_za"

export type UserListParams = {
  role?: UserRole | "all"
  /** Case-insensitive substring across email, full name, and phone. */
  search?: string
  verified?: "all" | "verified" | "unverified"
  sort?: UserSort
  page?: number
  pageSize?: number
}

export type UserListResult = {
  rows: AdminUserRow[]
  count: number
  page: number
  pageSize: number
}

const DEFAULT_PAGE_SIZE = 20

const SORT_MAP: Record<UserSort, { column: Column; ascending: boolean }> = {
  newest: { column: users.createdAt, ascending: false },
  oldest: { column: users.createdAt, ascending: true },
  name_az: { column: users.fullname, ascending: true },
  name_za: { column: users.fullname, ascending: false },
}

/** Paginated account list with role/verification filters, for /admin/users. */
export async function listUsers(params: UserListParams = {}): Promise<UserListResult> {
  const {
    role = "all",
    search = "",
    verified = "all",
    sort = "newest",
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = params

  const conditions = []
  if (role !== "all") conditions.push(eq(users.role, role))
  if (verified === "verified") conditions.push(sql`${users.emailVerifiedAt} is not null`)
  if (verified === "unverified") conditions.push(sql`${users.emailVerifiedAt} is null`)

  // Filter in SQL, never in memory — an in-JS filter over a capped fetch
  // silently truncates once the account list outgrows the cap.
  const term = search.trim()
  if (term) {
    const like = `%${term}%`
    conditions.push(
      or(ilike(users.email, like), ilike(users.fullname, like), ilike(users.phone, like))!
    )
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const { column, ascending } = SORT_MAP[sort] ?? SORT_MAP.newest
  // createdAt can tie (a seeded batch shares a timestamp), and an unstable
  // tie makes pagination drop or repeat rows between pages — users.id is
  // unique, so it breaks every tie deterministically.
  const orderBy = [ascending ? asc(column) : desc(column), asc(users.id)]

  const [rows, countRows] = await Promise.all([
    db
      .select(ADMIN_USER_COLUMNS)
      .from(users)
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ value: count() }).from(users).where(where),
  ])

  return {
    rows: rows as AdminUserRow[],
    count: countRows[0]?.value ?? 0,
    page,
    pageSize,
  }
}

/** Minimal record for the admin mutations, without the password hash. */
export async function getUserForAdmin(id: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  return row ?? null
}

/**
 * Owners other than `excludeId`. The lockout guard: demoting or deleting the
 * final owner would leave the shop with no account able to reach /admin and
 * no way back in short of re-running `npm run create-owner` against the
 * production database.
 */
export async function countOtherOwners(excludeId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.role, "owner"), ne(users.id, excludeId)))
  return row?.value ?? 0
}
