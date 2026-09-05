import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { routing } from "@/i18n/routing"
import {
  getPublicProducts,
  getPublicCharacters,
  type PublicProductListResult,
  type PublicCharacterFacet,
} from "@/db/queries/storefront"
import { BRAND_NAME, BRAND_TAGLINE_EN, BRAND_TAGLINE_TH } from "@/lib/brand"
import { Hero } from "@/components/shop/hero"
import { ProductGrid } from "@/components/shop/product-grid"
import { CollectionStrip } from "@/components/shop/collection-strip"
import { ContactCta } from "@/components/shop/contact-cta"
import { Link } from "@/i18n/navigation"

export const revalidate = 300

const NEW_IN_COUNT = 6
const EMPTY_LIST: PublicProductListResult = { rows: [], count: 0, page: 1, pageSize: NEW_IN_COUNT }

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const tagline = locale === "th" ? BRAND_TAGLINE_TH : BRAND_TAGLINE_EN
  return {
    title: BRAND_NAME,
    description: tagline,
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])),
    },
  }
}

/**
 * `getPublicProducts`/`getPublicTypes` run at prerender time for both
 * locales (this page has no dynamic segment beyond `[locale]`, which
 * `generateStaticParams` above already covers). In this verification
 * environment `DATABASE_URL` points at nothing, so those calls would throw
 * and fail the build — wrapped here the same way `/shop`'s page and
 * `generateStaticParams` for `/shop/[code]` are: catch, fall back to an
 * empty result, and let ISR (`revalidate = 300`) refresh real content once
 * a live database is behind the deployment.
 */
async function safeGetPublicProducts(
  params: Parameters<typeof getPublicProducts>[0]
): Promise<PublicProductListResult> {
  try {
    return await getPublicProducts(params)
  } catch (error) {
    console.error("[home] getPublicProducts failed during prerender", error)
    return { ...EMPTY_LIST, page: params?.page ?? 1, pageSize: params?.pageSize ?? NEW_IN_COUNT }
  }
}

async function safeGetPublicCharacters(): Promise<PublicCharacterFacet[]> {
  try {
    return await getPublicCharacters()
  } catch (error) {
      console.error("[home] getPublicCharacters failed during prerender", error)
    return []
  }
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const [newIn, characters] = await Promise.all([
    safeGetPublicProducts({ page: 1, pageSize: NEW_IN_COUNT, sort: "newest" }),
    safeGetPublicCharacters(),
  ])

  return (
    <>
      <Hero locale={locale} />

      <section aria-labelledby="new-in-heading" className="bg-background">
        <div className="mx-auto max-w-[1440px] px-4 py-17 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 id="new-in-heading" className="text-h2 font-bold text-foreground">
                {t("shop.newIn")}
              </h2>
              <p className="text-body text-muted-foreground">{t("home.newInSubtitle")}</p>
            </div>
            <Link
              href="/shop"
              className="hidden shrink-0 text-link hover:text-link-hover hover:underline sm:inline"
            >
              {t("shop.allProducts")}
            </Link>
          </div>
          <ProductGrid
            products={newIn.rows}
            newCodes={new Set(newIn.rows.map((p) => p.productCode))}
            priorityCount={4}
          />
          <div className="mt-6 text-center sm:hidden">
            <Link href="/shop" className="text-link hover:text-link-hover hover:underline">
              {t("shop.allProducts")}
            </Link>
          </div>
        </div>
      </section>

      <CollectionStrip characters={characters} />

      <section aria-labelledby="story-heading" className="bg-muted">
        <div className="mx-auto max-w-[1440px] px-4 py-17 text-center sm:px-6 lg:px-8">
          <h2 id="story-heading" className="text-h2 font-bold text-foreground">
            {t("home.storyTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-body text-muted-foreground">
            {t("home.storySubtitle")}
          </p>
          <Link
            href="/about"
            className="mt-4 inline-block text-link hover:text-link-hover hover:underline"
          >
            {t("home.storyCta")}
          </Link>
        </div>
      </section>

      <ContactCta locale={locale} />
    </>
  )
}
