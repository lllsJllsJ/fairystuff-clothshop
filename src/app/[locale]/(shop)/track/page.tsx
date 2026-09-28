import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { TrackLookupForm } from "@/components/track/track-lookup-form"
import { prerenderLocaleParams } from "@/lib/static-params"

export const revalidate = 300

// Static — this page has no per-request data, unlike `/track/[code]`. It is
// the entry point when a customer has lost the URL but still has the code
// sitting in their LINE chat, which is exactly where the design puts it.
export const metadata: Metadata = { robots: { index: false, follow: false } }

// Empty when the database is unreachable at build time — see lib/static-params.ts.
export const generateStaticParams = prerenderLocaleParams

export default async function TrackLookupPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("track")
  return (
    <div className="mx-auto max-w-md px-4 py-17">
      <h1 className="text-h2 font-bold">{t("lookupTitle")}</h1>
      <p className="mt-2 text-body text-muted-foreground">{t("lookupBody")}</p>
      <TrackLookupForm />
    </div>
  )
}
