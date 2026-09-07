import "server-only"

import { revalidatePath } from "next/cache"

import { routing } from "@/i18n/routing"

/**
 * Single shared invalidation point for every user-mutating server action
 * (role change / delete / verify). Mirrors `revalidateSettings`'s shape.
 *
 * Deliberately narrower than `revalidateStorefront`: nothing on `/` or
 * `/shop` renders account data, so busting the storefront here would evict
 * ISR-cached product pages for no reason. `/admin` is included defensively
 * in case a future dashboard tile ever reads account data.
 *
 * Both locales are always busted — a change made while the owner is on /th
 * must not leave /en's cached page stale (see CLAUDE.md).
 */
export function revalidateUsers(): void {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}/admin/users`)
    revalidatePath(`/${locale}/admin`)
  }
}
