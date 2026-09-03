import "server-only"

import { revalidatePath } from "next/cache"

import { routing } from "@/i18n/routing"

/**
 * Single shared invalidation point for every product-mutating server
 * action (create/update/inline-update/delete/status/import). This is a
 * deliberate departure from carstockpro's `cars/actions.ts`, which only
 * ever revalidates its own internal list/detail paths — here every
 * product write must ALSO invalidate the public, ISR-cached storefront
 * (plan §10), because a stale `/`, `/shop`, or `/shop/<code>` after a
 * price or stock edit shows the customer wrong information. Routing every
 * call site through one helper means no future action can forget a path.
 *
 * ROUTING MIGRATION NOTE: every page now lives under a `/<locale>` prefix
 * (see src/i18n/routing.ts — `localePrefix: "always"`), so
 * `revalidatePath("/shop")` no longer matches anything; the actual cache
 * key is `/th/shop`, `/en/shop`, etc. This loops every configured locale
 * so a single mutation invalidates the page in ALL languages, not just
 * whichever one the admin happened to be using when they made the edit —
 * a stale cache in the language the admin ISN'T looking at is just as
 * real a bug as one in the language they are.
 *
 * `code` is the product's `productCode` (NOT its uuid) — that's the
 * storefront's URL key (`/[locale]/shop/[code]`, plan §3). Pass it
 * whenever the action already has the value. For an action that can't
 * cheaply produce one (e.g. a bulk import touching many codes), omit it —
 * `/shop` itself still gets invalidated, so the catalogue listing is
 * correct; only the individual product detail page for an omitted code
 * stays on the old ISR revalidate window (300s, plan §3) until it
 * naturally expires.
 *
 * `/shop*` doesn't exist yet (the storefront ships in Phase 4) — revalidating
 * a path with no matching cache entry is a harmless no-op, kept here so this
 * helper doesn't need to change again the day that route lands.
 */
export function revalidateStorefront(code?: string): void {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}`)
    revalidatePath(`/${locale}/shop`)
    revalidatePath(`/${locale}/admin`)
    revalidatePath(`/${locale}/admin/products`)
    if (code) revalidatePath(`/${locale}/shop/${code}`)
  }
}
