import { Suspense } from "react"
import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { routing } from "@/i18n/routing"
import {
  getPublicProducts,
  getPublicCharacters,
  type PublicProductListResult,
  type PublicCharacterFacet,
} from "@/db/queries/storefront"
import { ShopBrowser } from "@/components/shop/shop-browser"

export const revalidate = 300

const PAGE_SIZE = 24
/**
 * Sample size used only to seed the colour-filter facet options (see the
 * comment above `colorOptions` below) — not the page size shown to the
 * shopper, which stays `PAGE_SIZE`.
 */
const COLOR_FACET_SAMPLE_SIZE = 200

const EMPTY_LIST: PublicProductListResult = { rows: [], count: 0, page: 1, pageSize: PAGE_SIZE }

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale })
  return {
    title: t("shop.allProducts"),
    description: t("shop.metaDescription"),
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/shop`])),
    },
  }
}

/**
 * `/shop`'s server render exists for two reasons: a crawlable page-1 grid
 * for SEO, and an `initialData` seed for `ShopBrowser` so hydration doesn't
 * refetch. Both `getPublicProducts` and `getPublicCharacters` run at prerender
 * time (no dynamic segment gates this route beyond `[locale]`, which
 * `generateStaticParams` above fully covers) — in this verification
 * environment `DATABASE_URL` points at nothing, so they're wrapped the same
 * way home page and `/shop/[code]`'s `generateStaticParams` are: catch,
 * fall back to empty, let ISR (`revalidate = 300`) fill in real content
 * once a live database is behind the deployment.
 */
async function safeGetPublicProducts(
  params: Parameters<typeof getPublicProducts>[0]
): Promise<PublicProductListResult> {
  try {
    return await getPublicProducts(params)
  } catch (error) {
    console.error("[shop] getPublicProducts failed during prerender", error)
    return { ...EMPTY_LIST, page: params?.page ?? 1, pageSize: params?.pageSize ?? PAGE_SIZE }
  }
}

async function safeGetPublicCharacters(): Promise<PublicCharacterFacet[]> {
  try {
    return await getPublicCharacters()
  } catch (error) {
    console.error("[shop] getPublicCharacters failed during prerender", error)
    return []
  }
}

export default async function ShopPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const [page1, colorFacetSample, characters] = await Promise.all([
    safeGetPublicProducts({ page: 1, pageSize: PAGE_SIZE, sort: "newest" }),
    safeGetPublicProducts({ page: 1, pageSize: COLOR_FACET_SAMPLE_SIZE, sort: "newest" }),
    safeGetPublicCharacters(),
  ])

  // `PublicProductSummary` carries `colors` but there is no "distinct
  // colours across the catalogue" query in db/queries/storefront.ts (and
  // this phase may not add one — see that file's header comment on the
  // public/private split). The filter rail's colour options are therefore
  // derived from a larger sample of active products rather than a true
  // facet aggregation: good enough to populate the picker, but a colour
  // that only appears beyond the sample won't show as a selectable filter
  // even though `GET /api/products?color=...` would still match it
  // correctly if typed into the URL directly.
  const colorOptions = Array.from(
    new Set(colorFacetSample.rows.flatMap((p) => p.colors))
  ).sort()

  return (
    // `ShopBrowser` reads `useSearchParams()` to seed its filter state from
    // the URL — Next requires that behind a Suspense boundary for a page
    // that's otherwise statically rendered, or the static bailout below
    // fails the build. `initialResult` already keeps first paint identical
    // to the SSR grid, so the fallback here never actually shows on a
    // normal (query-string-less) visit.
    <Suspense>
      <ShopBrowser initialResult={page1} characters={characters} colorOptions={colorOptions} />
    </Suspense>
  )
}
