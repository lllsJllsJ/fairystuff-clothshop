import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { routing } from "@/i18n/routing"
import {
  ABOUT_STORY_EN,
  ABOUT_STORY_TH,
  BRAND_NAME,
  BRAND_TAGLINE_EN,
  BRAND_TAGLINE_TH,
} from "@/lib/brand"
import { ContactCta } from "@/components/shop/contact-cta"

export const revalidate = 300

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
    title: t("nav.about"),
    description: locale === "th" ? BRAND_TAGLINE_TH : BRAND_TAGLINE_EN,
    alternates: {
      languages: Object.fromEntries(routing.locales.map((l) => [l, `/${l}/about`])),
    },
  }
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  const tagline = locale === "th" ? BRAND_TAGLINE_TH : BRAND_TAGLINE_EN
  const story = locale === "th" ? ABOUT_STORY_TH : ABOUT_STORY_EN

  return (
    <>
      <section className="bg-primary">
        <div className="mx-auto max-w-[1440px] px-4 py-21 text-center sm:px-6 lg:px-8">
          <p className="text-subtitle font-bold text-white/80">{BRAND_NAME}</p>
          <h1 className="mt-2 text-h1 font-bold text-white">{t("nav.about")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-body text-white/90">{tagline}</p>
        </div>
      </section>

      <article className="mx-auto max-w-[720px] px-4 py-17 sm:px-6 lg:px-8">
        <p className="whitespace-pre-line text-body leading-relaxed text-foreground">{story}</p>
      </article>

      <ContactCta locale={locale} />
    </>
  )
}
