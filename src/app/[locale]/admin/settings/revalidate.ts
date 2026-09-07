import "server-only"

import { revalidatePath } from "next/cache"

import { routing } from "@/i18n/routing"
import { revalidateStorefront } from "@/app/[locale]/admin/products/revalidate"

/**
 * Single shared invalidation point for every product-type-mutating server
 * action (create/rename/delete/reorder). Mirrors `revalidateOrders` /
 * `revalidateStorefront`'s shape.
 *
 * `productType` is a PUBLIC product field (plan §4/§10) and
 * `renameProductType` cascades a new name onto every product still using
 * the old one — so a rename can change what the storefront shows, exactly
 * like a direct product edit does. Rather than duplicate
 * `revalidateStorefront`'s locale loop and path list here, this reuses it
 * directly (it already re-validates `/`, `/shop`, `/admin`, and
 * `/admin/products` in every locale) and adds only the paths that helper
 * doesn't know about: `/admin/settings` and `/about` (both read
 * `shop_settings` directly — brand identity and shop contacts
 * respectively) — the dashboard's type distribution chart is already
 * covered since `revalidateStorefront` busts `/admin` too.
 */
export function revalidateSettings(): void {
  revalidateStorefront()
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/admin/settings`)
    revalidatePath(`/${locale}/about`)
  }
}
