import "server-only"

import { revalidatePath } from "next/cache"

import { routing } from "@/i18n/routing"

/**
 * Single shared invalidation point for every order-mutating server action
 * (create/update/delete/status). Mirrors the shape of
 * `admin/products/revalidate.ts`'s `revalidateStorefront`, but deliberately
 * narrower: orders never affect the public catalogue, so there is no
 * `revalidatePath` call for `/`, `/shop`, or `/shop/<code>` here — only the
 * admin paths. `/track/[code]` is deliberately NOT revalidated here either:
 * that route is `export const dynamic = "force-dynamic"` (see its own
 * file-level comment), so there is no cache entry for it to bust — every
 * request there already re-reads the database. If a future phase adds a
 * catalogue surface (e.g. a "recently sold" strip), route it through its own
 * explicit revalidation rather than overloading this helper.
 *
 * Loops every configured locale for the same reason `revalidateStorefront`
 * does: `/admin/orders` is locale-prefixed (`/th/admin/orders`,
 * `/en/admin/orders`), so a mutation made while the owner is on one locale
 * must not leave the list/detail page stale in the other.
 *
 * Also revalidates `/${locale}/admin` — the dashboard (Phase 6) reads
 * orders-this-month / revenue-this-month KPIs, so an order write should
 * bust that cache too even though the dashboard itself ships later.
 */
export function revalidateOrders(id?: string): void {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/admin`)
    revalidatePath(`/${locale}/admin/orders`)
    if (id) revalidatePath(`/${locale}/admin/orders/${id}`)
  }
}
