import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { getShopSettings } from "@/db/queries/settings"
import { CheckoutForm } from "@/components/checkout/checkout-form"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function CheckoutPage() {
  const [settings, t] = await Promise.all([getShopSettings(), getTranslations("checkout")])
  return <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <h1 className="mb-6 text-h2 font-bold">{t("title")}</h1>
    <CheckoutForm
      contactReady={!!(settings.lineId || settings.instagramHandle || settings.facebookUrl)}
    />
  </div>
}
