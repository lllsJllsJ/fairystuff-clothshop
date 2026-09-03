import { createNavigation } from "next-intl/navigation"

import { routing } from "@/i18n/routing"

/**
 * Locale-aware `Link` / `redirect` / `usePathname` / `useRouter` /
 * `getPathname`, bound to `routing` above. Every internal navigation in
 * `src/app/**` and `src/components/**` must import these instead of the
 * plain `next/link` / `next/navigation` equivalents, or the locale prefix
 * gets dropped and the user is bounced to the default locale on the next
 * navigation.
 *
 * `redirect()` here requires an explicit `locale` argument (this next-intl
 * version dropped implicit inference from request context — see
 * node_modules/next-intl/dist/types/navigation/react-server/
 * createNavigation.d.ts). Server code that doesn't already have the
 * locale in scope should read it with `getLocale()` from `next-intl/server`
 * first.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
