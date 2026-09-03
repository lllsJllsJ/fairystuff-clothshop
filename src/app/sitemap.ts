import type { MetadataRoute } from "next"

import { routing } from "@/i18n/routing"
import { getActiveProductCodes } from "@/db/queries/storefront"

/**
 * Lists both locales for every static storefront route and every active
 * product, with `alternates.languages` on each entry for hreflang —
 * correct hreflang was a principal reason path-prefixed locales were
 * chosen over cookie-based ones (see src/i18n/routing.ts), so it needs to
 * be real here, not an afterthought.
 *
 * `getActiveProductCodes()` hits the database; `sitemap.ts` is cached like
 * any other route handler (see Next's sitemap docs) and — in a build
 * without a live `DATABASE_URL` — would otherwise fail the build. Wrapped
 * in try/catch so a database-less build still emits a valid sitemap
 * covering the static routes; ISR/revalidation of this route on a live
 * deployment fills in the product URLs.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")
  const now = new Date()

  const staticPaths = ["", "/shop", "/about"]
  const staticEntries: MetadataRoute.Sitemap = staticPaths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${siteUrl}/${locale}${path}`,
      lastModified: now,
      changeFrequency: path === "" ? ("weekly" as const) : ("daily" as const),
      priority: path === "" ? 1 : 0.8,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, `${siteUrl}/${l}${path}`])
        ),
      },
    }))
  )

  let codes: string[] = []
  try {
    codes = await getActiveProductCodes()
  } catch (error) {
    console.error("[sitemap] getActiveProductCodes failed", error)
    codes = []
  }

  const productEntries: MetadataRoute.Sitemap = codes.flatMap((code) =>
    routing.locales.map((locale) => ({
      url: `${siteUrl}/${locale}/shop/${code}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, `${siteUrl}/${l}/shop/${code}`])
        ),
      },
    }))
  )

  return [...staticEntries, ...productEntries]
}
