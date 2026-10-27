import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

type LocaleParams = { params: Promise<{ locale: string }> }

/**
 * `generateMetadata` for a page whose tab title is translated text — pass
 * several keys to join them ("Settings · Storefront"). Without one, a page
 * falls back to the brand-name default in `[locale]/layout.tsx`.
 */
export function titleMetadata(keys: string | string[], extra: Metadata = {}) {
  return async ({ params }: LocaleParams): Promise<Metadata> => {
    const { locale } = await params
    const t = await getTranslations({ locale })
    return { ...extra, title: [keys].flat().map((key) => t(key)).join(" · ") }
  }
}

export const NO_INDEX: Metadata = { robots: { index: false, follow: false } }
