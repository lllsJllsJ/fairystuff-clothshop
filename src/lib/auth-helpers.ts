import "server-only"

import type { Session } from "next-auth"
import { getLocale } from "next-intl/server"

import { auth } from "@/auth"
import { redirect } from "@/i18n/navigation"
import { isCustomer, isOwner } from "@/lib/roles"

/** Returns the signed-in user (id, role, email, name), or null. */
export async function getCurrentUser(): Promise<Session["user"] | null> {
  const session = await auth()
  return session?.user ?? null
}

/**
 * Redirects to /login when unauthenticated, and to / when authenticated but
 * not `owner` (mirrors carstockpro's `requireProfile()`). This is layer two
 * of the three-layer guard (proxy redirect -> this -> per-action role
 * re-check) — see the security note at the top of src/auth.ts. With no RLS,
 * every server action still has to repeat the `isOwner` check on its own;
 * this function only protects page renders under src/app/[locale]/admin/*.
 *
 * The redirect targets go through `@/i18n/navigation`'s `redirect()`, which
 * requires an explicit `locale` (this next-intl version no longer infers it
 * from request context in Server Components — see the comment in
 * src/i18n/navigation.ts). `requireOwner()` is always called from inside
 * `src/app/[locale]/admin/layout.tsx`, i.e. after `setRequestLocale()` has
 * already run for this request, so `getLocale()` here reads from next-intl's
 * request-scoped cache rather than a dynamic API — safe to call.
 */
export async function requireOwner(): Promise<Session["user"]> {
  const locale = await getLocale()
  const user = await getCurrentUser()
  if (!user) {
    return redirect({ href: "/login", locale })
  }
  if (!isOwner(user.role)) {
    return redirect({ href: "/", locale })
  }
  return user
}

export async function requireCustomer(returnTo = "/account/orders"): Promise<Session["user"]> {
  const locale = await getLocale()
  const user = await getCurrentUser()
  if (!user) {
    return redirect({
      href: { pathname: "/login", query: { redirect: `/${locale}${returnTo}` } },
      locale,
    })
  }
  if (!isCustomer(user.role)) {
    return redirect({ href: "/", locale })
  }
  return user
}
