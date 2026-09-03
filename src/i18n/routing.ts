import { defineRouting } from "next-intl/routing"

/**
 * Path-prefixed locale routing (plan-migration: cookie -> URL segment).
 *
 * `localePrefix: "always"` means every locale, including the default,
 * carries an explicit segment (`/th/...`, `/en/...`) — `/` itself always
 * redirects to `/th`. This is deliberate over "as-needed": it keeps URLs
 * unambiguous and hreflang-friendly and avoids the whole class of edge
 * cases that come from a locale-less default-locale URL (e.g. "is /shop
 * Thai or is it unprefixed-default?"). See src/proxy.ts for how this
 * composes with the Auth.js guard, and src/i18n/request.ts for how the
 * resolved locale flows into next-intl's request config WITHOUT touching
 * cookies() — that is what lets public pages render statically again.
 */
export const routing = defineRouting({
  locales: ["th", "en"],
  defaultLocale: "th",
  localePrefix: "always",
})

export type AppLocale = (typeof routing.locales)[number]
