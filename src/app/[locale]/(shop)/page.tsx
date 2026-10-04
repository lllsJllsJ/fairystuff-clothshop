import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { routing } from "@/i18n/routing"
import {
  getPublicProducts,
  getPublicCharacters,
  type PublicProductListResult,
  type PublicCharacterFacet,
} from "@/db/queries/storefront"
import { getShopSettings, resolvedBrandDescription, resolvedBrandName, resolvedSaleLabel } from "@/db/queries/settings"
import { Hero } from "@/components/shop/hero"
import { SaleBanner } from "@/components/shop/sale-banner"
import { StorySection } from "@/components/shop/story-section"
import { activeShopSale } from "@/lib/pricing"
import { ProductGrid } from "@/components/shop/product-grid"
import { CollectionStrip } from "@/components/shop/collection-strip"
import { QuickFilterRail } from "@/components/shop/quick-filter-rail"
import { AudienceEntry } from "@/components/shop/audience-entry"
import { Link } from "@/i18n/navigation"
import { heroImageUrl, isHeroImageKey } from "@/lib/brand-image-keys"
import { MAX_POPULAR_PRODUCTS } from "@/lib/product-taxonomy"
import { prerenderLocaleParams } from "@/lib/static-params"

export const revalidate = 300

const FEATURED_COUNT = 6
/** A product wears the "New" badge for this long after it was created. */
const NEW_BADGE_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000
/** Tiles loaded eagerly in whichever product grid is first on the page. */
const ABOVE_FOLD_TILES = 4
const EMPTY_LIST: PublicProductListResult = { rows: [], count: 0, page: 1, pageSize: FEATURED_COUNT }

// Empty when the database is unreachable at build time — see lib/static-params.ts.
export const generateStaticParams = prerenderLocaleParams

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const settings = await getShopSettings()
  return {
    title: resolvedBrandName(settings),
    description: resolvedBrandDescription(settings, locale),
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])),
    },
  }
}

/**
 * `getPublicProducts`/`getPublicCharacters` run at prerender time for both
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
    return { ...EMPTY_LIST, page: params?.page ?? 1, pageSize: params?.pageSize ?? FEATURED_COUNT }
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

/** Codes of the products added recently enough to be flagged "New". */
function recentlyAddedCodes(rows: PublicProductListResult["rows"]): Set<string> {
  const cutoff = Date.now() - NEW_BADGE_DAYS * MS_PER_DAY
  return new Set(
    rows.filter((row) => new Date(row.createdAt).getTime() >= cutoff).map((row) => row.productCode)
  )
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const [t, settings, popular, featured, characters] = await Promise.all([
    getTranslations(),
    getShopSettings(),
    safeGetPublicProducts({
      page: 1,
      pageSize: MAX_POPULAR_PRODUCTS,
      sort: "popular",
      popularOnly: true,
    }),
    safeGetPublicProducts({ page: 1, pageSize: FEATURED_COUNT, sort: "recommended" }),
    safeGetPublicCharacters(),
  ])
  // Hand-picked in Settings -> Storefront. Nothing picked (or the database
  // unreachable during a build) means no section at all, not an empty grid.
  const hasPopular = popular.rows.length > 0
  const shopSale = activeShopSale(settings)
  const heroImages = settings.heroImageKeys.filter(isHeroImageKey).map(heroImageUrl)

  return (
    <>
      {shopSale && <SaleBanner sale={shopSale} locale={locale} label={resolvedSaleLabel(settings, locale)} />}
      <Hero
        brandName={resolvedBrandName(settings)}
        tagline={resolvedBrandDescription(settings, locale)}
        images={heroImages}
      />

      {hasPopular && (
        <section aria-labelledby="popular-heading" className="bg-background">
          <div className="mx-auto max-w-[1440px] px-4 pt-12 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 id="popular-heading" className="text-h2 font-bold text-foreground">
                  {t("shop.popular")}
                </h2>
                <p className="text-body text-muted-foreground">{t("home.popularSubtitle")}</p>
              </div>
              <Link
                href={{ pathname: "/shop", query: { sort: "popular" } }}
                className="shrink-0 text-link hover:text-link-hover hover:underline"
              >
                {t("shop.allProducts")}
              </Link>
            </div>
            <ProductGrid
              products={popular.rows}
              showPopular={false}
              priorityCount={ABOVE_FOLD_TILES}
            />
          </div>
        </section>
      )}

      <AudienceEntry />

      <section aria-labelledby="featured-heading" className="bg-background">
        <div className="mx-auto max-w-[1440px] px-4 py-17 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 id="featured-heading" className="text-h2 font-bold text-foreground">
                {t("shop.featured")}
              </h2>
              <p className="text-body text-muted-foreground">{t("home.featuredSubtitle")}</p>
            </div>
            <Link
              href="/shop"
              className="hidden shrink-0 text-link hover:text-link-hover hover:underline sm:inline"
            >
              {t("shop.allProducts")}
            </Link>
          </div>
          <QuickFilterRail characters={characters} />

          <ProductGrid
            products={featured.rows}
            newCodes={recentlyAddedCodes(featured.rows)}
            priorityCount={hasPopular ? 0 : ABOVE_FOLD_TILES}
          />
          <div className="mt-6 text-center sm:hidden">
            <Link href="/shop" className="text-link hover:text-link-hover hover:underline">
              {t("shop.allProducts")}
            </Link>
          </div>
        </div>
      </section>

      <CollectionStrip characters={characters} />

      <StorySection
        locale={locale}
        brandName={resolvedBrandName(settings)}
        tagline={resolvedBrandDescription(settings, locale)}
        imageUrl={heroImages[1] ?? heroImages[0] ?? null}
      />
    </>
  )
}
