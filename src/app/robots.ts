import type { MetadataRoute } from "next"

/**
 * `/admin`, `/api`, and `/login` (every locale prefix) are kept out of the
 * crawl — they're owner-only or non-content routes; the public storefront
 * under `/[locale]`, `/[locale]/shop`, `/[locale]/shop/[code]`, and
 * `/[locale]/about` is otherwise fully open.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/*/admin", "/*/login", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
