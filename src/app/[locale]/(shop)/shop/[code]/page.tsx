import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { routing } from "@/i18n/routing"
import {
  getActiveProductCodes,
  getPublicCharacters,
  getPublicProductByCode,
  getPublicProducts,
} from "@/db/queries/storefront"
import { ProductDetail } from "@/components/shop/product-detail"
import { ProductGrid } from "@/components/shop/product-grid"
import { ProductJsonLd } from "@/components/shop/product-jsonld"

export const revalidate = 300
export const dynamic = "force-static"

/**
 * Bottom-up generation (both dynamic segments — `[locale]` AND `[code]` —
 * from this one child page, per Next's "Multiple Dynamic Segments" guide)
 * so every locale x active-product-code pair is covered explicitly rather
 * than relying on merge behaviour with the ancestor `[locale]` layout's own
 * `generateStaticParams`.
 *
 * `getActiveProductCodes()` hits the database at build time. In this
 * verification environment `DATABASE_URL` points at nothing, so it will
 * throw — caught here, falling back to an empty list. With `dynamicParams`
 * left at its default `true`, Next then renders each `/shop/<code>` on its
 * first real request (against a live database) and caches the result —
 * the build itself never needs a database connection.
 */
export async function generateStaticParams() {
  try {
    // Probes the new public taxonomy too. A deployment that builds before
    // running the latest migration must return no static product paths;
    // dynamicParams then renders them on demand after migration.
    await getPublicCharacters()
    const codes = await getActiveProductCodes()
    return routing.locales.flatMap((locale) => codes.map((code) => ({ locale, code })))
  } catch (error) {
    console.error("[shop/[code]] getActiveProductCodes failed during prerender", error)
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}): Promise<Metadata> {
  const { locale, code } = await params
  const product = await getPublicProductByCode(code)
  if (!product) return {}

  const description = product.description ?? product.productName
  const cover = product.images[0]?.url

  return {
    title: product.productName,
    description,
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}/shop/${product.productCode}`])
      ),
    },
    openGraph: {
      title: product.productName,
      description,
      images: cover ? [cover] : undefined,
      locale,
      type: "website",
    },
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}) {
  const { locale, code } = await params
  setRequestLocale(locale)

  const product = await getPublicProductByCode(code)
  if (!product) notFound()

  const t = await getTranslations()
  const related = product.characters[0]
    ? await getPublicProducts({ character: product.characters[0].slug, pageSize: 5, sort: "newest" })
    : { rows: [], count: 0, page: 1, pageSize: 5 }
  const relatedRows = related.rows.filter((p) => p.productCode !== product.productCode).slice(0, 4)

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")
  const canonicalUrl = `${siteUrl}/${locale}/shop/${product.productCode}`

  return (
    <>
      <ProductJsonLd product={product} url={canonicalUrl} locale={locale} />
      <ProductDetail product={product} locale={locale} />

      {relatedRows.length > 0 && (
        <section aria-labelledby="related-heading" className="bg-muted">
          <div className="mx-auto max-w-[1440px] px-4 py-17 sm:px-6 lg:px-8">
            <h2 id="related-heading" className="mb-6 text-h3 font-bold text-foreground">
              {t("shop.relatedProducts")}
            </h2>
            <ProductGrid products={relatedRows} />
          </div>
        </section>
      )}
    </>
  )
}
