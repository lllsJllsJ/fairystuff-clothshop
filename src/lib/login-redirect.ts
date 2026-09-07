import type { UserRole } from "@/lib/roles"

function matchesPath(value: string, path: string) {
  return value === path || value.startsWith(`${path}/`)
}

/**
 * Resolves only known, locale-local return paths. This keeps login useful
 * for storefront browsing without turning `redirect` into an open redirect
 * or letting a role enter a route it cannot access.
 *
 * There is no `customer` role and no `/checkout`/`/account` flow to resume
 * anymore — guest checkout needs no sign-in at all, so the only account
 * left is `owner`/`staff`, and the only privileged destination worth
 * resuming is `/admin`.
 */
export function loginDestination(input: {
  requestedRedirect: string | null
  locale: string
  role: UserRole
}) {
  const { requestedRedirect, locale, role } = input
  const localeRoot = `/${locale}`

  if (requestedRedirect) {
    const publicReturn =
      requestedRedirect === localeRoot ||
      matchesPath(requestedRedirect, `${localeRoot}/shop`) ||
      matchesPath(requestedRedirect, `${localeRoot}/about`) ||
      matchesPath(requestedRedirect, `${localeRoot}/cart`)
    const ownerFlow = role === "owner" && matchesPath(requestedRedirect, `${localeRoot}/admin`)

    if (publicReturn || ownerFlow) {
      return requestedRedirect
    }
  }

  if (role === "owner") return `${localeRoot}/admin`
  return localeRoot
}
