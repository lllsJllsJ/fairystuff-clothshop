import type { MetadataRoute } from "next"

/**
 * `/admin`, `/api`, and `/login` (every locale prefix) are kept out of the
 * crawl — they're owner-only or non-content routes; the public storefront
 * under `/[locale]`, `/[locale]/shop`, `/[locale]/shop/[code]`, and
 * `/[locale]/about` is otherwise fully open.
 *
 * `/*\/track/` (note the trailing slash) blocks every `/th/track/<code>` and
 * `/en/track/<code>` detail page — a preorder code is a bearer credential
 * for one customer's order, not indexable content. The trailing slash is
 * load-bearing: without it this pattern would also match (and block) the
 * plain `/th/track` lookup form, which IS meant to stay crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/*/admin", "/*/login", "/*/track/", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
