import { hasLocale } from "next-intl"
import { getRequestConfig } from "next-intl/server"

import { routing } from "@/i18n/routing"

export const LOCALES = routing.locales
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = routing.defaultLocale

/**
 * Locale now comes from the URL segment (via next-intl's routing/proxy),
 * NOT from cookies(). Reading cookies() here would force every page that
 * renders through this config into dynamic rendering (`ƒ` in `next build`)
 * because next-intl invokes this on every request — the entire reason the
 * storefront couldn't be statically generated before this migration.
 * `requestLocale` is populated by src/proxy.ts's next-intl middleware from
 * the `[locale]` route segment; `hasLocale` validates it against the
 * configured list and we fall back to the default for anything else
 * (e.g. a request that somehow reaches here without a valid segment).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = hasLocale(LOCALES, requested) ? requested : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
