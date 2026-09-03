import { getTranslations, setRequestLocale } from "next-intl/server"

import { routing } from "@/i18n/routing"
import { SiteHeader } from "@/components/shop/site-header"
import { SiteFooter } from "@/components/shop/site-footer"

/**
 * Shared chrome for every public storefront route (plan §3, §11 Phase 4).
 * `revalidate = 300` here is the floor for the whole `(shop)` tree — see
 * plan §7's host-agnostic note: ISR + `revalidatePath` is native on Vercel
 * but needs a cache adapter elsewhere, so treat this as
 * correct-but-unverified until Phase 7 confirms it on the chosen host.
 */
export const revalidate = 300

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  // Load-bearing: seeds next-intl's request-scoped cache from the
  // statically-known `params.locale` instead of a per-request read, which
  // is what keeps every page under this layout eligible for static
  // rendering (see the equivalent comment in src/app/[locale]/layout.tsx).
  setRequestLocale(locale)
  const t = await getTranslations()

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[var(--z-tooltip)] focus:bg-primary focus:px-4 focus:py-2 focus:text-white"
      >
        {t("common.skipToContent")}
      </a>
      <SiteHeader />
      <main id="main-content" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </>
  )
}
